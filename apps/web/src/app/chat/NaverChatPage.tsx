'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { usePreferencesStore } from '@/store/preferences';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';

type RoomImageItem = { url: string; createdAt?: string };
type RoomFilter = 'all' | 'group' | 'dm' | 'archive';

// ────────── 유틸 ──────────
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function avatarColor(name: string): string {
  const colors = ['#03C75A', '#1a76c8', '#f7685b', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#10b981'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function getTouchDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

// ────────── 아이콘 ──────────
function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconPalette() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ────────── 속보 배너 ──────────
function BreakingBanner({ rooms }: { rooms: Room[] }) {
  const urgentRooms = rooms.filter((r) => (r.unreadCount ?? 0) > 0 && !r.isMuted);
  if (urgentRooms.length === 0) return null;
  const first = urgentRooms[0];
  const lastMsg = first.messages?.[0];
  return (
    <div style={{
      background: '#fff', borderBottom: '1px solid #e8e8e8',
      padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, height: 46,
    }}>
      <span style={{
        background: '#f7685b', color: '#fff', fontSize: 11, fontWeight: 800,
        padding: '2px 7px', borderRadius: 3, flexShrink: 0, letterSpacing: 0.5,
      }}>속보</span>
      <span style={{
        fontSize: 13, color: '#111', flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500,
      }}>
        [{first.name}]{lastMsg ? ` ${lastMsg.content}` : ' 읽지 않은 메시지'}
      </span>
      <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>
        {lastMsg ? timeAgo(lastMsg.createdAt) : ''}
      </span>
    </div>
  );
}

// ────────── 채팅 탭 필터 ──────────
function FilterTabs({ active, onChange }: { active: RoomFilter; onChange: (f: RoomFilter) => void }) {
  const tabs: { key: RoomFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'group', label: '그룹채팅' },
    { key: 'dm', label: 'DM' },
    { key: 'archive', label: '보관함' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 0, background: '#fff',
      borderBottom: '1px solid #e8e8e8', padding: '0 14px',
    }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 14px 9px', fontSize: 13.5, fontWeight: active === t.key ? 700 : 400,
            color: active === t.key ? '#03C75A' : '#666',
            borderBottom: active === t.key ? '2px solid #03C75A' : '2px solid transparent',
            marginBottom: -1,
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ────────── 섹션 헤더 ──────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px 10px', background: '#fff',
    }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{title}</span>
      {action && (
        <button onClick={onAction} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#03C75A', fontWeight: 600,
        }}>{action} ›</button>
      )}
    </div>
  );
}

