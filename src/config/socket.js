import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    socket.join(`user:${userId}`);

    socket.on("disconnect", () => {});
  });

  return io;
}

export function getIo() {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  return io;
}