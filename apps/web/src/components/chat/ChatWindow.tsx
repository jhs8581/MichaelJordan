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

export function ChatWindow({ roomId }: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const rooms = useChatStore((s) => s.rooms);
  const messages = useChatStore((s) => s.messages[roomId] ?? []);
  const addMessage = useChatStore((s) => s.addMessage);
  const setMessages = useChatStore((s) => s.setMessages);
  const markRead = useChatStore((s) => s.markRead);

  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<ChatViewSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // 잠금 오버레이 표시 여부
  const [isContentUnlocked, setIsContentUnlocked] = useState(() => !((useAuthStore.getState().user?.chatLockCode ?? '').trim().length > 0)); // 메시지 표시 여부
  const [lockEntry, setLockEntry] = useState('');
  const [lockError, setLockError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
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

    socket.on('message:new', (msg) => {
      if (msg.roomId !== roomId) return;
      addMessage(roomId, msg);
      socket.emit('message:read', { roomId, messageId: msg.id });
    });
    socket.on('message:read', ({ roomId: rId, userId, lastReadMessageId }) => {
      markRead(rId, userId, lastReadMessageId);
    });
    return () => {
      socket.off('message:new');
      socket.off('message:read');
    };
  }, [roomId, accessToken, addMessage, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const apply = (matches: boolean) => setIsMobile(matches);

    apply(media.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

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

      // 잠금 화면에서 Ctrl+숫자 → 코드 입력
      if (!isLocked) return;
      if (!event.ctrlKey) return;
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

  function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || !accessToken) return;
    const socket = getSocket(accessToken);
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
          <MessageBubble key={msg.id} message={msg} isMine={isMine} isConsecutive={isConsecutive} timeFormat={settings.timeFormat} />
        );
      }
      lastSenderId = msg.senderId;
    });
    return items;
  }

  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--chat-bg)' }}>
      {/* 채널 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shadow-md flex-shrink-0"
        style={{ borderColor: '#1e1f22', background: 'var(--chat-bg)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          {activeRoom?.isGroup
            ? <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>
            : <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
        </svg>
        {/* 모바일: 방 이름 길게 누르면 잠금/잠금화면표시 */}
        <span
          className="font-semibold text-sm select-none"
          style={{ color: 'var(--text-primary)' }}
          onContextMenu={isMobile ? (e) => e.preventDefault() : undefined}
          onTouchStart={isMobile && canLock ? () => {
            longPressTimer.current = setTimeout(() => lockChat(), 2000);
          } : undefined}
          onTouchEnd={isMobile && canLock ? () => {
            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
          } : undefined}
          onTouchMove={isMobile && canLock ? () => {
            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
          } : undefined}
        >
          {activeRoom?.name ?? ''}
        </span>
        <div className="flex-1" />
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
          </div>
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isContentUnlocked && renderMessages()}
        <div ref={bottomRef} />
      </div>

      {isLocked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6" style={{ background: 'rgba(10, 12, 16, 0.68)' }}>
          <div className="w-full max-w-md rounded-2xl border p-5 shadow-2xl" style={{ background: '#17191d', borderColor: '#3a3f4a' }}>
            <div className="mb-4 text-center">
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>잠금 상태</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Ctrl + 숫자키 또는 아래 버튼을 순서대로 입력하세요</p>
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
                onClick={unlockChat}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                강제 해제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div className={`px-4 pb-5 flex-shrink-0 ${(isLocked || !isContentUnlocked) ? 'pointer-events-none opacity-40' : ''}`}>
        <form onSubmit={sendMessage} className="flex items-end gap-2 rounded-xl px-4 py-3" style={{ background: 'var(--input-bg)', padding: isMobile ? '10px 12px' : undefined }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`#${activeRoom?.name ?? '채팅방'}에 메시지 보내기`}
            className="chat-input flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
            style={{ color: 'var(--text-primary)', maxHeight: '160px' }}
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
        <p className="mt-1.5 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Enter로 전송 · Shift+Enter로 줄바꿈
        </p>
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


