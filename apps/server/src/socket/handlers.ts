import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ChatTheme, PushPayload } from '@chat/types';
import { prisma, nowKST } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { sendPushToUsers } from '../routes/push';
import { emitMessageUpdated } from '../lib/chat-io';
import { editMessageContent } from '../lib/message-edit';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// 광고 메시지 배열
const AD_MESSAGES = [
  '(광고) 한일 온라인 스토어 가열식 가습기 카본매트 엄마들의 선택 라이브 방송이 잠시 후 시작됩니다. (수신거부: 스토어홈 > 알림받기 해제)',
  '(광고) 신상품 및 인기상품 69% 할인 + 15% 쿠폰',
  '(광고) 오늘만 특가! 프리미엄 가전제품 최대 50% 할인 이벤트',
  '(광고) 🔥 타임특가 🔥 가습기/공기청정기 단독 특가 진행중',
  '(광고) 겨울 필수템! 전기장판 카본매트 70% 할인 + 무료배송',
  '(광고) 스마트홈 가전 패키지 구매 시 10만원 즉시 할인',
  '(광고) 신규회원 가입 시 5만원 쿠폰팩 증정! 지금 바로 확인하세요',
  '(광고) 오늘 23시까지! 깜짝 특가 상품 최저가 도전',
  '(광고) 베스트셀러 1위! 무선청소기 단독 특가 49,900원',
  '(광고) 주방가전 브랜드전 30~80% 할인 + 무이자 할부',
  '(광고) 🎁 첫 구매 고객 특별 혜택 🎁 적립금 5천원 즉시 지급',
  '(광고) 라이브 방송 중 구매 시 추가 10% 할인쿠폰 발급',
  '(광고) 겨울철 건강관리! 가습기/공기청정기 2+1 특가 이벤트',
  '(광고) 인기 브랜드 정품 직영몰 50% 할인 + 사은품 증정',
  '(광고) 실시간 구매후기 이벤트! 베스트 리뷰 선정 시 100% 환불',
  '(광고) 한파 대비 특별 기획전! 난방용품 최대 70% 할인',
  '(광고) 24시간 한정 특가! 프리미엄 침구세트 반값 기회',
  '(광고) 오늘의 추천상품 🌟 매일 바뀌는 특가 상품 확인하기',
  '(광고) 친구 초대 이벤트! 친구와 함께 쿠폰 받고 할인 받자',
  '(광고) 계절 대청소 특집! 청소/정리용품 모음전 최대 60% 할인',
  '(광고) 브랜드 빅세일! 인기 브랜드 단독 특가 모음',
  '(광고) 무료배송 + 당일배송 가능 상품 특별 모음전',
  '(광고) 월말정산 특가! 지금 구매하면 최대 15% 추가 할인',
  '(광고) 포인트 10배 적립 이벤트! 구매금액의 10% 돌려받기',
  '(광고) 럭키박스 이벤트! 구매 시 100% 당첨 경품 증정',
  '(광고) VIP 고객 전용 특가! 최대 80% 할인 혜택 놓치지 마세요',
  '(광고) 설 명절 준비! 가전/생활용품 대전 진행 중',
  '(광고) 앱 전용 특가! 앱에서만 만나는 초특가 상품',
  '(광고) 새벽배송 가능 상품 특가전! 오늘 주문 내일 아침 도착',
  '(광고) 인기상품 재입고 알림! 품절 대란 상품 지금 바로 구매',
];

// 랜덤 광고 메시지 선택 함수
function getRandomAdMessage(): string {
  return AD_MESSAGES[Math.floor(Math.random() * AD_MESSAGES.length)];
}

// 테마별 푸시 알림 페이로드 생성
function createThemePushPayload(roomId: number, theme?: ChatTheme | null): PushPayload {
  const adMessage = getRandomAdMessage();
  
  if (theme === 'naver') {
    return {
      title: 'NAVER 톡톡',
      body: `[네이버] ${adMessage}`,
      data: { roomId, theme: 'naver', icon: '💬' },
      tag: 'chat-message-naver',
      badge: '#03C75A', // Naver 초록색
    };
  }
  
  if (theme === 'oliveyoung') {
    return {
      title: 'OLIVE YOUNG',
      body: `[올리브영] ${adMessage}`,
      data: { roomId, theme: 'oliveyoung', icon: '🌿' },
      tag: 'chat-message-oliveyoung',
      badge: '#00C4B4', // 올리브영 민트색
    };
  }
  
  // SLR (기본)
  return {
    title: 'SLR 채팅',
    body: `[SLR] ${adMessage}`,
    data: { roomId, theme: 'slr', icon: '🔔' },
    tag: 'chat-message-slr',
    badge: '#5865f2', // Discord 보라색
  };
}

