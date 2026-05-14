'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { RoomList } from '@/components/chat/RoomList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useChatStore } from '@/store/chat';

export default function ChatPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeRoomId = useChatStore((s) => s.activeRoomId);

  useEffect(() => {
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  if (!accessToken) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--chat-bg)' }}>
      {/* 사이드바 */}
      <aside className="w-64 shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}>
        <RoomList />
      </aside>

      {/* 메인 채팅 영역 */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--chat-bg)' }}>
        {activeRoomId ? (
          <ChatWindow roomId={activeRoomId} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-lg font-medium">채팅방을 선택하세요</p>
            <p className="text-sm">왼쪽에서 채팅방을 선택하거나 + 버튼으로 새로 만드세요</p>
          </div>
        )}
      </main>
    </div>
  );
}
