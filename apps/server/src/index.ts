import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';

import { prisma } from './lib/prisma';
import { authRoutes } from './routes/auth';
import { roomRoutes } from './routes/rooms';
import { messageRoutes } from './routes/messages';
import { userRoutes } from './routes/users';
import { pushRoutes, sendPushToUsers } from './routes/push';
import { scheduleRoutes } from './routes/schedules';
import { postRoutes } from './routes/posts';
import { registerSocketHandlers } from './socket/handlers';
import { setChatIo } from './lib/chat-io';

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map(s => s.trim());

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (CORS_ORIGIN.includes(origin)) return true;
  // vercel.app 서브도메인 전체 허용
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  // localhost 허용
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

async function main() {
  const app = Fastify({ logger: true });

  // ── Plugins ────────────────────────────────────────────────────
  await app.register(cors, {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'changeme-min-32-chars-secret-key!',
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (동영상 지원)
  });

  // ── Routes ─────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(roomRoutes, { prefix: '/api/rooms' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(pushRoutes, { prefix: '/api/push' });
  await app.register(scheduleRoutes, { prefix: '/api/schedules' });
  await app.register(postRoutes, { prefix: '/api/posts' });

  app.get('/health', async () => ({
    ok: true,
    build: 'message-timezone-v3',
  }));

  // ── ready 후 app.server로 Socket.io 연결 ──────────────────────
  await app.ready();

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: CORS_ORIGIN, credentials: true },
  });

  setChatIo(io);
  registerSocketHandlers(io);

  // ── Start ──────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`✅  Server running on http://0.0.0.0:${PORT}`);

  // ── 일정 알람 스케줄러 (1분마다 확인) ───────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const dueSchedules = await prisma.schedule.findMany({
        where: { scheduledAt: { gte: oneMinuteAgo, lte: now }, notified: false },
      });
      if (dueSchedules.length === 0) return;

      const allUsers = await prisma.user.findMany({ select: { id: true } });
      const userIds = allUsers.map((u) => u.id);

      for (const schedule of dueSchedules) {
        await sendPushToUsers(userIds, {
          type: 'schedule',
          title: '📅 일정 알람',
          body: schedule.title,
          scheduleId: schedule.id,
        });
        await prisma.schedule.update({ where: { id: schedule.id }, data: { notified: true } });
      }
    } catch (err) {
      console.error('일정 알람 오류:', err);
    }
  }, 60 * 1000);
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
