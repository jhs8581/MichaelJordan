// ──────────────────────────────────────────────
// 사용자
// ──────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  email: string;
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
  createdAt: string;
  members: RoomMember[];
  messages?: Pick<Message, 'id' | 'content' | 'createdAt' | 'senderId'>[];
}

export interface RoomMember {
  userId: number;
  roomId: number;
  joinedAt: string;
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
  createdAt: string;
  sender?: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  reads?: MessageRead[];
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
  'user:status': (payload: { userId: number; isOnline: boolean }) => void;
  'room:joined': (room: Room) => void;
}

export interface ClientToServerEvents {
  'message:send': (payload: { roomId: number; content: string; fileUrl?: string }) => void;
  'message:read': (payload: { roomId: number; messageId: number }) => void;
  'room:join': (roomId: number) => void;
  'room:leave': (roomId: number) => void;
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
