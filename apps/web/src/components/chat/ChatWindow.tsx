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

export function ChatWindow({ roomId }: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rooms = useChatStore((s) => s.rooms);
  const messages = useChatStore((s) => s.messages[roomId] ?? []);
  const addMessage = useChatStore((s) => s.addMessage);
  const setMessages = useChatStore((s) => s.setMessages);
  const markRead = useChatStore((s) => s.markRead);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeRoom = rooms.find((r) => r.id === roomId);

  useEffect(() => {
    api
      .get<{ data: { messages: Message[] } }>(`/messages/${roomId}`)
      .then((res) => setMessages(roomId, res.data.data.messages));
  }, [roomId, setMessages]);

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
      if (date !== lastDate) {
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
      items.push(
        <MessageBubble key={msg.id} message={msg} isMine={isMine} isConsecutive={isConsecutive} />
      );
      lastSenderId = msg.senderId;
    });
    return items;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--chat-bg)' }}>
      {/* 채널 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shadow-md flex-shrink-0"
        style={{ borderColor: '#1e1f22', background: 'var(--chat-bg)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          {activeRoom?.isGroup
            ? <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>
            : <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
        </svg>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {activeRoom?.name ?? ''}
        </span>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {renderMessages()}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="px-4 pb-5 flex-shrink-0">
        <form onSubmit={sendMessage} className="flex items-end gap-2 rounded-xl px-4 py-3" style={{ background: 'var(--input-bg)' }}>
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


