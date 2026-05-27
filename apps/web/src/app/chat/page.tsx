'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';

/* ── 채팅방 게시물 아이템 ───────────────────────────────── */
function PostItem({ room, onClick }: { room: Room; onClick: () => void }) {
  const lastMsg = room.messages?.[room.messages.length - 1];
  const memberCount = room.members.length;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '10px 14px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid #f2f2f2',
        cursor: 'pointer',
        textAlign: 'left',
        gap: 6,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f8f8')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', flexShrink: 0 }}>
        [{room.isGroup ? '그룹' : 'DM'}]
      </span>
      <span style={{ fontSize: 14, color: '#222', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {room.name}
        {lastMsg && (
          <span style={{ color: '#bbb', fontSize: 12, marginLeft: 6 }}>
            {lastMsg.content.slice(0, 25)}{lastMsg.content.length > 25 ? '…' : ''}
          </span>
        )}
      </span>
      {memberCount > 0 && (
        <span style={{
          minWidth: 20, height: 20,
          borderRadius: 10,
          background: '#d94f00',
          color: '#fff',
          fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px',
          flexShrink: 0,
        }}>
          {memberCount}
        </span>
      )}
    </button>
  );
}

/* ── 섹션 헤더 ──────────────────────────────────────────── */
function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      padding: '10px 14px 8px',
      fontSize: 15,
      fontWeight: 'bold',
      color: '#222',
      borderBottom: '2px solid #ddd',
    }}>
      {title}
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────────── */
export default function ChatPage() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  useEffect(() => {
    if (accessToken) {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
    }
  }, [accessToken, setRooms]);

  function handleCreated(room: Room) {
    setRooms([room, ...rooms]);
    setSelectedRoom(room);
  }

  function handleLogout() {
    clear();
    router.replace('/login');
  }

  if (!accessToken) return null;

  /* 섹션별 분류 */
  const groupRooms = rooms.filter((r) => r.isGroup);
  const dmRooms = rooms.filter((r) => !r.isGroup);
  const popular = [...groupRooms]
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 5);
  const recommended = [...rooms]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const allRecent = [...rooms]
    .sort((a, b) => {
      const aTime = a.messages?.[a.messages.length - 1]?.createdAt ?? a.createdAt;
      const bTime = b.messages?.[b.messages.length - 1]?.createdAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .slice(0, 8);

  const HEADER_H = 44;
  const NAV_H = 64;
  const CHAT_H = `calc(100vh - ${HEADER_H}px - ${NAV_H}px)`;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', fontFamily: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }}>

      {/* ── 헤더 ──────────────────────────────────────────── */}
      <header style={{
        background: '#1a5f96',
        color: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: HEADER_H,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', height: '100%', padding: '0 14px' }}>
          {/* 로고 */}
          <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: -2, fontStyle: 'italic', flex: 1, lineHeight: 1 }}>
            CHAT
          </div>
          {/* 사용자 & 로그아웃 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {user?.username && (
              <span style={{ fontWeight: 600, fontSize: 13 }}>{user.username}</span>
            )}
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: 'none',
                color: '#fff',
                padding: '4px 11px',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      {/* ── 아이콘 네비게이션 ──────────────────────────────── */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e4e4e4',
        position: 'sticky',
        top: HEADER_H,
        zIndex: 99,
        height: NAV_H,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', height: '100%' }}>
          {[
            { icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              ), label: '커뮤니티', action: undefined },
            { icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              ), label: '채팅방', action: () => setShowModal(true) },
            { icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              ), label: '갤러리', action: undefined },
            { icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              ), label: '인포메이션', action: undefined },
            { icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
              ), label: '마켓', action: undefined },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 0',
                background: 'none',
                border: 'none',
                cursor: action ? 'pointer' : 'default',
                fontSize: 10,
                color: '#555',
                gap: 3,
              }}
              onMouseEnter={(e) => {
                if (action) e.currentTarget.style.background = '#f4f4f4';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── 본문 ──────────────────────────────────────────── */}
      <main style={{ maxWidth: 640, margin: '0 auto', background: '#fff', minHeight: CHAT_H }}>
        {selectedRoom ? (
          /* 채팅 화면 */
          <div style={{ display: 'flex', flexDirection: 'column', height: CHAT_H }}>
            {/* 채팅방 제목 바 */}
            <div style={{
              background: '#fff',
              borderBottom: '1px solid #e4e4e4',
              padding: '9px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}>
              <button
                onClick={() => setSelectedRoom(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#1a5f96',
                  fontSize: 14,
                  fontWeight: 700,
                  padding: '2px 8px 2px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← 목록
              </button>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#222' }}>{selectedRoom.name}</span>
              <span style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>
                {selectedRoom.isGroup ? `멤버 ${selectedRoom.members.length}명` : 'DM'}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChatWindow roomId={selectedRoom.id} />
            </div>
          </div>
        ) : (
          /* 게시판 목록 */
          <div>
            {/* 인기글 */}
            <section>
              <SectionTitle title="인기글" />
              {popular.length === 0 ? (
                <p style={{ padding: '14px', color: '#bbb', fontSize: 13 }}>채팅방이 없습니다.</p>
              ) : (
                popular.map((r) => (
                  <PostItem key={r.id} room={r} onClick={() => setSelectedRoom(r)} />
                ))
              )}
            </section>

            {/* 추천인기글 */}
            <section style={{ marginTop: 8 }}>
              <SectionTitle title="추천인기글" />
              {recommended.length === 0 ? (
                <p style={{ padding: '14px', color: '#bbb', fontSize: 13 }}>채팅방이 없습니다.</p>
              ) : (
                recommended.map((r) => (
                  <PostItem key={r.id} room={r} onClick={() => setSelectedRoom(r)} />
                ))
              )}
            </section>

            {/* 최신글 */}
            <section style={{ marginTop: 8 }}>
              <SectionTitle title="최신글" />
              {allRecent.length === 0 ? (
                <p style={{ padding: '14px', color: '#bbb', fontSize: 13 }}>채팅방이 없습니다.</p>
              ) : (
                allRecent.map((r) => (
                  <PostItem key={r.id} room={r} onClick={() => setSelectedRoom(r)} />
                ))
              )}
            </section>

            {/* 시장정보 — 1:1 DM */}
            <section style={{ marginTop: 8 }}>
              <SectionTitle title="시장정보" />
              {dmRooms.length === 0 ? (
                <p style={{ padding: '14px', color: '#bbb', fontSize: 13 }}>1:1 DM 채팅방이 없습니다.</p>
              ) : (
                dmRooms.map((r) => (
                  <PostItem key={r.id} room={r} onClick={() => setSelectedRoom(r)} />
                ))
              )}
            </section>
          </div>
        )}
      </main>

      {/* 채팅방 생성 모달 */}
      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}