// ────────── 채널 카드 (언론사 스타일) ──────────
function ChannelCard({ room, onOpen, onCreateRoom }: {
  room: Room;
  onOpen: (room: Room) => void;
  onCreateRoom?: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const lastMsg = room.messages?.[0];
  const unread = room.unreadCount ?? 0;
  const hasUnread = unread > 0 && !room.isMuted;

  return (
    <div
      onClick={() => onOpen(room)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        background: pressed ? '#f5fdf7' : hasUnread ? '#f0fbf5' : '#fff',
        borderBottom: '1px solid #f0f0f0',
        padding: '14px 14px 13px',
        cursor: 'pointer',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        transition: 'background 80ms',
      }}
    >
      {/* 아바타 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 23,
          background: room.isArchive ? '#a8edca' : avatarColor(room.name),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: room.isArchive ? 22 : 17, fontWeight: 800,
          boxShadow: hasUnread ? '0 0 0 2.5px #03C75A' : 'none',
        }}>
          {room.isArchive ? '📦' : room.name.charAt(0)}
        </div>
        {hasUnread && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, borderRadius: 9,
            background: '#f7685b', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px', boxShadow: '0 0 0 2px #fff',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
        {room.isMuted && (
          <span style={{
            position: 'absolute', right: -4, bottom: -2, width: 18, height: 18, borderRadius: 9,
            background: '#fff', color: '#aaa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px #e0e0e0', fontSize: 10,
          }}>🔇</span>
        )}
      </div>

      {/* 텍스트 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: hasUnread ? 800 : 700, fontSize: 14.5, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {room.name}
          </span>
          {room.isGroup && (
            <span style={{ fontSize: 10, color: '#03C75A', border: '1px solid #03C75A', borderRadius: 10, padding: '1px 6px', flexShrink: 0, fontWeight: 600 }}>
              그룹
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: hasUnread ? '#1a76c8' : '#888', fontWeight: hasUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMsg
            ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http'))
              ? '📷 사진'
              : lastMsg.content
            : room.isArchive ? '나의 보관함' : '아직 메시지가 없습니다'}
        </div>
      </div>

      {/* 시간 */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#bbb' }}>
          {lastMsg ? timeAgo(lastMsg.createdAt) : ''}
        </span>
        {room.members.length > 1 && (
          <span style={{ fontSize: 10.5, color: '#ccc' }}>{room.members.length}명</span>
        )}
      </div>
    </div>
  );
}

// ────────── 메인 컴포넌트 ──────────
export default function NaverChatPage() {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);
  const setChatTheme = usePreferencesStore((s) => s.setChatTheme);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all');
  const [viewingImageItems, setViewingImageItems] = useState<RoomImageItem[]>([]);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const touchStartX = useRef<number | null>(null);
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchMoved = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const viewingImages = useMemo(() => viewingImageItems.map((i) => i.url), [viewingImageItems]);
  const viewingImage = viewingImages[viewingImageIdx] ?? null;

  // hydration
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/login');
  }, [hydrated, accessToken, router]);

  // 방 목록 로드
  useEffect(() => {
    if (!accessToken) return;
    api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data)).catch(() => {});
  }, [accessToken, setRooms]);

  function openRoom(room: Room) {
    setRooms(rooms.map((r) => r.id === room.id ? { ...r, unreadCount: 0 } : r));
    setSelectedRoom({ ...room, unreadCount: 0 });
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  const filteredRooms = useMemo(() => rooms.filter((r) => {
    if (roomFilter === 'group') return r.isGroup && !r.isArchive;
    if (roomFilter === 'dm') return !r.isGroup && !r.isArchive;
    if (roomFilter === 'archive') return r.isArchive;
    return true;
  }), [rooms, roomFilter]);

  const totalUnread = useMemo(() =>
    rooms.reduce((acc, r) => acc + (!r.isMuted ? (r.unreadCount ?? 0) : 0), 0),
  [rooms]);

  if (!hydrated || !accessToken) return null;

  const HEADER_H = 52;

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100vh',
      background: '#f5f5f5',
      fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
      position: 'relative',
    }}>

      {/* ── 헤더 ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100, height: HEADER_H,
        background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
      }}>
        {selectedRoom ? (
          <>
            <button
              onClick={() => setSelectedRoom(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#111', padding: '4px 8px 4px 0', fontSize: 20, lineHeight: 1 }}
            >←</button>
            <div style={{
              width: 30, height: 30, borderRadius: 15,
              background: avatarColor(selectedRoom.name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}>
              {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedRoom.name}
            </span>
          </>
        ) : (
          <>
            {/* N 로고 */}
            <div style={{
              width: 30, height: 30, borderRadius: 6,
              background: '#03C75A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, fontStyle: 'italic', lineHeight: 1 }}>N</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#111', flex: 1 }}>마이클조던</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, display: 'flex', alignItems: 'center' }}
                title="새 채팅방"
              ><IconChat /></button>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, position: 'relative', display: 'flex', alignItems: 'center' }}
                title="알림"
              >
                <IconBell />
                {totalUnread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -5, minWidth: 16, height: 16, borderRadius: 8,
                    background: '#f7685b', color: '#fff', fontSize: 9, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                  }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
                )}
              </button>
              <button
                onClick={() => setChatTheme('slr')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, display: 'flex', alignItems: 'center' }}
                title="테마 변경 (SLR 스타일로 전환)"
              ><IconPalette /></button>
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#aaa', fontWeight: 600 }}
              >로그아웃</button>
            </div>
          </>
        )}
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <div ref={scrollRef} style={{ overflowY: selectedRoom ? 'hidden' : 'auto', height: selectedRoom ? `calc(100vh - ${HEADER_H}px)` : 'auto' }}>
        {selectedRoom ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - ${HEADER_H}px)` }}>
            <ChatWindow
              roomId={selectedRoom.id}
              onLeave={() => setSelectedRoom(null)}
              onImageView={(url, imageList, options) => {
                const idx = imageList.findIndex((item) => item.url === url);
                setViewingImageItems(imageList);
                setViewingImageIdx(idx >= 0 ? idx : 0);
                setImageZoom(1);
                setImagePan({ x: 0, y: 0 });
              }}
            />
          </div>
        ) : (
          <>
            {/* 속보 배너 */}
            <BreakingBanner rooms={rooms} />

            {/* 편집 헤더 */}
            <div style={{
              background: '#fff', padding: '12px 14px 0',
              borderBottom: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>채팅 구독 목록</span>
                  <span style={{ fontSize: 11, color: '#888' }}>필터 ▼</span>
                </div>
                <span style={{ fontSize: 12, color: '#03C75A', fontWeight: 600, cursor: 'pointer' }}>MY &gt;</span>
              </div>
            </div>

            {/* 필터 탭 */}
            <FilterTabs active={roomFilter} onChange={setRoomFilter} />

            {/* 채널 카드 목록 */}
            {filteredRooms.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
                <div style={{ fontSize: 14, color: '#aaa' }}>참여 중인 방이 없습니다</div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    marginTop: 16, background: '#03C75A', color: '#fff', border: 'none',
                    borderRadius: 20, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >새 채팅방 만들기</button>
              </div>
            ) : (
              <div style={{ background: '#fff' }}>
                {filteredRooms.map((room) => (
                  <ChannelCard key={room.id} room={room} onOpen={openRoom} />
                ))}
              </div>
            )}

            {/* 구분선 */}
            <div style={{ height: 8, background: '#f0f0f0' }} />

            {/* 사용자 프로필 카드 */}
            <div style={{
              background: '#fff', padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                background: user ? avatarColor(user.username) : '#ccc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0,
              }}>
                {user?.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={user.avatarUrl} alt={user.username} style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />
                  : user?.username?.charAt(0) ?? '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: '#03C75A', fontWeight: 600, marginTop: 2 }}>● 온라인</div>
              </div>
              <button
                onClick={handleLogout}
                style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 16, padding: '6px 14px', fontSize: 12, color: '#555', cursor: 'pointer', fontWeight: 600 }}
              >로그아웃</button>
            </div>

            <div style={{ height: 8, background: '#f0f0f0' }} />

            {/* 새 채팅방 FAB */}
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                position: 'fixed', bottom: 24,
                right: '50%', transform: 'translateX(50%) translateX(195px)',
                width: 52, height: 52, borderRadius: 26,
                background: '#03C75A', color: '#fff', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(3,199,90,0.45)', zIndex: 50,
              }}
              title="새 채팅방 만들기"
            ><IconPlus /></button>
          </>
        )}
      </div>

      {/* 이미지 라이트박스 */}
      {viewingImages.length > 0 && viewingImage && (
        <div
          onClick={() => setViewingImageItems([])}
          onTouchStart={(e) => {
            if (e.touches.length >= 2) {
              pinchStart.current = { distance: getTouchDistance(e.touches), zoom: imageZoom };
              pinchMoved.current = false;
              touchStartX.current = null;
              imageDragStart.current = null;
              return;
            }
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchMove={(e) => {
            if (!pinchStart.current || e.touches.length < 2) return;
            e.preventDefault();
            const start = pinchStart.current;
            const distance = getTouchDistance(e.touches);
            if (start.distance <= 0 || distance <= 0) return;
            const nextZoom = Math.min(4, Math.max(1, Number((start.zoom * (distance / start.distance)).toFixed(2))));
            pinchMoved.current = true;
            setImageZoom(nextZoom);
            if (nextZoom === 1) setImagePan({ x: 0, y: 0 });
          }}
          onTouchEnd={(e) => {
            if (pinchStart.current) {
              if (e.touches.length >= 2) return;
              pinchStart.current = null;
              if (pinchMoved.current) { pinchMoved.current = false; touchStartX.current = null; return; }
            }
            if (imageZoom > 1) return;
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) < 40) return;
            if (dx < 0) setViewingImageIdx((i) => Math.min(viewingImages.length - 1, i + 1));
            else setViewingImageIdx((i) => Math.max(0, i - 1));
          }}
          tabIndex={0}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            outline: 'none', touchAction: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewingImage} alt="이미지"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); setImageZoom((z) => z > 1 ? 1 : 2); setImagePan({ x: 0, y: 0 }); }}
            onPointerDown={(e) => {
              if (imageZoom <= 1) return;
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              imageDragStart.current = { x: e.clientX, y: e.clientY, panX: imagePan.x, panY: imagePan.y };
            }}
            onPointerMove={(e) => {
              if (!imageDragStart.current) return;
              e.stopPropagation();
              const s = imageDragStart.current;
              setImagePan({ x: s.panX + e.clientX - s.x, y: s.panY + e.clientY - s.y });
            }}
            onPointerUp={(e) => { e.stopPropagation(); imageDragStart.current = null; }}
            onPointerCancel={() => { imageDragStart.current = null; }}
            style={{
              maxWidth: '95vw', maxHeight: '78vh', borderRadius: 8, objectFit: 'contain', userSelect: 'none',
              cursor: imageZoom > 1 ? 'grab' : 'zoom-in',
              transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
              transition: imageDragStart.current ? 'none' : 'transform 120ms ease',
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setViewingImageItems([]); }}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          {viewingImageIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i - 1); }}
              style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
          )}
          {viewingImageIdx < viewingImages.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i + 1); }}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          )}
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            {viewingImageIdx + 1} / {viewingImages.length}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(room) => {
            setShowCreateModal(false);
            openRoom(room);
          }}
        />
      )}
    </div>
  );
}
