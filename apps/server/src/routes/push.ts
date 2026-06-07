import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

function initVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (pub && priv) {
    webpush.setVapidDetails(subj, pub, priv);
    console.log('[VAPID] 키가 로드되었습니다');
    return true;
  }
  console.warn('[VAPID] 키가 설정되지 않았습니다. 푸시 알림이 비활성화됩니다.');
  return false;
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  // VAPID 초기화 (서버 시작 후 env 로드 완료 시점에 실행)
  initVapid();

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
  if (!initVapid()) {
    console.warn('[PUSH] VAPID 키 없음 - 푸시 발송 중단');
    return; // VAPID 키 없으면 푸시 스킵
  }
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  console.log(`[PUSH] ${userIds.length}명에게 푸시 발송 시도 (구독: ${subs.length}개)`);

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
