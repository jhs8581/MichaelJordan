import { PrismaClient } from '@prisma/client';

// 개발 환경에서 핫 리로드 시 인스턴스 중복 생성 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
