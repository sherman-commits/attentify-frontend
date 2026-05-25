// socket.ts
import { io, Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
  API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:8000";

let socket: Socket;

export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"], // force websocket
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error("Socket not initialized. Call initSocket() first.");
  }
  return socket;
};
