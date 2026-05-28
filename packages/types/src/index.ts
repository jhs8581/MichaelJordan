// ──────────────────────────────────────────────
// 사용자
// ──────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  email: string;
  chatLockCode?: string;
  avatarUrl?: string;
  isOnline: boolean;
  createdAt: string;
}

// ──────────────────────────────────────────────
// 채팅방
// ──────────────────────────────────────────────
export interface Room {
  id: number;
  name: string;
  isGroup: boolean;          // true = 그룹 채널, false = 1:1 DM
  isMuted: boolean;          // 현재 사용자의 이 방 알림 음소거 여부
  isArchive?: boolean;       // true = 나의 보관함 (개인 저장 방)
  createdAt: string;
  members: RoomMember[];
  messages?: Pick<Message, 'id' | 'content' | 'createdAt' | 'senderId'>[];
}

export interface RoomMember {
  userId: number;
  roomId: number;
  joinedAt: string;
  isMuted: boolean;
  user?: User;
}

// ──────────────────────────────────────────────
// 메시지
// ──────────────────────────────────────────────
export interface Message {
  id: number;
  roomId: number;
  senderId: number;
  content: string;
  fileUrl?: string;
  replyToId?: number;
  replyTo?: MessageReplyPreview;
  senderTimeZone?: string;
  createdAt: string;
  sender?: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  reads?: MessageRead[];
}

export interface MessageReplyPreview {
  id: number;
  senderId: number;
  content: string;
  fileUrl?: string;
  senderTimeZone?: string;
  createdAt: string;
  sender?: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface MessageRead {
  messageId: number;
  userId: number;
  readAt: string;
}

// ──────────────────────────────────────────────
// Socket.io 이벤트 페이로드
// ──────────────────────────────────────────────
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:read': (payload: { roomId: number; userId: number; lastReadMessageId: number }) => void;
  'message:deleted': (payload: { messageId: number; roomId: number }) => void;
  'user:status': (payload: { userId: number; isOnline: boolean }) => void;
  'room:joined': (room: Room) => void;
  'typing:update': (payload: { roomId: number; userId: number; username: string; isTyping: boolean }) => void;
}

export interface ClientToServerEvents {
  'message:send': (payload: { roomId: number; content: string; fileUrl?: string; replyToId?: number; senderTimeZone?: string }) => void;
  'message:read': (payload: { roomId: number; messageId: number }) => void;
  'message:delete': (payload: { messageId: number }) => void;
  'room:join': (roomId: number) => void;
  'room:leave': (roomId: number) => void;
  'room:viewing': (roomId: number) => void;
  'room:stop-viewing': (roomId: number) => void;
  'typing:start': (payload: { roomId: number }) => void;
  'typing:stop': (payload: { roomId: number }) => void;
}

// ──────────────────────────────────────────────
// API 응답 공통 형태
// ──────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ──────────────────────────────────────────────
// 인증
// ──────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}
