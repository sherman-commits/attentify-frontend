// socket.ts
import { io, Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
  API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:8000";

let socket: Socket | null = null;

export const initSocket = () => {
  if (socket?.connected) {
    return socket;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    console.warn("Socket.IO: No auth token found, connection will fail");
  }

  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    auth: {
      token: token || "",
    },
  });

  socket.on("connect_error", (err) => {
    console.error("Socket.IO connection error:", err.message);
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error("Socket not initialized. Call initSocket() first.");
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
