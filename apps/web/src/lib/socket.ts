import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';
import { useAuthStore } from '@/store/auth';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(_token?: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    // Vercel 배포: NEXT_PUBLIC_SOCKET_URL 미설정 시 같은 도메인(rewrites) 사용
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    socket = io(socketUrl, {
      // 콜백 형식: 매번 재연결 시도 시 스토어에서 최신 토큰을 읽어 사용
      auth: (cb) => {
        const token = useAuthStore.getState().accessToken ?? '';
        cb({ token });
      },
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 1800,
      randomizationFactor: 0.25,
      timeout: 7000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
