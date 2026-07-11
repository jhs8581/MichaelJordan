'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import type { Message, Room } from '@chat/types';
import { MessageBubble, renderMessageContent } from './MessageBubble';
import { RoomInfoPanel } from './RoomInfoPanel';

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      notify?: (payload: { title: string; body: string; theme?: 'slr' | 'naver' | 'oliveyoung' }) => void;
    };
  }
}

interface Props {
  roomId: number;
  onLeave?: () => void;
  onImageView?: (url: string, imageList: RoomImageItem[], options?: ImageViewOptions) => void;
  naverTheme?: boolean;
  naverDark?: boolean;
  oyTheme?: boolean;
  oyDark?: boolean;
  backInterceptorRef?: React.MutableRefObject<(() => boolean) | null>;
}

type RoomImageItem = {
  url: string;
  createdAt?: string;
};

type ImageViewOptions = {
  showGrid?: boolean;
};

type ChatViewMode = 'bubble' | 'memo';
type TimeFormatMode = 'ampm' | '24h';
type LockDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

const LOCK_DIGITS: LockDigit[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const TIME_ZONE_OPTIONS = [
  { value: '', label: '기기 자동 (괄호 시간: 한국)' },
  { value: 'Asia/Seoul', label: '한국 - 서울' },
  { value: 'Asia/Kolkata', label: '인도 - 콜카타' },
  { value: 'Asia/Ho_Chi_Minh', label: '베트남 - 호치민' },
  { value: 'Asia/Bangkok', label: '태국 - 방콕' },
  { value: 'Europe/Warsaw', label: '폴란드 - 바르샤바' },
  { value: 'Europe/London', label: '영국 - 런던' },
  { value: 'Europe/Paris', label: '프랑스/독일 - 중부유럽' },
  { value: 'America/New_York', label: '미국 - 뉴욕' },
  { value: 'America/Los_Angeles', label: '미국 - LA' },
  { value: 'Asia/Tokyo', label: '일본 - 도쿄' },
] as const;

const ROOM_TIME_ZONE_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'Asia/Kolkata', label: '인도 - 콜카타' },
  { value: 'Asia/Ho_Chi_Minh', label: '베트남 - 호치민' },
  { value: 'Asia/Bangkok', label: '태국 - 방콕' },
  { value: 'Europe/Warsaw', label: '폴란드 - 바르샤바' },
  { value: 'Europe/London', label: '영국 - 런던' },
  { value: 'Europe/Paris', label: '프랑스/독일 - 중부유럽' },
  { value: 'America/New_York', label: '미국 - 뉴욕' },
  { value: 'America/Los_Angeles', label: '미국 - LA' },
  { value: 'Asia/Tokyo', label: '일본 - 도쿄' },
] as const;

type ChatViewSettings = {
  viewMode: ChatViewMode;
  timeFormat: TimeFormatMode;
  showNickname: boolean;
  showDateSeparator: boolean;
};

function getLocalTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getSenderLocalTime(timeZone?: string): string {
  const now = new Date();
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const hour = parts.find((part) => part.type === 'hour')?.value;
      const minute = parts.find((part) => part.type === 'minute')?.value;
      if (hour && minute) return `${hour}:${minute}`;
    } catch {
      // 잘못된 시간대면 기기 시간으로 fallback
    }
  }
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getMessageSendMeta(preferredTimeZone?: string) {
  const senderTimeZone = preferredTimeZone || getLocalTimeZone();
  return {
    senderTimeZone,
    senderLocalTime: getSenderLocalTime(senderTimeZone),
  };
}

