import type { ClientToServerEvents, ServerToClientEvents } from '@chat/types';
import type { Server } from 'socket.io';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents>;

let chatIo: ChatServer | null = null;

export function setChatIo(io: ChatServer) {
  chatIo = io;
}

export function emitMessageUpdated(payload: { roomId: number; messageId: number; content: string }) {
  chatIo?.to(`room:${payload.roomId}`).emit('message:updated', payload);
}
