import { prisma } from './prisma';

type EditMessageError = 'EMPTY_CONTENT' | 'NOT_FOUND' | 'FORBIDDEN';

export type EditMessageResult =
  | {
      ok: true;
      data: {
        roomId: number;
        messageId: number;
        content: string;
      };
    }
  | {
      ok: false;
      error: EditMessageError;
    };

export async function editMessageContent({
  messageId,
  userId,
  content,
}: {
  messageId: number;
  userId: number;
  content: string;
}): Promise<EditMessageResult> {
  const sanitizedContent = content.trim();
  if (!sanitizedContent) {
    return { ok: false, error: 'EMPTY_CONTENT' };
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, roomId: true, senderId: true },
  });
  if (!message) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (message.senderId !== userId) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId: message.roomId } },
  });
  if (!member) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { content: sanitizedContent },
  });

  return {
    ok: true,
    data: {
      roomId: message.roomId,
      messageId,
      content: sanitizedContent,
    },
  };
}