function getValidTimeZone(timeZone?: string): string | undefined {
  if (!timeZone?.trim()) return undefined;
  try {
    Intl.DateTimeFormat('ko-KR', { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

function sortImagesNewestFirst(items: RoomImageItem[]): RoomImageItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function formatCurrentTimeForZone(timeZone: string): string {
  try {
    return new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
  } catch {
    return '--:--';
  }
}

const DEFAULT_SETTINGS: ChatViewSettings = {
  viewMode: 'bubble',
  timeFormat: 'ampm',
  showNickname: true,
  showDateSeparator: true,
};

const DEFAULT_VIEWER_TIME_ZONE = 'Asia/Seoul';

function loadChatViewSettings(): ChatViewSettings {
  try {
    const raw = localStorage.getItem('chat-view-settings');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatViewSettings>;
    return {
      viewMode: parsed.viewMode === 'memo' ? 'memo' : 'bubble',
      timeFormat: parsed.timeFormat === '24h' ? '24h' : 'ampm',
      showNickname: typeof parsed.showNickname === 'boolean' ? parsed.showNickname : true,
      showDateSeparator: typeof parsed.showDateSeparator === 'boolean' ? parsed.showDateSeparator : true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function ChatWindow({ roomId, onLeave, onImageView, naverTheme, naverDark, oyTheme, oyDark, backInterceptorRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [lockCodeInput, setLockCodeInput] = useState('');
  const [lockCodeSaving, setLockCodeSaving] = useState(false);
  const [lockCodeMsg, setLockCodeMsg] = useState('');
  const [timeZoneSaving, setTimeZoneSaving] = useState(false);
  const [timeZoneMsg, setTimeZoneMsg] = useState('');
  const [roomTimeZoneSaving, setRoomTimeZoneSaving] = useState(false);
  const [roomTimeZoneMsg, setRoomTimeZoneMsg] = useState('');
  const rooms = useChatStore((s) => s.rooms);
  const removeRoom = useChatStore((s) => s.removeRoom);
  const setRoomMuted = useChatStore((s) => s.setRoomMuted);
  const messages = useChatStore((s) => s.messages[roomId] ?? []);
  const addMessage = useChatStore((s) => s.addMessage);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const setMessages = useChatStore((s) => s.setMessages);
  const markRead = useChatStore((s) => s.markRead);
  const clearRoomUnread = useChatStore((s) => s.clearRoomUnread);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setRooms = useChatStore((s) => s.setRooms);

  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<ChatViewSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  // 검색 패널
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isContentUnlocked, setIsContentUnlocked] = useState(() => !((useAuthStore.getState().user?.chatLockCode ?? '').trim().length > 0));
  const [lockEntry, setLockEntry] = useState('');
  const [lockError, setLockError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [pendingPasteImage, setPendingPasteImage] = useState<{ file: File; url: string } | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imageCollectionLoading, setImageCollectionLoading] = useState(false);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);

  // roomInfoOpen 변경 시 backInterceptorRef 갱신 + 히스토리 항목 push
  useEffect(() => {
    if (backInterceptorRef) {
      backInterceptorRef.current = roomInfoOpen ? () => { setRoomInfoOpen(false); return true; } : null;
    }
    if (roomInfoOpen) {
      history.pushState({ _chat: true }, '', window.location.href);
    }
  }, [roomInfoOpen, backInterceptorRef]);
  const [muteSaving, setMuteSaving] = useState(false);
  const [muteOverride, setMuteOverride] = useState<boolean | null>(null);
  const [socketDisconnected, setSocketDisconnected] = useState(false);
  const [contextMenu, setContextMenu] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const [partialCopyMessage, setPartialCopyMessage] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [archiveRoomId, setArchiveRoomId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  // 게시글 등록 (from message)
  const [postFromMsg, setPostFromMsg] = useState<Message | null>(null);
  const [postMsgTitle, setPostMsgTitle] = useState('');
  const [postMsgSaving, setPostMsgSaving] = useState(false);
  // 이전 메시지 페이지네이션
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // 타이핑 중인 사용자 목록 { userId, username }
  const [typingUsers, setTypingUsers] = useState<{ userId: number; username: string }[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const partialCopyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const allRoomImagesRef = useRef<RoomImageItem[] | null>(null);
  const pendingRepliesRef = useRef<Array<{ roomId: number; content: string; replyToId: number; replyTo: Message['replyTo'] }>>([]);
  const [pendingScrollTo, setPendingScrollTo] = useState<number | null>(null);

  const activeRoom = rooms.find((r) => r.id === roomId);
  const isRoomMuted = muteOverride ?? Boolean(activeRoom?.isMuted);
  const lockCode = (user?.chatLockCode ?? '').trim();
  const canLock = lockCode.length > 0;
  const roomTimeZone1 = getValidTimeZone(activeRoom?.roomTimeZone1) ?? undefined;
  const roomTimeZone2 = getValidTimeZone(activeRoom?.roomTimeZone2) ?? undefined;
  const roomTimeZone1Label = ROOM_TIME_ZONE_OPTIONS.find((option) => option.value === roomTimeZone1)?.label ?? roomTimeZone1;
  const roomTimeZone2Label = ROOM_TIME_ZONE_OPTIONS.find((option) => option.value === roomTimeZone2)?.label ?? roomTimeZone2;

  useEffect(() => {
    setMuteOverride(null);
  }, [roomId, activeRoom?.isMuted]);

  useEffect(() => {
    setRoomTimeZoneMsg('');
  }, [roomId]);

  useEffect(() => {
    setNextCursor(null);
    setReplyTarget(null);
    setEditingMessage(null);
    setEditContent('');
    setRoomInfoOpen(false);
    allRoomImagesRef.current = null;
    api
      .get<{ data: { messages: Message[]; nextCursor: number | null } }>(`/messages/${roomId}`)
      .then((res) => {
        const msgs = res.data.data.messages;
        setMessages(roomId, msgs);
        setNextCursor(res.data.data.nextCursor);
        // 채팅방 열 때 즉시 미읽음 배지 제거 + 서버에 읽음 처리 전송
        clearRoomUnread(roomId);
        if (msgs.length > 0 && accessToken) {
          const socket = getSocket();
          socket.emit('message:read', { roomId, messageId: msgs[msgs.length - 1].id });
        }
      });
  }, [roomId, setMessages, accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    api
      .get<{ data: { id: number; email: string; username: string; chatLockCode?: string; avatarUrl?: string; timeZone?: string; isOnline: boolean; createdAt: string } }>('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => {
        // 인증 만료 등은 기존 인터셉터에서 처리
      });
  }, [accessToken, setUser]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('room:join', roomId);
    // 이 채팅방을 실제로 보고 있을 때만 서버에 알림 → 이 방의 푸시 알림 수신 제외
    // 앱/탭이 백그라운드가 되면 열린 채팅방이라도 미사용 상태로 보고 푸시를 받게 함
    function isPageActive() {
      // document.hasFocus()는 Android Chrome에서 포어그라운드임에도 false를 반환하는 경우가 많아
      // visibilityState만으로 판단 (백그라운드/잠금화면에서는 'hidden'이 됨)
      return document.visibilityState === 'visible';
    }

    function emitViewingState() {
      if (isPageActive()) {
        socket.emit('room:viewing', roomId);
        // 페이지 복귀 시 현재 로드된 메시지 중 최신 것까지 읽음 처리
        const msgs = useChatStore.getState().messages[roomId];
        if (msgs && msgs.length > 0) {
          const maxId = Math.max(...msgs.map((m) => m.id));
          socket.emit('message:read', { roomId, messageId: maxId });
          console.log(`[VIEWING] room:viewing+message:read 발송 roomId=${roomId} maxMsgId=${maxId}`);
        } else {
          console.log(`[VIEWING] 로드된 메시지 없음 roomId=${roomId}`);
        }
      } else {
        socket.emit('room:stop-viewing', roomId);
        console.log(`[STOP-VIEWING] 페이지 백그라운드 roomId=${roomId}`);
      }
    }

    function emitStopViewing() {
      socket.emit('room:stop-viewing', roomId);
    }

    emitViewingState();

    // 재연결 성공 → 방 재입장 + 연결 끊김 배너 숨김
    function onConnect() {
      setSocketDisconnected(false);
      socket.emit('room:join', roomId);
      emitViewingState();
    }
    // 연결 끊김 → 배너 표시
    function onDisconnect() {
      setSocketDisconnected(true);
    }
    // 인증 오류로 연결 실패 → HTTP 호출로 토큰 갱신 트리거
    function onConnectError(err: Error) {
      const msg = err.message ?? '';
      const isAuthError = msg.includes('토큰') || msg.includes('auth') || msg.includes('jwt') || msg.includes('expired') || msg.includes('인증');
      if (isAuthError) {
        // HTTP 인터셉터가 자동으로 토큰 갱신 → socket auth 콜백이 새 토큰을 사용해 재연결
        api.get('/auth/me').catch(() => { /* refresh 실패 시 /login 리다이렉트는 인터셉터가 처리 */ });
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    document.addEventListener('visibilitychange', emitViewingState);
    window.addEventListener('focus', emitViewingState);
    window.addEventListener('blur', emitStopViewing);
    window.addEventListener('pagehide', emitStopViewing);
    window.addEventListener('pageshow', emitViewingState);

    socket.on('message:new', (msg) => {
      if (msg.roomId !== roomId) return;
      const isOwnMessage = msg.senderId === user?.id;
      let nextMsg = msg;
      if (!nextMsg.replyTo && isOwnMessage) {
        const pendingIndex = pendingRepliesRef.current.findIndex((pending) =>
          pending.roomId === nextMsg.roomId
          && pending.content === nextMsg.content
          && (!nextMsg.replyToId || pending.replyToId === nextMsg.replyToId)
        );
        if (pendingIndex >= 0) {
          const [pending] = pendingRepliesRef.current.splice(pendingIndex, 1);
          nextMsg = { ...nextMsg, replyToId: pending.replyToId, replyTo: pending.replyTo };
        }
      }
      addMessage(roomId, nextMsg);
      // 새 이미지 메시지가 오면 이미지 목록 캐시 무효화
      if (nextMsg.fileUrl && !/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(nextMsg.fileUrl)) {
        allRoomImagesRef.current = null;
      }
      if (!isOwnMessage && window.electronAPI?.isElectron && document.visibilityState !== 'visible') {
        const isImageOnly = !nextMsg.content?.trim() && !!nextMsg.fileUrl;
        const theme = oyTheme ? 'oliveyoung' : naverTheme ? 'naver' : 'slr';
        const senderName = nextMsg.sender?.username?.trim() || '새 메시지';
        const roomName = activeRoom?.name?.trim() || '채팅방';
        const body = isImageOnly ? `${senderName}: 사진을 보냈습니다` : `${senderName}: ${nextMsg.content}`;
        window.electronAPI.notify?.({ title: roomName, body, theme });
      }
      // 페이지가 활성 상태일 때만 읽음 처리 (백그라운드/잠금화면이면 포커스 복귀 시 처리됨)
      if (isPageActive()) {
        clearRoomUnread(roomId);
        // 새로운 메시지 수신 시 읽음 처리
        socket.emit('message:read', { roomId, messageId: msg.id });
        console.log(`[MESSAGE:RECEIVED] 메시지 읽음 처리 전송 messageId=${msg.id}`);
      }
    });
    socket.on('message:read', ({ roomId: rId, userId, lastReadMessageId }) => {
      markRead(rId, userId, lastReadMessageId);
    });
    socket.on('message:updated', ({ roomId: rId, messageId, content }) => {
      updateMessage(rId, messageId, content);
    });
    socket.on('typing:update', ({ roomId: rId, userId: uid, username, isTyping }) => {
      if (rId !== roomId || uid === user?.id) return;
      setTypingUsers((prev) =>
        isTyping
          ? prev.some((u) => u.userId === uid) ? prev : [...prev, { userId: uid, username }]
          : prev.filter((u) => u.userId !== uid)
      );
    });
    socket.on('message:deleted', ({ messageId, roomId: rId }) => {
      if (rId === roomId) removeMessage(rId, messageId);
    });
    return () => {
      // 채팅창 닫힘 → 더 이상 이 방을 보고 있지 않음, 푸시 다시 받기
      socket.emit('room:stop-viewing', roomId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      document.removeEventListener('visibilitychange', emitViewingState);
      window.removeEventListener('focus', emitViewingState);
      window.removeEventListener('blur', emitStopViewing);
      window.removeEventListener('pagehide', emitStopViewing);
      window.removeEventListener('pageshow', emitViewingState);
      socket.off('message:new');
      socket.off('message:read');
      socket.off('message:updated');
      socket.off('typing:update');
      socket.off('message:deleted');
    };
  }, [roomId, accessToken, addMessage, clearRoomUnread, markRead, removeMessage, updateMessage, user?.id, naverTheme, oyTheme, activeRoom?.name]);

  // 새 메시지가 오면 맨 아래로 (단, 이미 거의 아래에 있을 때만 → 위 스크롤 중에는 유지)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // roomId가 바뀔 때마다 "아직 초기 스크롤 안 했음" 으로 리셋
  const hasScrolledToBottom = useRef(false);
  useEffect(() => {
    hasScrolledToBottom.current = false;
  }, [roomId]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // 검색 결과로 특정 메시지 이동 대기 중
    if (pendingScrollTo !== null) {
      const targetEl = messageRefs.current[pendingScrollTo]
        ?? el.querySelector<HTMLDivElement>(`[data-message-id="${pendingScrollTo}"]`);
      if (targetEl) {
        setPendingScrollTo(null);
        hasScrolledToBottom.current = true;
        requestAnimationFrame(() => {
          targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
          targetEl.animate(
            [
              { backgroundColor: 'rgba(88,101,242,0.0)' },
              { backgroundColor: 'rgba(88,101,242,0.28)' },
              { backgroundColor: 'rgba(88,101,242,0.0)' },
            ],
            { duration: 900, easing: 'ease-out' },
          );
        });
      }
      return;
    }

    if (!hasScrolledToBottom.current) {
      // 처음 진입 or 방 전환 시 → 메시지가 있으면 무조건 맨 아래로
      if (messages.length > 0) {
        hasScrolledToBottom.current = true;
        // 더블 rAF: 이미지/아바타 레이아웃 완료 후 정확한 scrollHeight 확보
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
          });
        });
        // 이미지 로드로 인한 높이 변화 대비 폴백
        setTimeout(() => { el.scrollTop = el.scrollHeight; }, 150);
      }
      return;
    }
    // 이후 새 메시지: 200px 이내에 있을 때만 스크롤
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, pendingScrollTo]);

  // 말풍선/메모장 전환 시 맨 아래로 즉시 이동
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [settings.viewMode]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const apply = (matches: boolean) => setIsMobile(matches);

    apply(media.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // RoomList 빈 공간 길게 누르기 → 잠금
  useEffect(() => {
    function handleMjLock() { lockChat(); }
    window.addEventListener('mj:lock', handleMjLock);
    return () => window.removeEventListener('mj:lock', handleMjLock);
  }, [canLock]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ctrl+Shift+L — 잠금 토글 (잠금 코드 있을 때만)
      if (event.ctrlKey && event.shiftKey && event.key === 'L') {
        if (!canLock) return;
        event.preventDefault();
        if (isLocked) {
          // 잠금 화면에서는 코드 입력 후 해제 — 강제 해제 안 함
        } else {
          lockChat();
        }
        return;
      }

      // 잠금 화면에서 숫자키 → 코드 입력
      if (!isLocked) return;
      if (event.key < '0' || event.key > '9') return;

      event.preventDefault();
      handleLockDigit(event.key as LockDigit);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isLocked, canLock, lockEntry]);

  useEffect(() => {
    try {
      setSettings(loadChatViewSettings());
    } catch {
      // localStorage 사용 불가 환경은 기본값 유지
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('chat-view-settings', JSON.stringify(settings));
    } catch {
      // 저장 실패 시 무시
    }
  }, [settings]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-chat-settings-panel]') || target?.closest('[data-chat-settings-button]')) return;
      setSettingsOpen(false);
    }

    if (settingsOpen) {
      window.addEventListener('click', handleOutsideClick);
    }

    return () => window.removeEventListener('click', handleOutsideClick);
  }, [settingsOpen]);

  useEffect(() => {
    return () => {
      if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPasteImage) URL.revokeObjectURL(pendingPasteImage.url);
    };
  }, [pendingPasteImage]);

  useEffect(() => {
    if (!partialCopyMessage) return;
    requestAnimationFrame(() => {
      const textarea = partialCopyTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
    });
  }, [partialCopyMessage]);

  function updateSettings(partial: Partial<ChatViewSettings>) {
    setSettings((current) => ({ ...current, ...partial }));
  }

  function lockChat() {
    if (!canLock) {
      setLockError('DB에 잠금 코드가 없습니다.');
      return;
    }
    setIsLocked(true);
    setIsContentUnlocked(false);
    setLockEntry('');
    setLockError('');
  }

  function unlockChat() {
    setIsLocked(false);
    setIsContentUnlocked(true);
    setLockEntry('');
    setLockError('');
  }

  function handleLockDigit(digit: LockDigit) {
    setLockError('');

    setLockEntry((current) => {
      const next = `${current}${digit}`;
      if (lockCode.startsWith(next)) {
        if (next.length === lockCode.length) {
          setTimeout(() => unlockChat(), 80);
          return next;
        }
        return next;
      }

      const resetValue = digit === lockCode[0] ? digit : '';
      if (!resetValue) {
        setLockError('코드가 맞지 않습니다.');
      } else if (lockCode.length === 1) {
        setTimeout(() => unlockChat(), 80);
      }
      return resetValue;
    });
  }

  function handleLockPadClick(digit: LockDigit) {
    if (!isLocked) {
      lockChat();
      return;
    }
    handleLockDigit(digit);
  }

  function handleLockReset() {
    setLockEntry('');
    setLockError('');
  }

  async function handleLeave() {
    setLeaveLoading(true);
    try {
      await api.delete(`/rooms/${roomId}/leave`);
      removeRoom(roomId);
      onLeave?.();
    } catch {
      // 실패 시 모달만 닫기
    } finally {
      setLeaveLoading(false);
      setShowLeaveConfirm(false);
    }
  }

  async function handleMuteToggle() {
    if (!activeRoom || muteSaving) return;
    const prev = isRoomMuted;
    const next = !prev;
    setMuteOverride(next);
    setRoomMuted(roomId, next); // 낙관적 업데이트
    setMuteSaving(true);
    try {
      const res = await api.patch<{ data?: { isMuted?: boolean }; isMuted?: boolean }>(`/rooms/${roomId}/mute`, { mute: next });
      const saved = typeof res.data.data?.isMuted === 'boolean'
        ? res.data.data.isMuted
        : typeof res.data.isMuted === 'boolean'
          ? res.data.isMuted
          : next;
      setMuteOverride(saved);
      setRoomMuted(roomId, saved);
    } catch {
      setMuteOverride(prev);
      setRoomMuted(roomId, prev); // 실패 시 롤백
      showCopyNotice('알림 설정 변경에 실패했습니다.');
    } finally {
      setMuteSaving(false);
    }
  }

  async function saveRoomTimeZones(nextTimeZone1?: string, nextTimeZone2?: string) {
    if (!activeRoom || roomTimeZoneSaving) return;

    const normalizedTimeZone1 = getValidTimeZone(nextTimeZone1) ?? undefined;
    const normalizedTimeZone2 = getValidTimeZone(nextTimeZone2) ?? undefined;

    if (normalizedTimeZone1 && normalizedTimeZone2 && normalizedTimeZone1 === normalizedTimeZone2) {
      setRoomTimeZoneMsg('설정1/설정2는 서로 다르게 선택해주세요.');
      return;
    }

    setRoomTimeZoneSaving(true);
    setRoomTimeZoneMsg('');
    const prevTimeZone1 = activeRoom.roomTimeZone1;
    const prevTimeZone2 = activeRoom.roomTimeZone2;

    setRooms(
      rooms.map((room) =>
        room.id === roomId
          ? { ...room, roomTimeZone1: normalizedTimeZone1, roomTimeZone2: normalizedTimeZone2 }
          : room,
      ),
    );

    try {
      const res = await api.patch<{ data: Room }>(`/rooms/${roomId}/time-zones`, {
        timeZone1: normalizedTimeZone1,
        timeZone2: normalizedTimeZone2,
      });

      const updated = res.data.data;
      setRooms(
        rooms.map((room) =>
          room.id === roomId
            ? { ...room, roomTimeZone1: updated.roomTimeZone1, roomTimeZone2: updated.roomTimeZone2 }
            : room,
        ),
      );
      setRoomTimeZoneMsg('저장됨');
    } catch {
      setRooms(
        rooms.map((room) =>
          room.id === roomId
            ? { ...room, roomTimeZone1: prevTimeZone1, roomTimeZone2: prevTimeZone2 }
            : room,
        ),
      );
      setRoomTimeZoneMsg('저장 실패');
    } finally {
      setRoomTimeZoneSaving(false);
    }
  }

  async function handleSearch() {
    if (!searchKeyword.trim() && !searchDate) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set('keyword', searchKeyword.trim());
      if (searchDate) params.set('date', searchDate);
      const res = await api.get<{ data: { messages: Message[] } }>(
        `/messages/${roomId}/search?${params.toString()}`
      );
      setSearchResults(res.data.data.messages);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadMessagesAround(messageId: number) {
    try {
      const res = await api.get<{ data: { messages: Message[]; nextCursor: number | null } }>(
        `/messages/${roomId}?around=${messageId}`
      );
      hasScrolledToBottom.current = false;
      setPendingScrollTo(messageId);
      setMessages(roomId, res.data.data.messages);
      setNextCursor(res.data.data.nextCursor);
    } catch {
      showCopyNotice('메시지를 불러오지 못했습니다.');
    }
  }

  function jumpToSearchResult(msg: Message) {
    setSearchOpen(false);
    setSearchResults(null);
    const el = messageRefs.current[msg.id];
    if (el) {
      jumpToMessage(msg.id);
    } else {
      loadMessagesAround(msg.id);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch();
  }

  const [showScrollBtn, setShowScrollBtn] = useState(false);

  function handleScrollContainerScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);

    // 위로 스크롤하여 이전 메시지 불러오기
    if (el.scrollTop < 80 && nextCursor && !loadingOlder) {
      setLoadingOlder(true);
      const prevScrollHeight = el.scrollHeight;
      const prevScrollTop = el.scrollTop;
      api
        .get<{ data: { messages: Message[]; nextCursor: number | null } }>(`/messages/${roomId}?cursor=${nextCursor}`)
        .then((res) => {
          const older = res.data.data.messages;
          if (older.length > 0) {
            prependMessages(roomId, older);
            // 스크롤 위치 보정: 이전 위치 유지
            requestAnimationFrame(() => {
              const newScrollHeight = el.scrollHeight;
              el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
            });
          }
          setNextCursor(res.data.data.nextCursor);
        })
        .finally(() => setLoadingOlder(false));
    }
  }

  function scrollToBottom() {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || !accessToken) return;
    const socket = getSocket();
    const sendingReplyTarget = replyTarget;
    // 보낼 때 타이핑 중지
    socket.emit('typing:stop', { roomId });
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
    if (sendingReplyTarget) {
      pendingRepliesRef.current.push({
        roomId,
        content,
        replyToId: sendingReplyTarget.id,
        replyTo: {
          id: sendingReplyTarget.id,
          senderId: sendingReplyTarget.senderId,
          content: sendingReplyTarget.content,
          fileUrl: sendingReplyTarget.fileUrl,
          senderTimeZone: sendingReplyTarget.senderTimeZone,
          senderLocalTime: sendingReplyTarget.senderLocalTime,
          createdAt: sendingReplyTarget.createdAt,
          sender: sendingReplyTarget.sender,
        },
      });
    }
    socket.emit('message:send', { roomId, content, replyToId: sendingReplyTarget?.id, ...getMessageSendMeta(user?.timeZone) });
    setInput('');
    setReplyTarget(null);
    // 메시지 전송 시 항상 맨 아래로 스크롤
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // 전송 후 포커스 유지 (모바일 키패드 닫힘 방지)
      textareaRef.current.focus();
    }
  }

  // Enter 키 = 전송 / Shift+Enter = 줄바꿈
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 한글/일본어 등 IME 조합 입력 중에는 Enter 전송을 막아야 조합이 끊기지 않음
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
    // 타이핑 이벤트
    if (!accessToken) return;
    const socket = getSocket();
    socket.emit('typing:start', { roomId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { roomId });
      typingTimer.current = null;
    }, 2500);
  }

  async function doUpload(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    // api(axios) 인스턴스 사용 → 인터셉터가 최신 토큰 자동 주입 + 401 시 refresh 후 재시도
    const res = await api.post<{ success: boolean; data?: { url: string } }>(
      '/messages/upload',
      formData,
    );
    if (res.data.success && res.data.data?.url) return res.data.data.url;
    throw new Error('업로드에 실패했습니다.');
  }

  async function uploadFile(file: File) {
    if (!accessToken) return;
    setUploading(true);
    setUploadError('');
    try {
      const url = await doUpload(file);
      // 이미지 업로드 후 캐시 무효화 (새로운 이미지가 갤러리에 표시되도록)
      allRoomImagesRef.current = null;
      const socket = getSocket();
      socket.emit('message:send', { roomId, content: '', fileUrl: url, ...getMessageSendMeta(user?.timeZone) });
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '네트워크 오류로 업로드 실패';
      setUploadError(msg);
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';
    if (files.length === 1) {
      await uploadFile(files[0]);
      return;
    }
    // 다중 파일 업로드
    if (!accessToken) return;
    setUploading(true);
    setUploadError('');
    const socket = getSocket();
    // 이미지 업로드 시작 시 캐시 무효화
    allRoomImagesRef.current = null;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`${i + 1}/${files.length}`);
      try {
        const url = await doUpload(files[i]);
        socket.emit('message:send', { roomId, content: '', fileUrl: url, ...getMessageSendMeta(user?.timeZone) });
        requestAnimationFrame(() => {
          const el = scrollContainerRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '네트워크 오류로 업로드 실패';
        setUploadError(msg);
        setTimeout(() => setUploadError(''), 4000);
      }
    }
    setUploadProgress('');
    setUploading(false);
  }

  function clearPendingPasteImage() {
    setPendingPasteImage((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function confirmPendingPasteImage() {
    const pending = pendingPasteImage;
    if (!pending) return;
    setPendingPasteImage(null);
    URL.revokeObjectURL(pending.url);
    await uploadFile(pending.file);
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPendingPasteImage((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const res = await api.get<{ data: { messages: Message[] } }>(`/messages/${roomId}`);
      setMessages(roomId, res.data.data.messages);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleDeleteMessage(msg: Message) {
    setContextMenu(null);
    removeMessage(msg.roomId, msg.id); // 낙관적 삭제
    const socket = getSocket();
    socket.emit('message:delete', { messageId: msg.id });
  }

  function handleStartEditMessage(msg: Message) {
    setContextMenu(null);
    setEditSaving(false);
    setEditingMessage(msg);
    setEditContent(msg.content ?? '');
  }

  function handleCancelEditMessage() {
    setEditSaving(false);
    setEditingMessage(null);
    setEditContent('');
  }

  async function handleSubmitEditMessage() {
    if (!editingMessage || editSaving) return;
    const targetMessage = editingMessage;
    const nextContent = editContent.trim();
    if (!nextContent || nextContent === (targetMessage.content ?? '')) {
      handleCancelEditMessage();
      return;
    }
    // 낙관적 업데이트: 즉시 UI 반영 (서버 broadcast인 message:updated도 수신하므로 이중 안전)
    updateMessage(targetMessage.roomId, targetMessage.id, nextContent);
    const socket = getSocket();
    socket.emit('message:edit', { messageId: targetMessage.id, content: nextContent });
    handleCancelEditMessage();
  }

  function showCopyNotice(message: string) {
    if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current);
    setCopyNotice(message);
    copyNoticeTimer.current = setTimeout(() => {
      setCopyNotice('');
      copyNoticeTimer.current = null;
    }, 1800);
  }

  async function copyText(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback 사용
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  }

  async function handleCopyMessage(msg: Message) {
    setContextMenu(null);
    if (!msg.content?.trim()) return;
    const copied = await copyText(msg.content);
    showCopyNotice(copied ? '메시지를 복사했습니다.' : '복사에 실패했습니다.');
  }

  function openPartialCopyPopup(msg: Message) {
    setContextMenu(null);
    setPartialCopyMessage(msg);
  }

  async function handleCopyFromPartialPopup() {
    const textarea = partialCopyTextareaRef.current;
    const source = textarea?.value ?? partialCopyMessage?.content ?? '';
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? 0;
    const selected = start !== end ? source.slice(start, end) : source;
    const text = selected.trim();
    if (!text) {
      showCopyNotice('복사할 텍스트가 없습니다.');
      return;
    }
    const copied = await copyText(text);
    if (copied) setPartialCopyMessage(null);
    showCopyNotice(copied ? '선택한 텍스트를 복사했습니다.' : '복사에 실패했습니다.');
  }

  function handleReplyMessage(msg: Message) {
    setContextMenu(null);
    setReplyTarget(msg);
    showCopyNotice('답장할 메시지를 선택했습니다.');
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function getImageItemsFromMessages(sourceMessages: Message[]): RoomImageItem[] {
    return sourceMessages
      .filter((m) => m.fileUrl && !/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(m.fileUrl))
      .map((m) => ({ url: m.fileUrl!, createdAt: m.createdAt }));
  }

  async function loadAllRoomImageItems(clickedUrl?: string): Promise<RoomImageItem[]> {
    if (allRoomImagesRef.current !== null) return allRoomImagesRef.current;

    const loadedImages = getImageItemsFromMessages(messages);
    try {
      const res = await api.get<{ data: { images: string[]; imageItems?: RoomImageItem[] } }>(`/messages/${roomId}/images`);
      const serverImages = sortImagesNewestFirst(res.data.data.imageItems ?? res.data.data.images.map((url) => ({ url })));
      if (!clickedUrl || serverImages.some((item) => item.url === clickedUrl)) {
        allRoomImagesRef.current = serverImages;
        return serverImages;
      }
    } catch {
      // 서버에 전체 이미지 API가 아직 배포되지 않은 경우 기존 메시지 페이지네이션으로 대체
    }

    const merged = new Map<string, RoomImageItem>();
    loadedImages.forEach((item) => merged.set(item.url, item));
    let cursor = nextCursor;
    try {
      while (cursor) {
        const res = await api.get<{ data: { messages: Message[]; nextCursor: number | null } }>(`/messages/${roomId}?cursor=${cursor}`);
        getImageItemsFromMessages(res.data.data.messages).forEach((item) => merged.set(item.url, item));
        cursor = res.data.data.nextCursor;
      }
    } catch {
      // 페이지네이션 실패 시 지금까지 로드된 이미지 사용 (로드 안됨 버그 방지)
    }

    const images = Array.from(merged);
    const sortedImages = sortImagesNewestFirst(images.map(([, item]) => item));
    allRoomImagesRef.current = !clickedUrl || sortedImages.some((item) => item.url === clickedUrl)
      ? sortedImages
      : [{ url: clickedUrl }, ...sortedImages];
    return allRoomImagesRef.current;
  }

  async function handleOpenImageCollection() {
    if (!onImageView || imageCollectionLoading) return;
    setImageCollectionLoading(true);
    // 갤러리 열 때 캐시 무효화 (최새 이미지 항상 표시)
    allRoomImagesRef.current = null;
    try {
      const imageItems = await loadAllRoomImageItems();
      if (imageItems.length === 0) {
        showCopyNotice('모아볼 사진이 없습니다.');
        return;
      }
      onImageView(imageItems[0].url, imageItems, { showGrid: true });
    } catch {
      showCopyNotice('사진을 불러오지 못했습니다.');
    } finally {
      setImageCollectionLoading(false);
    }
  }

  function jumpToMessage(messageId: number) {
    const el = messageRefs.current[messageId];
    if (!el) {
      showCopyNotice('원본 메시지를 찾을 수 없습니다.');
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [
        { backgroundColor: 'rgba(88,101,242,0.0)' },
        { backgroundColor: 'rgba(88,101,242,0.28)' },
        { backgroundColor: 'rgba(88,101,242,0.0)' },
      ],
      { duration: 800, easing: 'ease-out' },
    );
  }

  async function handleSaveToArchive(msg: Message) {
    setContextMenu(null);
    try {
      let aRoomId = archiveRoomId;
      if (!aRoomId) {
        const res = await api.get<{ data: Room }>('/rooms/archive');
        const archRoom = res.data.data;
        aRoomId = archRoom.id;
        setArchiveRoomId(archRoom.id);
        const existing = rooms.find((r) => r.id === archRoom.id);
        if (!existing) setRooms([...rooms, archRoom]);
        const socket = getSocket();
        socket.emit('room:join', archRoom.id);
      }
      const socket = getSocket();
      if (msg.fileUrl) {
        socket.emit('message:send', { roomId: aRoomId, content: '', fileUrl: msg.fileUrl, ...getMessageSendMeta(user?.timeZone) });
      } else {
        socket.emit('message:send', { roomId: aRoomId, content: msg.content, ...getMessageSendMeta(user?.timeZone) });
      }
    } catch {
      // 실패 무시
    }
  }

  function handleRegisterAsPost(msg: Message) {
    setContextMenu(null);
    setPostFromMsg(msg);
    setPostMsgTitle('');
  }

  async function submitPostFromMessage() {
    if (!postFromMsg || !postMsgTitle.trim()) return;
    setPostMsgSaving(true);
    try {
      await api.post('/posts', {
        roomId,
        title: postMsgTitle.trim(),
        content: postFromMsg.content,
        sourceMessageId: postFromMsg.id,
      });
      setPostFromMsg(null);
      showCopyNotice('게시글로 등록되었습니다');
    } catch {
      showCopyNotice('등록 실패. 다시 시도해주세요.');
    } finally {
      setPostMsgSaving(false);
    }
  }

  const replyPreviewByMessageId = useMemo(() => {
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const previews = new Map<number, Message['replyTo']>();
    messages.forEach((message) => {
      if (message.replyTo) {
        previews.set(message.id, message.replyTo);
        return;
      }
      if (!message.replyToId) return;
      const fallbackReplyTarget = messageById.get(message.replyToId);
      if (!fallbackReplyTarget) return;
      previews.set(message.id, {
        id: fallbackReplyTarget.id,
        senderId: fallbackReplyTarget.senderId,
        content: fallbackReplyTarget.content,
        fileUrl: fallbackReplyTarget.fileUrl,
        senderTimeZone: fallbackReplyTarget.senderTimeZone,
        senderLocalTime: fallbackReplyTarget.senderLocalTime,
        createdAt: fallbackReplyTarget.createdAt,
        sender: fallbackReplyTarget.sender,
      });
    });
    return previews;
  }, [messages]);

  const trimmedEditContent = editContent.trim();
  const isNaverLight = Boolean(naverTheme && !naverDark);
  const isOyLight = Boolean(oyTheme && !oyDark);
  const isLightContextMenu = isNaverLight || isOyLight;
  const isLightSettingsPanel = isNaverLight || isOyLight;

  // 날짜 구분선 렌더링
  function renderMessages() {
    const items: React.ReactNode[] = [];
    let lastDate = '';
    let lastSenderId = -1;

    messages.forEach((msg, i) => {
      const replyPreview = replyPreviewByMessageId.get(msg.id);
      const effectiveReply = replyPreview ?? msg.replyTo;
      const date = new Date(msg.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
      if (settings.showDateSeparator && date !== lastDate) {
        items.push(
          <div key={`date-${i}`} className="flex items-center gap-3 my-4">
            <hr className="flex-1" style={{ borderColor: '#3f4147' }} />
            <span className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>{date}</span>
            <hr className="flex-1" style={{ borderColor: '#3f4147' }} />
          </div>
        );
        lastDate = date;
        lastSenderId = -1;
      }
      const isMine = msg.senderId === user?.id;
      const isConsecutive = msg.senderId === lastSenderId;
      if (settings.viewMode === 'memo') {
        const senderName = msg.sender?.username ?? (isMine ? '나' : `사용자${msg.senderId}`);
        const time = formatTime(new Date(msg.createdAt), settings.timeFormat, msg.senderTimeZone, msg.senderLocalTime);
        const prefix = settings.showNickname ? `[${senderName}][${time}]` : `[${time}]`;
        items.push(
          <div
            key={msg.id}
            ref={(el) => { messageRefs.current[msg.id] = el; }}
            data-message-id={msg.id}
          >
            {effectiveReply && (
              <button
                type="button"
                onClick={() => { if (effectiveReply.id) jumpToMessage(effectiveReply.id); }}
                className="mb-1.5 rounded-xl px-2.5 py-2 text-left block"
                style={{
                  width: 'fit-content',
                  maxWidth: isMobile ? '82%' : '70%',
                  marginLeft: isMine ? 'auto' : 0,
                  color: 'var(--text-primary)',
                  background: isMine ? 'var(--bubble-mine)' : 'var(--bubble-other)',
                  border: 'none',
                  borderLeft: (!isMine && naverTheme && !naverDark)
                    ? '3px solid rgba(0,0,0,0.25)'
                    : '3px solid rgba(255,255,255,0.72)',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                }}
                title="원본 메시지로 이동"
                aria-label="원본 메시지로 이동"
              >
                <span className="block text-[11px] font-bold leading-tight truncate" style={{ color: (!isMine && naverTheme && !naverDark) ? '#333' : '#fff' }}>
                  {effectiveReply.sender?.username ?? `사용자${effectiveReply.senderId}`}에게 답장
                </span>
                <span className="mt-1 block text-[11px] leading-tight truncate" style={{ color: (!isMine && naverTheme && !naverDark) ? '#666' : 'rgba(255,255,255,0.78)' }}>
                  {effectiveReply.fileUrl ? '[사진]' : (effectiveReply.content || '[메시지]')}
                </span>
              </button>
            )}
            <p
              className="text-sm leading-7 whitespace-pre-wrap break-words"
              style={{ color: 'var(--text-primary)', fontFamily: 'Consolas, "Courier New", monospace' }}
            >
              {prefix} {renderMessageContent(msg.content)}
            </p>
          </div>
        );
      } else {
        items.push(
          <div
            key={msg.id}
            ref={(el) => { messageRefs.current[msg.id] = el; }}
            data-message-id={msg.id}
            className="rounded-xl"
          >
            <MessageBubble
              message={{ ...msg, replyTo: effectiveReply }}
              isMine={isMine}
              isConsecutive={isConsecutive}
              timeFormat={settings.timeFormat}
              showNickname={settings.showNickname}
              naverTheme={naverTheme}
              naverDark={naverDark}
              oyTheme={oyTheme}
              oyDark={oyDark}
              viewerTimeZone={user?.timeZone || DEFAULT_VIEWER_TIME_ZONE}
              onImageClick={onImageView ? (url) => {
                loadAllRoomImageItems(url)
                  .then((imageItems) => onImageView(url, imageItems))
                  .catch(() => onImageView(url, [{ url }]));
              } : undefined}
              onAvatarClick={onImageView ? (url) => onImageView(url, [{ url }]) : undefined}
              onLongPress={setContextMenu}
              onReply={handleReplyMessage}
              onJumpToMessage={jumpToMessage}
            />
          </div>
        );
      }
      lastSenderId = msg.senderId;
    });
    return items;
  }

  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--chat-bg)' }} {...(naverTheme ? { 'data-ntheme': '', ...(naverDark ? { 'data-ndark': '' } : {}) } : {})} {...(oyTheme ? { 'data-oytheme': '', ...(oyDark ? { 'data-oydark': '' } : {}) } : {})}>
      {/* 채널 헤더 — 모바일: 헤더 길게 누르면 잠금 */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b shadow-md flex-shrink-0"
        style={{ borderColor: naverTheme ? (naverDark ? '#2e2e2e' : '#e8e8e8') : oyTheme ? (oyDark ? '#1A3030' : '#EEF0F0') : '#1e1f22', background: naverTheme ? (naverDark ? '#161616' : '#ffffff') : oyTheme ? (oyDark ? '#0F2222' : '#ffffff') : 'var(--chat-bg)' }}
        onContextMenu={isMobile && canLock ? (e) => e.preventDefault() : undefined}
        onTouchStart={isMobile && canLock ? () => { longPressTimer.current = setTimeout(() => lockChat(), 2000); } : undefined}
        onTouchEnd={isMobile && canLock ? () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } } : undefined}
        onTouchMove={isMobile && canLock ? () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } } : undefined}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          {activeRoom?.isGroup
            ? <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>
            : <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
        </svg>
        <div className="min-w-0">
          <span className="block font-semibold text-sm min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
            {activeRoom?.name ?? ''}
          </span>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] whitespace-nowrap overflow-hidden">
            <span style={{ color: 'var(--text-muted)' }}>KR {formatCurrentTimeForZone('Asia/Seoul')}</span>
            {roomTimeZone1 && <span style={{ color: 'var(--text-muted)' }}>S1 {formatCurrentTimeForZone(roomTimeZone1)}</span>}
            {roomTimeZone2 && <span style={{ color: 'var(--text-muted)' }}>S2 {formatCurrentTimeForZone(roomTimeZone2)}</span>}
          </div>
        </div>
        <div className="flex-1" />
        {/* 알림 음소거 버튼 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleMuteToggle();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!activeRoom || muteSaving}
          className="rounded-md px-2 py-1.5 transition-colors inline-flex items-center gap-1.5 flex-shrink-0 disabled:opacity-60"
          style={{
            background: isRoomMuted ? '#ed424522' : '#3ba55d22',
            color: isRoomMuted ? '#ed4245' : '#57f287',
            cursor: muteSaving ? 'wait' : 'pointer',
          }}
          title={isRoomMuted ? '알림 켜기' : '알림 끄기'}
          aria-label={isRoomMuted ? '현재 알림 꺼짐, 클릭하면 알림 켜기' : '현재 알림 켜짐, 클릭하면 알림 끄기'}
        >
          {isRoomMuted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          )}
          <span className="hidden sm:inline text-[11px] font-bold whitespace-nowrap">{isRoomMuted ? 'OFF' : 'ON'}</span>
        </button>
        {/* 채팅방 정보 버튼 (사진·링크 모아보기) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setRoomInfoOpen(true); }}
          className="rounded-md p-1.5 transition-colors"
          style={{ background: roomInfoOpen ? '#3a3f4a' : 'transparent', color: 'var(--text-muted)' }}
          title="사진·링크 모아보기"
          aria-label="채팅방 정보"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        {/* 새로고침 버튼 */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="rounded-md p-1.5 transition-colors"
          style={{ background: 'transparent', color: 'var(--text-muted)' }}
          title="새로고침"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={isRefreshing ? 'animate-spin' : ''}>
            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        {/* 검색 버튼 */}
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setSearchResults(null); setSearchKeyword(''); setSearchDate(''); }}
          className="rounded-md p-1.5 transition-colors"
          style={{ background: searchOpen ? '#3a3f4a' : 'transparent', color: 'var(--text-muted)' }}
          title="채팅 검색"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        {/* 나가기 버튼 */}
        <button
          type="button"
          onClick={() => setShowLeaveConfirm(true)}
          className="rounded-md p-1.5 transition-colors"
          style={{ background: 'transparent', color: '#ed4245' }}
          title="채팅방 나가기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        {!isMobile && (
          <>
            <button
              type="button"
              data-chat-settings-button
              onClick={() => setSettingsOpen((current) => !current)}
              className="text-xs px-2 py-1 rounded-md transition-colors"
              style={{ background: settingsOpen ? '#3a3f4a' : 'transparent', color: 'var(--text-muted)' }}
            >
              설정
            </button>
            <div className="view-mode-bar flex items-center rounded-md p-1" style={{ background: '#2b2d31', gap: 4 }}>
              <button
                type="button"
                onClick={() => updateSettings({ viewMode: 'bubble' })}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{
                  color: settings.viewMode === 'bubble' ? '#fff' : 'var(--text-muted)',
                  background: settings.viewMode === 'bubble' ? 'var(--accent)' : 'transparent',
                }}
              >
                말풍선
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ viewMode: 'memo' })}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{
                  color: settings.viewMode === 'memo' ? '#fff' : 'var(--text-muted)',
                  background: settings.viewMode === 'memo' ? 'var(--accent)' : 'transparent',
                }}
              >
                메모장
              </button>
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <div className="toolbar-mobile flex-shrink-0 flex items-center gap-2 px-3 pb-2" style={{ background: 'var(--chat-bg)', borderBottom: '1px solid #1e1f22' }}>
          <button
            type="button"
            data-chat-settings-button
            onClick={() => setSettingsOpen((current) => !current)}
            className="settings-btn text-[11px] px-2 py-1 rounded-md"
            style={{ background: settingsOpen ? '#3a3f4a' : '#2b2d31', color: 'var(--text-muted)' }}
          >
            설정
          </button>
          <div className="view-mode-bar flex items-center rounded-md p-1" style={{ background: '#2b2d31', gap: 4 }}>
            <button
              type="button"
              onClick={() => updateSettings({ viewMode: 'bubble' })}
              className="text-[11px] px-2 py-1 rounded"
              style={{
                color: settings.viewMode === 'bubble' ? '#fff' : 'var(--text-muted)',
                background: settings.viewMode === 'bubble' ? 'var(--accent)' : 'transparent',
              }}
            >
              말풍선
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ viewMode: 'memo' })}
              className="text-[11px] px-2 py-1 rounded"
              style={{
                color: settings.viewMode === 'memo' ? '#fff' : 'var(--text-muted)',
                background: settings.viewMode === 'memo' ? 'var(--accent)' : 'transparent',
              }}
            >
              메모장
            </button>
          </div>
          {/* 테스트용 잠금 트리거 버튼 */}
          {canLock && (
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={() => { longPressTimer.current = setTimeout(() => lockChat(), 2000); }}
              onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
              className="px-3 py-1 rounded-md flex-shrink-0"
              style={{ background: 'transparent', border: 'none', marginLeft: 'auto', userSelect: 'none', minWidth: 48, minHeight: 26 }}
            >
            </button>
          )}
        </div>
      )}

      {settingsOpen && (
        <div
          data-chat-settings-panel
          className="absolute z-20 rounded-xl border p-3 shadow-2xl"
          style={{
            background: isLightSettingsPanel ? '#ffffff' : '#1f2126',
            borderColor: isLightSettingsPanel ? '#e2e5ea' : '#3a3f4a',
            right: isMobile ? 8 : 16,
            top: isMobile ? 84 : 56,
            width: isMobile ? 'calc(100% - 16px)' : 256,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>채팅 보기 설정</span>
            <button type="button" className="text-xs" style={{ color: 'var(--text-muted)' }} onClick={() => setSettingsOpen(false)}>
              닫기
            </button>
          </div>

          <div className="space-y-3">
            <SettingRow
              label="시간 형식"
              value={settings.timeFormat === '24h' ? '24시간' : '오전/오후'}
              onToggle={() => updateSettings({ timeFormat: settings.timeFormat === '24h' ? 'ampm' : '24h' })}
              light={isLightSettingsPanel}
            />
            <SettingRow
              label="닉네임 표시"
              value={settings.showNickname ? '켜짐' : '꺼짐'}
              onToggle={() => updateSettings({ showNickname: !settings.showNickname })}
              light={isLightSettingsPanel}
            />
            <SettingRow
              label="날짜 구분선"
              value={settings.showDateSeparator ? '켜짐' : '꺼짐'}
              onToggle={() => updateSettings({ showDateSeparator: !settings.showDateSeparator })}
              light={isLightSettingsPanel}
            />

            {/* 사용자 시간대 설정 */}
            <div className="pt-2 border-t" style={{ borderColor: isLightSettingsPanel ? '#e8ebf0' : '#3a3f4a' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>내 메시지 시간대</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    새 메시지부터 선택한 지역 시간으로 표시됩니다.
                  </p>
                </div>
                {timeZoneMsg && <span className="text-[11px]" style={{ color: timeZoneMsg === '오류' ? '#ed4245' : '#57f287' }}>{timeZoneMsg}</span>}
              </div>
              <div className="flex gap-2">
                <select
                  value={user?.timeZone ?? ''}
                  onChange={async (e) => {
                    const nextTimeZone = e.target.value || undefined;
                    if (user) setUser({ ...user, timeZone: nextTimeZone });
                    setTimeZoneSaving(true);
                    setTimeZoneMsg('');
                    try {
                      const res = await api.patch<{ data: NonNullable<typeof user> }>('/auth/time-zone', { timeZone: nextTimeZone });
                      setUser(res.data.data);
                      setTimeZoneMsg('저장됨');
                    } catch {
                      if (user) setUser({ ...user, timeZone: nextTimeZone });
                      setTimeZoneMsg('기기에 저장됨');
                    } finally {
                      setTimeZoneSaving(false);
                    }
                  }}
                  disabled={timeZoneSaving}
                  className="flex-1 rounded-md px-2 py-1.5 text-xs outline-none"
                  style={{
                    background: isLightSettingsPanel ? '#f7f8fb' : '#2b2d31',
                    color: 'var(--text-primary)',
                    border: `1px solid ${isLightSettingsPanel ? '#dfe3ea' : '#3a3f4a'}`,
                  }}
                >
                  {user?.timeZone && !TIME_ZONE_OPTIONS.some((option) => option.value === user.timeZone) && (
                    <option value={user.timeZone}>{user.timeZone}</option>
                  )}
                  {TIME_ZONE_OPTIONS.map((option) => (
                    <option key={option.value || 'auto'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 방 공통 시간대 설정 */}
            <div className="pt-2 border-t" style={{ borderColor: isLightSettingsPanel ? '#e8ebf0' : '#3a3f4a' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>방 공통 시간대</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    한국시간은 고정, 설정시간1/2는 방 전체에 공통 적용됩니다.
                  </p>
                </div>
                {roomTimeZoneMsg && (
                  <span
                    className="text-[11px]"
                    style={{ color: roomTimeZoneMsg === '저장됨' ? '#57f287' : '#ed4245' }}
                  >
                    {roomTimeZoneMsg}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span className="w-16">한국시간</span>
                  <span style={{ color: 'var(--text-primary)' }}>Asia/Seoul</span>
                  <span>({formatCurrentTimeForZone('Asia/Seoul')})</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-16 text-[11px]" style={{ color: 'var(--text-muted)' }}>설정시간1</span>
                  <select
                    value={roomTimeZone1 ?? ''}
                    onChange={(e) => saveRoomTimeZones(e.target.value || undefined, roomTimeZone2)}
                    disabled={roomTimeZoneSaving}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs outline-none"
                    style={{
                      background: isLightSettingsPanel ? '#f7f8fb' : '#2b2d31',
                      color: 'var(--text-primary)',
                      border: `1px solid ${isLightSettingsPanel ? '#dfe3ea' : '#3a3f4a'}`,
                    }}
                  >
                    {roomTimeZone1 && !ROOM_TIME_ZONE_OPTIONS.some((option) => option.value === roomTimeZone1) && (
                      <option value={roomTimeZone1}>{roomTimeZone1}</option>
                    )}
                    {ROOM_TIME_ZONE_OPTIONS.map((option) => (
                      <option key={`room-tz1-${option.value || 'none'}`} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {roomTimeZone1 && (
                  <p className="text-[11px] pl-[4.5rem]" style={{ color: 'var(--text-muted)' }}>
                    현재: {roomTimeZone1Label} ({formatCurrentTimeForZone(roomTimeZone1)})
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <span className="w-16 text-[11px]" style={{ color: 'var(--text-muted)' }}>설정시간2</span>
                  <select
                    value={roomTimeZone2 ?? ''}
                    onChange={(e) => saveRoomTimeZones(roomTimeZone1, e.target.value || undefined)}
                    disabled={roomTimeZoneSaving}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs outline-none"
                    style={{
                      background: isLightSettingsPanel ? '#f7f8fb' : '#2b2d31',
                      color: 'var(--text-primary)',
                      border: `1px solid ${isLightSettingsPanel ? '#dfe3ea' : '#3a3f4a'}`,
                    }}
                  >
                    {roomTimeZone2 && !ROOM_TIME_ZONE_OPTIONS.some((option) => option.value === roomTimeZone2) && (
                      <option value={roomTimeZone2}>{roomTimeZone2}</option>
                    )}
                    {ROOM_TIME_ZONE_OPTIONS.map((option) => (
                      <option key={`room-tz2-${option.value || 'none'}`} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {roomTimeZone2 && (
                  <p className="text-[11px] pl-[4.5rem]" style={{ color: 'var(--text-muted)' }}>
                    현재: {roomTimeZone2Label} ({formatCurrentTimeForZone(roomTimeZone2)})
                  </p>
                )}
              </div>
            </div>

            {/* 잠금 코드 설정 */}
            <div className="pt-2 border-t" style={{ borderColor: isLightSettingsPanel ? '#e8ebf0' : '#3a3f4a' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                잠금 코드 {lockCode ? `(현재: ${'●'.repeat(lockCode.length)})` : '(미설정)'}
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="숫자만 입력"
                  value={lockCodeInput}
                  onChange={(e) => { setLockCodeInput(e.target.value.replace(/\D/g, '').slice(0, 16)); setLockCodeMsg(''); }}
                  className="flex-1 rounded-md px-2 py-1 text-xs outline-none"
                  style={{
                    background: isLightSettingsPanel ? '#f7f8fb' : '#2b2d31',
                    color: 'var(--text-primary)',
                    border: `1px solid ${isLightSettingsPanel ? '#dfe3ea' : '#3a3f4a'}`,
                  }}
                />
                <button
                  type="button"
                  disabled={lockCodeSaving}
                  onClick={async () => {
                    setLockCodeSaving(true);
                    setLockCodeMsg('');
                    try {
                      const res = await api.patch<{ data: typeof user }>('/auth/lock-code', { code: lockCodeInput });
                      setUser(res.data.data!);
                      setLockCodeMsg(lockCodeInput ? '저장됨' : '해제됨');
                      setLockCodeInput('');
                    } catch {
                      setLockCodeMsg('오류');
                    } finally {
                      setLockCodeSaving(false);
                    }
                  }}
                  className="rounded-md px-2 py-1 text-xs font-bold"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {lockCodeSaving ? '…' : '저장'}
                </button>
              </div>
              {lockCodeMsg && <p className="mt-1 text-xs" style={{ color: '#57f287' }}>{lockCodeMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* 연결 끊김 배너 */}
      {socketDisconnected && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{ background: '#ed424533', color: '#ed4245', borderBottom: '1px solid #ed424555' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ed4245', display: 'inline-block', flexShrink: 0,
            animation: 'pulse 1s ease-in-out infinite' }} />
          연결이 끊겼습니다. 재연결 중...
        </div>
      )}

      {/* 검색 패널 */}
      {searchOpen && (
        <div className="flex-shrink-0 border-b" style={{ background: '#1f2126', borderColor: '#3a3f4a' }}>
          <div className="flex gap-2 items-center px-3 py-2">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="단어로 찾기"
              className="flex-1 rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: '#2b2d31', color: 'var(--text-primary)', border: '1px solid #3a3f4a' }}
            />
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: '#2b2d31', color: 'var(--text-primary)', border: '1px solid #3a3f4a', colorScheme: 'dark' }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searchLoading || (!searchKeyword.trim() && !searchDate)}
              className="rounded-md px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {searchLoading ? '...' : '검색'}
            </button>
            <button type="button" onClick={() => { setSearchOpen(false); setSearchResults(null); }}
              className="text-xs" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          {searchResults !== null && (
            <div className="max-h-64 overflow-y-auto px-3 pb-2 space-y-1">
              {searchResults.length === 0 ? (
                <p className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>결과 없음</p>
              ) : searchResults.map((msg) => {
                const isMine = msg.senderId === user?.id;
                const name = msg.sender?.username ?? (isMine ? '나' : `사용자${msg.senderId}`);
                const time = formatSearchTime(new Date(msg.createdAt), msg.senderTimeZone, msg.senderLocalTime);
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => jumpToSearchResult(msg)}
                    className="w-full text-left rounded-lg px-3 py-2 transition-opacity hover:opacity-80 active:opacity-60"
                    style={{ background: '#2b2d31', border: 'none', cursor: 'pointer', display: 'block' }}
                    title="해당 메시지로 이동"
                    aria-label={`${name}의 메시지로 이동: ${msg.content ?? '[이미지]'}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={{ color: isMine ? '#5865f2' : 'var(--text-primary)' }}>{name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{time}</span>
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>→ 이동</span>
                    </div>
                    {msg.fileUrl
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>[이미지]</span>
                      : <p className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                          {searchKeyword.trim()
                            ? (msg.content ?? '').split(new RegExp(`(${searchKeyword.trim()})`, 'gi')).map((part, i) =>
                                part.toLowerCase() === searchKeyword.trim().toLowerCase()
                                  ? <mark key={i} style={{ background: '#fde047', color: '#111', borderRadius: 2 }}>{part}</mark>
                                  : part
                              )
                            : renderMessageContent(msg.content ?? '')
                          }
                        </p>
                    }
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 나가기 확인 모달 */}
      {showLeaveConfirm && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(10,12,16,0.7)' }}>
          <div className="w-full max-w-xs rounded-2xl border p-5 shadow-2xl" style={{ background: '#17191d', borderColor: '#3a3f4a' }}>
            <p className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>채팅방 나가기</p>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>나가면 채팅 목록에서 삭제됩니다.<br/>대화 내용은 유지됩니다.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-lg py-2.5 text-sm font-medium"
                style={{ background: '#3a3f4a', color: 'var(--text-muted)' }}>취소</button>
              <button type="button" onClick={handleLeave} disabled={leaveLoading}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: '#ed4245', color: '#fff' }}>
                {leaveLoading ? '나가는 중...' : '나가기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 붙여넣기 이미지 전송 확인 */}
      {pendingPasteImage && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-5" style={{ background: 'rgba(10,12,16,0.76)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-4 shadow-2xl" style={{ background: '#17191d', borderColor: '#3a3f4a' }}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>사진을 전송할까요?</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>붙여넣은 이미지를 확인한 뒤 전송하세요.</p>
              </div>
              <button
                type="button"
                onClick={clearPendingPasteImage}
                className="rounded-lg px-2 py-1 text-xs"
                style={{ background: '#2b2d31', color: 'var(--text-muted)' }}
                aria-label="사진 전송 취소"
              >
                ✕
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPasteImage.url}
              alt="붙여넣은 이미지 미리보기"
              className="mb-4 w-full rounded-xl"
              style={{ maxHeight: '52vh', objectFit: 'contain', background: '#0f1115', border: '1px solid #2b2d31' }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearPendingPasteImage}
                disabled={uploading}
                className="flex-1 rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: '#3a3f4a', color: 'var(--text-muted)' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPendingPasteImage}
                disabled={uploading}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {uploading ? '전송 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메시지 컨텍스트 메뉴 (말풍선 길게 누르기) */}
      {contextMenu && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setContextMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border p-4"
            style={{ background: isLightContextMenu ? '#ffffff' : '#17191d', borderColor: isLightContextMenu ? '#e8e8e8' : '#3a3f4a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-center mb-4 truncate px-2" style={{ color: 'var(--text-muted)' }}>
              {contextMenu.fileUrl ? '[파일]' : (contextMenu.content ?? '').slice(0, 60)}
            </p>
            <button
              type="button"
              onClick={() => handleReplyMessage(contextMenu)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
              style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
            >
              <span style={{ fontSize: 18 }}>↩️</span>
              <span className="text-sm font-medium">답장</span>
            </button>
            {!contextMenu.fileUrl && (
              <button
                type="button"
                onClick={() => handleCopyMessage(contextMenu)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: 18 }}>📋</span>
                <span className="text-sm font-medium">전체 복사</span>
              </button>
            )}
            {!contextMenu.fileUrl && (
              <button
                type="button"
                onClick={() => openPartialCopyPopup(contextMenu)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: 18 }}>✂️</span>
                <span className="text-sm font-medium">선택 부분 복사</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveToArchive(contextMenu)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
              style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
            >
              <span style={{ fontSize: 18 }}>🔖</span>
              <span className="text-sm font-medium">보관함에 저장</span>
            </button>
            {!contextMenu.fileUrl && (
              <button
                type="button"
                onClick={() => handleRegisterAsPost(contextMenu)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: 18 }}>📝</span>
                <span className="text-sm font-medium">게시글로 등록</span>
              </button>
            )}
            {contextMenu.senderId === user?.id && !contextMenu.fileUrl && (
              <button
                type="button"
                onClick={() => handleStartEditMessage(contextMenu)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-primary)' }}
              >
                <span style={{ fontSize: 18 }}>✏️</span>
                <span className="text-sm font-medium">수정</span>
              </button>
            )}
            {contextMenu.senderId === user?.id && (
              <button
                type="button"
                onClick={() => handleDeleteMessage(contextMenu)}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: '#ed424522', color: '#ed4245' }}
              >
                <span style={{ fontSize: 18 }}>🗑️</span>
                <span className="text-sm font-medium">삭제</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setContextMenu(null)}
              className="w-full rounded-xl px-4 py-2.5 text-sm"
              style={{ background: isLightContextMenu ? '#f5f6f8' : '#2b2d31', color: 'var(--text-muted)' }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 메시지 수정 팝업 */}
      {editingMessage && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.62)' }}
          onClick={handleCancelEditMessage}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border p-4"
            style={{ background: isNaverLight ? '#ffffff' : '#17191d', borderColor: isNaverLight ? '#e8e8e8' : '#3a3f4a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>메시지 수정</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                수정할 내용을 입력한 뒤 저장하세요.
              </p>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{
                borderColor: isNaverLight ? '#e8e8e8' : '#3a3f4a',
                background: isNaverLight ? '#ffffff' : '#101216',
                color: 'var(--text-primary)',
                minHeight: 110,
              }}
              placeholder="메시지를 입력하세요."
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCancelEditMessage}
                className="flex-1 rounded-lg py-2.5 text-sm"
                style={{ background: isNaverLight ? '#f5f6f8' : '#2b2d31', color: 'var(--text-muted)' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitEditMessage}
                disabled={editSaving || !trimmedEditContent || trimmedEditContent === (editingMessage.content ?? '')}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {editSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 선택 부분 복사 팝업 */}
      {partialCopyMessage && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.62)' }}
          onClick={() => setPartialCopyMessage(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border p-4"
            style={{ background: '#17191d', borderColor: '#3a3f4a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>선택 부분 복사</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  필요한 문장만 드래그해서 선택하거나, 내용을 지운 뒤 복사하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartialCopyMessage(null)}
                className="rounded-md px-2 py-1 text-xs"
                style={{ background: '#2b2d31', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>
            <textarea
              ref={partialCopyTextareaRef}
              defaultValue={partialCopyMessage.content}
              className="mb-3 h-40 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                background: '#0f1115',
                border: '1px solid #3a3f4a',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
              }}
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const textarea = partialCopyTextareaRef.current;
                  if (!textarea) return;
                  textarea.focus();
                  textarea.setSelectionRange(0, textarea.value.length);
                }}
                className="rounded-lg py-2 text-sm font-medium"
                style={{ background: '#2b2d31', color: 'var(--text-primary)' }}
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => setPartialCopyMessage(null)}
                className="rounded-lg py-2 text-sm font-medium"
                style={{ background: '#3a3f4a', color: 'var(--text-muted)' }}
              >
                취소
              </button>
            </div>
            <button
              type="button"
              onClick={handleCopyFromPartialPopup}
              className="w-full rounded-xl py-2.5 text-sm font-bold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              선택한 부분 복사
            </button>
          </div>
        </div>
      )}

      {/* 게시글 등록 (메시지 → 게시글) 모달 */}
      {postFromMsg && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.62)' }}
          onClick={() => { setPostFromMsg(null); setPostMsgTitle(''); }}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border p-4"
            style={{ background: isNaverLight ? '#ffffff' : '#17191d', borderColor: isNaverLight ? '#e8e8e8' : '#3a3f4a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>게시글로 등록</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>제목을 입력하면 이 메시지 내용이 게시글로 등록됩니다.</p>
            </div>
            <div
              className="rounded-lg border px-3 py-2 mb-3 text-xs"
              style={{ borderColor: isNaverLight ? '#e8e8e8' : '#3a3f4a', background: isNaverLight ? '#f5f6f8' : '#101216', color: 'var(--text-muted)', maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {(postFromMsg.content ?? '').slice(0, 200)}{(postFromMsg.content ?? '').length > 200 ? '...' : ''}
            </div>
            <input
              value={postMsgTitle}
              onChange={(e) => setPostMsgTitle(e.target.value)}
              placeholder="게시글 제목 *"
              maxLength={200}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && postMsgTitle.trim()) submitPostFromMessage(); }}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
              style={{ borderColor: isNaverLight ? '#e8e8e8' : '#3a3f4a', background: isNaverLight ? '#ffffff' : '#101216', color: 'var(--text-primary)', outline: 'none' }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPostFromMsg(null); setPostMsgTitle(''); }}
                className="flex-1 rounded-lg py-2.5 text-sm"
                style={{ background: isNaverLight ? '#f5f6f8' : '#2b2d31', color: 'var(--text-muted)' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPostFromMessage}
                disabled={postMsgSaving || !postMsgTitle.trim()}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {postMsgSaving ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅방 정보 패널 */}
      {roomInfoOpen && (
        <RoomInfoPanel
          roomId={roomId}
          onClose={() => setRoomInfoOpen(false)}
          onImageClick={onImageView ? (url, all) => {
            // 패널을 먼저 닫으면 cleanup의 history.back()이 popstate를 발생시켜
            // 방금 열린 lightbox를 즉시 닫아버리는 버그가 있음.
            // lightbox(zIndex:9999)가 패널(zIndex:25) 위를 완전히 덮으므로 패널은 그대로 둠.
            onImageView(url, all);
          } : undefined}
        />
      )}

      {/* 메시지 목록 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-6" style={{ position: 'relative', overflowX: 'hidden' }}
        onScroll={handleScrollContainerScroll}
      >
        {loadingOlder && (
          <div className="text-center py-2 text-xs" style={{ color: 'var(--text-muted)' }}>이전 메시지 불러오는 중...</div>
        )}
        {isContentUnlocked && renderMessages()}
        {/* 타이핑 인디케이터 — 스크롤 레이아웃에 영향 안 주도록 sticky 배치 */}
        {typingUsers.length > 0 && (
          <div className="sticky bottom-0 left-0 pb-1 text-xs" style={{ color: 'var(--text-muted)', pointerEvents: 'none' }}>
            {typingUsers.map((u) => u.username).join(', ')}님이 입력 중
            <span className="inline-flex gap-0.5 ml-1 align-middle">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)',
                  display: 'inline-block',
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 맨 아래로 버튼 */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute', bottom: 72, right: 16, zIndex: 20,
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bubble-mine)', border: 'none',
            color: '#fff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="맨 아래로"
        >↓</button>
      )}

      {isLocked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6" style={{ background: 'rgba(10, 12, 16, 0.68)' }}>
          <div className="w-full max-w-md rounded-2xl border p-5 shadow-2xl" style={{ background: '#17191d', borderColor: '#3a3f4a' }}>
            <div className="mb-4 text-center">
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>잠금 상태</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>숫자키 또는 아래 버튼을 순서대로 입력하세요</p>
            </div>

            <div className="mb-4 flex items-center justify-center gap-2">
              {Array.from({ length: lockCode.length }).map((_, index) => {
                const filled = index < lockEntry.length;
                return (
                  <span
                    key={index}
                    className="flex h-3 w-3 rounded-full"
                    style={{ background: filled ? '#57f287' : '#3a3f4a' }}
                  />
                );
              })}
            </div>

            {lockError && (
              <p className="mb-3 text-center text-xs font-medium" style={{ color: '#ed4245' }}>
                {lockError}
              </p>
            )}

            <div className="grid grid-cols-5 gap-2">
              {LOCK_DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleLockPadClick(digit)}
                  className="rounded-lg py-3 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-40"
                  disabled={!canLock}
                  style={{ background: '#2b2d31', color: 'var(--text-primary)' }}
                >
                  {digit}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleLockReset}
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: '#2b2d31', color: 'var(--text-muted)' }}
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => { setIsLocked(false); setLockEntry(''); setLockError(''); }}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: '#3a3f4a', color: 'var(--text-muted)' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div className={`px-4 pt-3 pb-5 flex-shrink-0 ${(isLocked || !isContentUnlocked) ? 'pointer-events-none opacity-40' : ''}`}
        style={{ borderTop: naverTheme ? `1px solid ${naverDark ? '#2e2e2e' : '#e8e8e8'}` : oyTheme ? `1px solid ${oyDark ? '#1A3030' : '#EEF0F0'}` : '1px solid #24262d', background: naverTheme ? (naverDark ? '#1c1c1c' : '#ffffff') : oyTheme ? (oyDark ? '#0F2222' : '#ffffff') : undefined }}>
        {uploadError && (
          <div className="mt-2 mb-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#ed424522', color: '#ed4245', border: '1px solid #ed424544' }}>
            ⚠ {uploadError}
          </div>
        )}
        {copyNotice && (
          <div className="mt-2 mb-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#57f28722', color: '#57f287', border: '1px solid #57f28744' }}>
            ✓ {copyNotice}
          </div>
        )}
        {replyTarget && (
          <div className="mt-2 mb-1 px-3 py-2 rounded-lg border flex items-start gap-2" style={{ background: '#2b2d31', borderColor: '#3a3f4a' }}>
            <div className="w-1 rounded-full self-stretch" style={{ background: 'var(--accent)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {replyTarget.sender?.username ?? `사용자${replyTarget.senderId}`}에게 답장
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {replyTarget.fileUrl ? '[파일]' : (replyTarget.content || '[메시지]')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)', background: 'transparent' }}
            >
              ✕
            </button>
          </div>
        )}
        {/* 갤러리 선택: accept="image/*"만 써야 Android에서 갤러리 앱이 열려 다중선택 가능
            (image/*,video/* 혼용 시 Files 앱이 열려 다중선택 안 됨) / iOS도 사진 보관함 다중선택 지원 */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        <form onSubmit={sendMessage} className="flex items-end gap-2 rounded-xl px-4 py-3" style={{ background: 'var(--input-bg)', padding: isMobile ? '10px 12px' : undefined }}>
          {/* 사진첩 버튼 */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 rounded-lg p-1.5 transition-all"
            style={{ color: uploading ? '#57f287' : 'var(--text-muted)', background: 'transparent' }}
            title="사진첩"
          >
            {uploading ? (
              uploadProgress ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#57f287', minWidth: 28, display: 'inline-block', textAlign: 'center' }}>{uploadProgress}</span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              )
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            )}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder=""
            className="chat-input flex-1 bg-transparent resize-none outline-none leading-relaxed"
            style={{ color: 'var(--text-primary)', maxHeight: '160px', fontSize: 16 }}
          />
          <button
            type="button"
            disabled={!input.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={sendMessage}
            className="flex-shrink-0 rounded-lg p-2 transition-all disabled:opacity-30"
            style={{ background: input.trim() ? 'var(--accent)' : 'transparent', color: input.trim() ? '#fff' : 'var(--text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"/>
            </svg>
          </button>
        </form>

      </div>
    </div>
  );
}

function formatTime(date: Date, mode: TimeFormatMode, timeZone?: string, senderLocalTime?: string): string {
  if (senderLocalTime && /^\d{2}:\d{2}$/.test(senderLocalTime)) {
    if (mode === '24h') return senderLocalTime;
    const [hourText, minuteText] = senderLocalTime.split(':');
    const hour = Number(hourText);
    const period = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 || 12;
    return `${period} ${displayHour}:${minuteText}`;
  }

  const validTimeZone = getValidTimeZone(timeZone);
  try {
    if (mode === '24h') {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: validTimeZone });
    }

    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: validTimeZone });
  } catch {
    return mode === '24h'
      ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

function formatSearchTime(date: Date, timeZone?: string, senderLocalTime?: string): string {
  const validTimeZone = getValidTimeZone(timeZone);
  let day: string;
  try {
    day = date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', timeZone: validTimeZone });
  } catch {
    day = date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  }
  const time = formatTime(date, '24h', timeZone, senderLocalTime);
  return `${day} ${time}`;
}

function SettingRow({
  label,
  value,
  onToggle,
  light = false,
}: {
  label: string;
  value: string;
  onToggle: () => void;
  light?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
      style={{
        background: light ? '#f7f8fb' : '#2b2d31',
        border: `1px solid ${light ? '#dfe3ea' : '#2b2d31'}`,
      }}
    >
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{value}</span>
    </button>
  );
}
