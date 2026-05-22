import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

/**
 * Creates and returns a socket.io-client instance.
 * Using autoConnect: false allows the room page to manually control
 * when the socket connects (e.g. after mic permissions are granted).
 */
export const getSocket = () => {
  if (typeof window === 'undefined') return null;
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket'] // Force WebSockets for lower latency
  });
};
