import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
