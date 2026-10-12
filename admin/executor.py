import sys
import time
import json
from pathlib import Path

with open("../uploads/Hayk970.txt" , "r" , encoding="utf-8") as f:
    text = f.read().strip().rstrip(",")

    events = json.loads(f"[{text}]")
    for event in events:
    #    time.sleep(event["time"])
       key = event["key"]

       if key == "backspace":
           sys.stdout.write("\b \b")
       elif key == "space":
           sys.stdout.write(" ")
       elif key == "enter":
           sys.stdout.write("\n")
       elif len(key) == 1:
           sys.stdout.write(key)
       else:
           sys.stdout.write(f"\n*{key}*\n")
        
       sys.stdout.flush()