// 사용자별 알림 전송 플래그 (userId-roomId => 알림 전송됨 여부)
// 읽지 않은 알림이 있으면 추가 알림을 보내지 않음
const userNotificationSent = new Map<string, boolean>();

function normalizeTimeZone(value: string | null | undefined): string | undefined {
  const timeZone = (value ?? '').trim();
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat('ko-KR', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

function getLocalTimeForTimeZone(timeZone: string | undefined): string | undefined {
  if (!timeZone) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    return hour && minute ? `${hour}:${minute}` : undefined;
  } catch {
    return undefined;
  }
}

export function registerSocketHandlers(io: ChatServer) {
  // ── 인증 미들웨어 ─────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('인증 토큰이 없습니다.'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'changeme-min-32-chars-secret-key!') as unknown as { sub: number | string };
      // Number() 강제 변환: JWT sub가 string으로 디코딩될 경우에도 number로 보장
      (socket as ChatSocket & { userId: number }).userId = Number(payload.sub);
      next();
    } catch {
      next(new Error('유효하지 않은 토큰입니다.'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as ChatSocket & { userId: number }).userId;
    console.log(`🟢 연결: userId=${userId} socketId=${socket.id}`);

    // 온라인 상태 업데이트 및 브로드캐스트
    await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
    io.emit('user:status', { userId, isOnline: true });

    // 이 소켓에게 현재 온라인인 사용자 목록을 전송
    // (연결 시점 이전에 이미 온라인인 사용자 상태를 놓치지 않도록)
    const onlineUsers = await prisma.user.findMany({
      where: { isOnline: true, id: { not: userId } },
      select: { id: true },
    });
    for (const u of onlineUsers) {
      socket.emit('user:status', { userId: u.id, isOnline: true });
    }

    // 사용자가 속한 모든 채팅방에 자동 join
    const rooms = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
    for (const { roomId } of rooms) {
      socket.join(`room:${roomId}`);
    }

    // ── 채팅방 입장 ─────────────────────────────────────────────
    socket.on('room:join', async (roomId) => {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;
      socket.join(`room:${roomId}`);
    });

    // ── 채팅방 퇴장 ─────────────────────────────────────────────
    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // ── 채팅방 화면 보기 시작/종료 (푸시 제외 기준) ──────────────
    socket.on('room:viewing', (roomId) => {
      socket.join(`viewing:${roomId}`);
      // 사용자가 채팅방을 보기 시작하면 알림 플래그 해제 (다음 메시지부터 알림 전송 가능)
      const key = `${userId}-${roomId}`;
      userNotificationSent.delete(key);
    });
    socket.on('room:stop-viewing', (roomId) => {
      socket.leave(`viewing:${roomId}`);
    });

    // ── 타이핑 표시 ─────────────────────────────────────────────
    const typingTimers = new Map<number, ReturnType<typeof setTimeout>>();

    async function broadcastTyping(roomId: number, isTyping: boolean) {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;
      const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      socket.to(`room:${roomId}`).emit('typing:update', {
        roomId, userId, username: userInfo?.username ?? '', isTyping,
      });
    }

    socket.on('typing:start', ({ roomId }) => {
      // 기존 타이머 초기화 후 3초 후 자동 종료
      const existing = typingTimers.get(roomId);
      if (existing) clearTimeout(existing);
      broadcastTyping(roomId, true);
      typingTimers.set(roomId, setTimeout(() => {
        broadcastTyping(roomId, false);
        typingTimers.delete(roomId);
      }, 3000));
    });

    socket.on('typing:stop', ({ roomId }) => {
      const existing = typingTimers.get(roomId);
      if (existing) { clearTimeout(existing); typingTimers.delete(roomId); }
      broadcastTyping(roomId, false);
    });

    // ── 메시지 전송 ─────────────────────────────────────────────
    socket.on('message:send', async ({ roomId, content, fileUrl, replyToId, senderTimeZone, senderLocalTime }) => {
      // 멤버 권한 검증
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;

      // XSS 방지: 클라이언트 렌더링 시 dangerouslySetInnerHTML 사용 금지
      // 메시지는 텍스트로만 저장하고 렌더링은 이스케이프된 텍스트로 처리
      const sanitizedContent = content.trim();
      const userTimeZone = await prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true },
      });
      const normalizedSenderTimeZone = normalizeTimeZone(senderTimeZone)
        ?? normalizeTimeZone(userTimeZone?.timeZone)
        ?? normalizeTimeZone(process.env.DEFAULT_TIME_ZONE)
        ?? 'Asia/Seoul';
      const normalizedSenderLocalTime = typeof senderLocalTime === 'string' && /^\d{2}:\d{2}$/.test(senderLocalTime)
        ? senderLocalTime
        : getLocalTimeForTimeZone(normalizedSenderTimeZone);
      // 이미지 전용 메시지는 빈 content 허용
      if (!sanitizedContent && !fileUrl) return;

      let validReplyToId: number | undefined;
      if (replyToId) {
        const replyTarget = await prisma.message.findUnique({
          where: { id: replyToId },
          select: { id: true, roomId: true },
        });
        if (replyTarget && replyTarget.roomId === roomId) {
          validReplyToId = replyTarget.id;
        } else {
          console.warn('[message:send] invalid reply target');
        }
      }

      const message = await prisma.message.create({
        data: {
          roomId,
          senderId: userId,
          content: sanitizedContent,
          fileUrl,
          replyToId: validReplyToId,
          senderTimeZone: normalizedSenderTimeZone,
          senderLocalTime: normalizedSenderLocalTime,
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
          reads: true,
          replyTo: {
            select: {
              id: true,
              senderId: true,
              content: true,
              fileUrl: true,
              senderTimeZone: true,
              senderLocalTime: true,
              createdAt: true,
              sender: { select: { id: true, username: true, avatarUrl: true } },
            },
          },
        },
      });

      if (replyToId && !message.replyToId) {
        console.warn('[message:send] replyToId was requested but not persisted', {
          roomId,
          senderId: userId,
          requestedReplyToId: replyToId,
          validReplyToId,
          messageId: message.id,
        });
      }

      const payload = {
        id: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        content: message.content,
        fileUrl: message.fileUrl ?? undefined,
        replyToId: message.replyToId ?? undefined,
        senderTimeZone: message.senderTimeZone ?? undefined,
        senderLocalTime: message.senderLocalTime ?? undefined,
        createdAt: message.createdAt.toISOString(),
        sender: message.sender
          ? {
              id: message.sender.id,
              username: message.sender.username,
              avatarUrl: message.sender.avatarUrl ?? undefined,
            }
          : undefined,
        replyTo: message.replyTo
          ? {
              id: message.replyTo.id,
              senderId: message.replyTo.senderId,
              content: message.replyTo.content,
              fileUrl: message.replyTo.fileUrl ?? undefined,
              senderTimeZone: message.replyTo.senderTimeZone ?? undefined,
              senderLocalTime: message.replyTo.senderLocalTime ?? undefined,
              createdAt: message.replyTo.createdAt.toISOString(),
              sender: message.replyTo.sender
                ? {
                    id: message.replyTo.sender.id,
                    username: message.replyTo.sender.username,
                    avatarUrl: message.replyTo.sender.avatarUrl ?? undefined,
                  }
                : undefined,
            }
          : undefined,
        reads: message.reads.map((r) => ({
          messageId: r.messageId,
          userId: r.userId,
          readAt: r.readAt.toISOString(),
        })),
      };

      io.to(`room:${roomId}`).emit('message:new', payload);

      // 지금 이 채팅방을 화면에 띄워서 보고 있는 유저 (실시간으로 읽는 중)
      const viewingSockets = await io.in(`viewing:${roomId}`).fetchSockets();
      const viewingUserIds = new Set(
        viewingSockets.map((s) => Number((s as unknown as { userId: number }).userId)),
      );

      // 방 멤버 중 발신자 제외 + 지금 이 방을 보고 있지 않은 사람에게 푸시
      const allMembers = await prisma.roomMember.findMany({
        where: { roomId },
        select: { userId: true, isMuted: true },
      });
      
      // 현재 방을 보고 있는 사용자는 자동 읽음 처리 + 플래그 해제
      // (UI가 업데이트되지 않거나 네트워크 지연으로 message:read가 안 올 경우 대비)
      for (const viewingUserId of viewingUserIds) {
        if (viewingUserId !== userId) {
          try {
            // 읽음 처리 기록
            await prisma.messageRead.upsert({
              where: { messageId_userId: { messageId: message.id, userId: viewingUserId } },
              create: { messageId: message.id, userId: viewingUserId, readAt: nowKST() },
              update: { readAt: nowKST() },
            });
            // 알림 플래그 해제 (다음 메시지부터 알림 받음)
            const key = `${viewingUserId}-${roomId}`;
            userNotificationSent.delete(key);
          } catch (err) {
            console.error(`[AUTO-READ] 자동 읽음 처리 실패 userId=${viewingUserId}:`, err);
          }
        }
      }
      
      const pushTargetIds = allMembers
        .filter((m) => m.userId !== userId && !viewingUserIds.has(m.userId) && !m.isMuted)
        .map((m) => m.userId);

      // 이미 알림을 받았고 아직 읽지 않은 사용자는 제외
      const finalTargetIds = pushTargetIds.filter((targetUserId) => {
        const key = `${targetUserId}-${roomId}`;
        return !userNotificationSent.get(key); // 알림이 전송되지 않았으면 true
      });

      // 푸시 알림 디버깅 로그
      console.log('[PUSH DEBUG]', {
        roomId,
        senderId: userId,
        allMemberCount: allMembers.length,
        viewingUserIds: Array.from(viewingUserIds),
        mutedUsers: allMembers.filter(m => m.isMuted).map(m => m.userId),
        pushTargetIds,
        finalTargetIds,
        skippedDueToUnread: pushTargetIds.filter(id => !finalTargetIds.includes(id)),
      });

      if (finalTargetIds.length > 0) {
        // 받는사람들의 테마 조회 (DB에 저장된 각 사용자의 preferences)
        const userThemes = await prisma.user.findMany({
          where: { id: { in: finalTargetIds } },
          select: { id: true, chatTheme: true },
        });
        const themeMap = new Map<number, string>(userThemes.map(u => [u.id, u.chatTheme]));
        
        // 사용자별로 그들의 테마로 맞춤형 푸시 알람 발송
        for (const targetUserId of finalTargetIds) {
          try {
            const theme = (themeMap.get(targetUserId) ?? 'slr') as ChatTheme;
            const pushPayload = createThemePushPayload(roomId, theme);
            sendPushToUsers([targetUserId], pushPayload);
            console.log(`[PUSH-THEME] userId=${targetUserId} theme=${theme} roomId=${roomId}`);
            
            const key = `${targetUserId}-${roomId}`;
            userNotificationSent.set(key, true);
          } catch (err) {
            console.error(`[PUSH-ERROR] userId=${targetUserId}:`, err);
          }
        }
      }
    });

    // ── 메시지 삭제 ───────────────────────────────────────────────
    // ── 메시지 수정 ───────────────────────────────────────────────
    socket.on('message:edit', async ({ messageId, content }) => {
      try {
        const result = await editMessageContent({ messageId, userId, content });
        if (!result.ok) {
          console.warn('[message:edit] edit rejected:', result.error, { messageId, userId });
          return;
        }
        emitMessageUpdated(result.data);
      } catch (err) {
        console.error('[message:edit] unexpected error', err);
      }
    });

    // ── 메시지 삭제 ───────────────────────────────────────────────
    socket.on('message:delete', async ({ messageId }) => {
      const message = await prisma.message.findUnique({ where: { id: messageId } });
      if (!message) return;
      // 본인 메시지만 삭제 가능
      if (message.senderId !== userId) return;
      // 멤버 검증 (IDOR 방지)
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId: message.roomId } },
      });
      if (!member) return;

      await prisma.message.delete({ where: { id: messageId } });
      io.to(`room:${message.roomId}`).emit('message:deleted', { messageId, roomId: message.roomId });
    });

    // ── 읽음 처리 ──────────────────────────────────────────────
    socket.on('message:read', async ({ roomId, messageId }) => {
      await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, readAt: nowKST() },
        update: { readAt: nowKST() },
      });

      // 메시지 읽음 처리 → 해당 방에 대한 알림 차단 플래그 해제
      // (다음 메시지가 오면 푸시 알림 수신 가능하도록)
      const key = `${userId}-${roomId}`;
      userNotificationSent.delete(key);
      console.log(`[READ] userId=${userId} roomId=${roomId} 알림 플래그 해제`);

      io.to(`room:${roomId}`).emit('message:read', {
        roomId,
        userId,
        lastReadMessageId: messageId,
      });
    });

    // ── 연결 해제 ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔴 연결 해제: userId=${userId}`);
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false, lastSeenAt: nowKST() },
      });
      io.emit('user:status', { userId, isOnline: false });
    });
  });
}
