import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
  }
}
