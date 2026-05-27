'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import type { Message } from '@chat/types';
import { MessageBubble } from './MessageBubble';

interface Props {
  roomId: number;
  onLeave?: () => void;
  onImageView?: (url: string) => void;
}

type ChatViewMode = 'bubble' | 'memo';
type TimeFormatMode = 'ampm' | '24h';
type LockDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

const LOCK_DIGITS: LockDigit[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

type ChatViewSettings = {
  viewMode: ChatViewMode;
  timeFormat: TimeFormatMode;
  showNickname: boolean;
  showDateSeparator: boolean;
};

const DEFAULT_SETTINGS: ChatViewSettings = {
  viewMode: 'bubble',
  timeFormat: 'ampm',
  showNickname: true,
  showDateSeparator: true,
};

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

export function ChatWindow({ roomId, onLeave, onImageView }: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [lockCodeInput, setLockCodeInput] = useState('');
  const [lockCodeSaving, setLockCodeSaving] = useState(false);
  const [lockCodeMsg, setLockCodeMsg] = useState('');
  const rooms = useChatStore((s) => s.rooms);
  const removeRoom = useChatStore((s) => s.removeRoom);
  const messages = useChatStore((s) => s.messages[roomId] ?? []);
  const addMessage = useChatStore((s) => s.addMessage);
  const setMessages = useChatStore((s) => s.setMessages);
  const markRead = useChatStore((s) => s.markRead);

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
  // 타이핑 중인 사용자 목록 { userId, username }
  const [typingUsers, setTypingUsers] = useState<{ userId: number; username: string }[]>([]);
  // 온라인 사용자 ID 세트
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeRoom = rooms.find((r) => r.id === roomId);
  const lockCode = (user?.chatLockCode ?? '').trim();
  const canLock = lockCode.length > 0;

  useEffect(() => {
    api
      .get<{ data: { messages: Message[] } }>(`/messages/${roomId}`)
      .then((res) => {
        const msgs = res.data.data.messages;
        setMessages(roomId, msgs);
        // 채팅방 열 때 마지막 메시지 읽음 처리
        if (msgs.length > 0 && accessToken) {
          const socket = getSocket(accessToken);
          socket.emit('message:read', { roomId, messageId: msgs[msgs.length - 1].id });
        }
      });
  }, [roomId, setMessages, accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    api
      .get<{ data: { id: number; email: string; username: string; chatLockCode?: string; avatarUrl?: string; isOnline: boolean; createdAt: string } }>('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => {
        // 인증 만료 등은 기존 인터셉터에서 처리
      });
  }, [accessToken, setUser]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    if (!socket.connected) socket.connect();
    socket.emit('room:join', roomId);
    // 이 채팅방을 보고 있다고 서버에 알림 → 이 방의 푸시 알림 수신 제외
    socket.emit('room:viewing', roomId);

    socket.on('message:new', (msg) => {
      if (msg.roomId !== roomId) return;
      addMessage(roomId, msg);
      socket.emit('message:read', { roomId, messageId: msg.id });
    });
    socket.on('message:read', ({ roomId: rId, userId, lastReadMessageId }) => {
      markRead(rId, userId, lastReadMessageId);
    });
    socket.on('typing:update', ({ roomId: rId, userId: uid, username, isTyping }) => {
      if (rId !== roomId || uid === user?.id) return;
      setTypingUsers((prev) =>
        isTyping
          ? prev.some((u) => u.userId === uid) ? prev : [...prev, { userId: uid, username }]
          : prev.filter((u) => u.userId !== uid)
      );
    });
    socket.on('user:status', ({ userId: uid, isOnline }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(uid); else next.delete(uid);
        return next;
      });
    });
    return () => {
      // 채팅창 닫힘 → 더 이상 이 방을 보고 있지 않음, 푸시 다시 받기
      socket.emit('room:stop-viewing', roomId);
      socket.off('message:new');
      socket.off('message:read');
      socket.off('typing:update');
      socket.off('user:status');
    };
  }, [roomId, accessToken, addMessage, markRead]);

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
    if (!hasScrolledToBottom.current) {
      // 처음 진입 or 방 전환 시 → 메시지가 있으면 무조건 맨 아래로
      if (messages.length > 0) {
        // requestAnimationFrame: DOM 레이아웃 완료 후 스크롤 (scrollIntoView보다 안정적)
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
        hasScrolledToBottom.current = true;
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
  }, [messages]);

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

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch();
  }

  const [showScrollBtn, setShowScrollBtn] = useState(false);

  function handleScrollContainerScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }

  function scrollToBottom() {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || !accessToken) return;
    const socket = getSocket(accessToken);
    // 보낼 때 타이핑 중지
    socket.emit('typing:stop', { roomId });
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
    socket.emit('message:send', { roomId, content });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
    const socket = getSocket(accessToken);
    socket.emit('typing:start', { roomId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { roomId });
      typingTimer.current = null;
    }, 2500);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    e.target.value = '';
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? '')}/api/messages/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setUploadError(err.error ?? `업로드 실패 (${res.status})`);
        setTimeout(() => setUploadError(''), 4000);
        return;
      }
      const json = await res.json() as { success: boolean; data?: { url: string } };
      if (json.success && json.data?.url) {
        const socket = getSocket(accessToken);
        socket.emit('message:send', { roomId, content: '', fileUrl: json.data.url });
      } else {
        setUploadError('업로드에 실패했습니다.');
        setTimeout(() => setUploadError(''), 4000);
      }
    } catch {
      setUploadError('네트워크 오류로 업로드 실패');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setUploading(false);
    }
  }

  // 날짜 구분선 렌더링
  function renderMessages() {
    const items: React.ReactNode[] = [];
    let lastDate = '';
    let lastSenderId = -1;

    messages.forEach((msg, i) => {
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
        const time = formatTime(new Date(msg.createdAt), settings.timeFormat);
        const prefix = settings.showNickname ? `[${senderName}][${time}]` : `[${time}]`;
        items.push(
          <p
            key={msg.id}
            className="text-sm leading-7 whitespace-pre-wrap break-words"
            style={{ color: 'var(--text-primary)', fontFamily: 'Consolas, "Courier New", monospace' }}
          >
            {prefix} {msg.content}
          </p>
        );
      } else {
        items.push(
          <MessageBubble key={msg.id} message={msg} isMine={isMine} isConsecutive={isConsecutive} timeFormat={settings.timeFormat} onImageClick={onImageView} />
        );
      }
      lastSenderId = msg.senderId;
    });
    return items;
  }

  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--chat-bg)' }}>
      {/* 채널 헤더 — 모바일: 헤더 길게 누르면 잠금 */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b shadow-md flex-shrink-0"
        style={{ borderColor: '#1e1f22', background: 'var(--chat-bg)' }}
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
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {activeRoom?.name ?? ''}
        </span>
        {/* 온라인 상태 (담화망 DM 방) */}
        {activeRoom && !activeRoom.isGroup && (() => {
          const otherMember = activeRoom.members.find((m) => m.userId !== user?.id);
          const isOnline = otherMember ? onlineUserIds.has(otherMember.userId) : false;
          return (
            <span className="flex items-center gap-1 text-xs" style={{ color: isOnline ? '#57f287' : 'var(--text-muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#57f287' : '#72767d', display: 'inline-block', flexShrink: 0 }} />
              {isOnline ? '온라인' : '오프라인'}
            </span>
          );
        })()}
        <div className="flex-1" />
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
            <div className="flex items-center rounded-md p-1" style={{ background: '#2b2d31', gap: 4 }}>
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
        <div className="flex items-center gap-2 px-3 pb-2" style={{ background: 'var(--chat-bg)', borderBottom: '1px solid #1e1f22' }}>
          <button
            type="button"
            data-chat-settings-button
            onClick={() => setSettingsOpen((current) => !current)}
            className="text-[11px] px-2 py-1 rounded-md"
            style={{ background: settingsOpen ? '#3a3f4a' : '#2b2d31', color: 'var(--text-muted)' }}
          >
            설정
          </button>
          <div className="flex items-center rounded-md p-1" style={{ background: '#2b2d31', gap: 4 }}>
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
          style={{ background: '#1f2126', borderColor: '#3a3f4a', right: isMobile ? 8 : 16, top: isMobile ? 84 : 56, width: isMobile ? 'calc(100% - 16px)' : 256 }}
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
            />
            <SettingRow
              label="닉네임 표시"
              value={settings.showNickname ? '켜짐' : '꺼짐'}
              onToggle={() => updateSettings({ showNickname: !settings.showNickname })}
            />
            <SettingRow
              label="날짜 구분선"
              value={settings.showDateSeparator ? '켜짐' : '꺼짐'}
              onToggle={() => updateSettings({ showDateSeparator: !settings.showDateSeparator })}
            />

            {/* 잠금 코드 설정 */}
            <div className="pt-2 border-t" style={{ borderColor: '#3a3f4a' }}>
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
                  style={{ background: '#2b2d31', color: 'var(--text-primary)', border: '1px solid #3a3f4a' }}
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
                const time = new Date(msg.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={msg.id} className="rounded-lg px-3 py-2" style={{ background: '#2b2d31' }}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={{ color: isMine ? '#5865f2' : 'var(--text-primary)' }}>{name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{time}</span>
                    </div>
                    {msg.fileUrl
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>[이미지]</span>
                      : <p className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                          {searchKeyword.trim()
                            ? msg.content.split(new RegExp(`(${searchKeyword.trim()})`, 'gi')).map((part, i) =>
                                part.toLowerCase() === searchKeyword.trim().toLowerCase()
                                  ? <mark key={i} style={{ background: '#fde047', color: '#111', borderRadius: 2 }}>{part}</mark>
                                  : part
                              )
                            : msg.content
                          }
                        </p>
                    }
                  </div>
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

      {/* 메시지 목록 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ position: 'relative' }}
        onScroll={handleScrollContainerScroll}
      >
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
      <div className={`px-4 pb-5 flex-shrink-0 ${(isLocked || !isContentUnlocked) ? 'pointer-events-none opacity-40' : ''}`}
        style={{ borderTop: '2px solid #1e1f22' }}>
        {uploadError && (
          <div className="mt-2 mb-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#ed424522', color: '#ed4245', border: '1px solid #ed424544' }}>
            ⚠ {uploadError}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <form onSubmit={sendMessage} className="flex items-end gap-2 rounded-xl px-4 py-3" style={{ background: 'var(--input-bg)', padding: isMobile ? '10px 12px' : undefined }}>
          {/* 이미지 체널 버튼 */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 rounded-lg p-1.5 transition-all"
            style={{ color: uploading ? '#57f287' : 'var(--text-muted)', background: 'transparent' }}
            title="사진 첨부"
          >
            {uploading
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            }
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder=""
            className="chat-input flex-1 bg-transparent resize-none outline-none leading-relaxed"
            style={{ color: 'var(--text-primary)', maxHeight: '160px', fontSize: 16 }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
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

function formatTime(date: Date, mode: TimeFormatMode): string {
  if (mode === '24h') {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function SettingRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
      style={{ background: '#2b2d31' }}
    >
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{value}</span>
    </button>
  );
}


