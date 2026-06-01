import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime(),
  isAllDay: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  isAllDay: z.boolean().optional(),
});

export async function scheduleRoutes(app: FastifyInstance) {
  // 인증 필요
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: '인증 필요' });
    }
  });

  // 일정 목록 조회
  app.get('/', async (req, reply) => {
    const schedules = await prisma.schedule.findMany({
      orderBy: { scheduledAt: 'asc' },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    return reply.send({ success: true, data: { schedules } });
  });

  // 일정 생성
  app.post('/', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);

    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류', details: body.error.flatten() });

    const { title, description, scheduledAt, isAllDay } = body.data;
    const schedule = await prisma.schedule.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        scheduledAt: new Date(scheduledAt),
        isAllDay,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    return reply.status(201).send({ success: true, data: { schedule } });
  });

  // 일정 수정
  app.patch('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const scheduleId = Number((req.params as { id: string }).id);

    const existing = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!existing) return reply.status(404).send({ error: '일정을 찾을 수 없습니다' });
    if (existing.createdById !== userId) return reply.status(403).send({ error: '권한 없음' });

    const body = updateSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류' });

    const data: Record<string, unknown> = {};
    if (body.data.title !== undefined) data.title = body.data.title.trim();
    if (body.data.description !== undefined) data.description = body.data.description?.trim() ?? null;
    if (body.data.scheduledAt !== undefined) { data.scheduledAt = new Date(body.data.scheduledAt); data.notified = false; }
    if (body.data.isAllDay !== undefined) data.isAllDay = body.data.isAllDay;

    const schedule = await prisma.schedule.update({
      where: { id: scheduleId },
      data,
      include: { createdBy: { select: { id: true, username: true } } },
    });
    return reply.send({ success: true, data: { schedule } });
  });

  // 일정 삭제
  app.delete('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const scheduleId = Number((req.params as { id: string }).id);

    const existing = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!existing) return reply.status(404).send({ error: '일정을 찾을 수 없습니다' });
    if (existing.createdById !== userId) return reply.status(403).send({ error: '권한 없음' });

    await prisma.schedule.delete({ where: { id: scheduleId } });
    return reply.send({ success: true });
  });
}
