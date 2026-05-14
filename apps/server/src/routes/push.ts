import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? '',
);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  // VAPID 공개 키 반환
  app.get('/vapid-public-key', async (_req, reply) => {
    return reply.send({ key: process.env.VAPID_PUBLIC_KEY ?? '' });
  });

  // 구독 등록
  app.post('/subscribe', async (req, reply) => {
    await req.jwtVerify();
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);

    const body = subscribeSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '잘못된 구독 정보' });

    const { endpoint, keys } = body.data;

    // 동일 endpoint 중복 방지 (SQL Server NVarChar(Max)는 unique index 불가)
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    await prisma.pushSubscription.create({
      data: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    return reply.status(201).send({ ok: true });
  });

  // 구독 해제
  app.delete('/subscribe', async (req, reply) => {
    await req.jwtVerify();
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const { endpoint } = (req.body ?? {}) as { endpoint?: string };
    if (!endpoint) return reply.status(400).send({ error: 'endpoint 필요' });

    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return reply.send({ ok: true });
  });
}

// 특정 userId들에게 푸시 알림 발송 (handlers.ts에서 사용)
export async function sendPushToUsers(userIds: number[], payload: object) {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
      ).catch(() => {
        // 만료된 구독은 삭제
        prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }),
    ),
  );
  return results;
}
