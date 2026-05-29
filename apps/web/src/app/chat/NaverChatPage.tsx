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

function avatarColor(name: string): string {
  const colors = ['#03C75A', '#1a76c8', '#f7685b', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#10b981'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
function getTouchDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

// ── 아이콘 ────────────────────────────────────────────────────────────────────
function IconHamburger() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function IconBell() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IconMic() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function IconPalette() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>;
}
function IconPlus() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IconChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
}

// ── 채팅방 카드 (더블클릭으로 진입) ──────────────────────────────────────────
function RoomCard({ room, onDoubleClick }: { room: Room; onDoubleClick: () => void }) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCount = useRef(0);
  const [flash, setFlash] = useState(false);
  const lastMsg = room.messages?.[0];
  const unread = room.unreadCount ?? 0;
  const hasUnread = unread > 0 && !room.isMuted;
  const color = room.isArchive ? '#34d399' : avatarColor(room.name);

  function handleClick() {
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickCount.current = 0;
    }, 320);
    if (clickCount.current >= 2) {
      clickCount.current = 0;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      onDoubleClick();
    }
  }

  // 모바일: 더블탭
  const lastTapRef = useRef<number>(0);
  function handleTouchEnd() {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      onDoubleClick();
    }
    lastTapRef.current = now;
  }

  return (
    <div
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      style={{
        background: flash ? '#d4f7e4' : '#fff',
        borderRadius: 0,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 120ms',
        overflow: 'hidden',
      }}
    >
      {/* 썸네일 */}
      <div style={{
        width: '100%', aspectRatio: '1 / 1',
        background: `linear-gradient(145deg, ${color}cc, ${color}66)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#fff', userSelect: 'none' }}>
          {room.isArchive ? '📦' : room.name.charAt(0)}
        </span>
        {hasUnread && (
          <span style={{
            position: 'absolute', top: 7, right: 7,
            background: '#f7685b', color: '#fff', borderRadius: 10,
            fontSize: 9, fontWeight: 800, padding: '2px 7px',
            boxShadow: '0 1px 5px rgba(0,0,0,0.28)',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
        {room.isMuted && <span style={{ position: 'absolute', top: 7, left: 7, fontSize: 13 }}>🔇</span>}
        {/* 더블클릭 힌트 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.38))',
          padding: '18px 8px 5px',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        }}>
          {lastMsg && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{timeAgo(lastMsg.createdAt)}</span>}
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.2 }}>더블탭 입장</span>
        </div>
      </div>
      {/* 텍스트 */}
      <div style={{ padding: '8px 9px 10px', background: '#fff' }}>
        <div style={{
          fontSize: 13, fontWeight: hasUnread ? 800 : 700, color: '#111',
          marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{room.name}</div>
        <div style={{
          fontSize: 11.5, color: hasUnread ? '#1a76c8' : '#999', fontWeight: hasUnread ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {lastMsg
            ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http') ? '📷 사진' : lastMsg.content)
            : (room.isArchive ? '나의 보관함' : '대화를 시작해보세요')}
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
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
  const totalUnread = useMemo(() =>
    rooms.reduce((acc, r) => acc + (!r.isMuted ? (r.unreadCount ?? 0) : 0), 0), [rooms]);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/login');
  }, [hydrated, accessToken, router]);
  useEffect(() => {
    if (!accessToken) return;
    api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data)).catch(() => {});
  }, [accessToken, setRooms]);

  function openRoom(room: Room) {
    setRooms(rooms.map((r) => r.id === room.id ? { ...r, unreadCount: 0 } : r));
    setSelectedRoom({ ...room, unreadCount: 0 });
  }

  if (!hydrated || !accessToken) return null;

  const HEADER_H = 52;

  // ── 이미지 라이트박스 ─────────────────────────────────────────────────────────
  const lightbox = viewingImages.length > 0 && viewingImage ? (
    <div
      onClick={() => setViewingImageItems([])}
      onTouchStart={(e) => {
        if (e.touches.length >= 2) {
          pinchStart.current = { distance: getTouchDistance(e.touches), zoom: imageZoom };
          pinchMoved.current = false; touchStartX.current = null; return;
        }
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchMove={(e) => {
        if (!pinchStart.current || e.touches.length < 2) return;
        e.preventDefault();
        const d = getTouchDistance(e.touches);
        if (pinchStart.current.distance <= 0 || d <= 0) return;
        const nz = Math.min(4, Math.max(1, Number((pinchStart.current.zoom * (d / pinchStart.current.distance)).toFixed(2))));
        pinchMoved.current = true; setImageZoom(nz);
        if (nz === 1) setImagePan({ x: 0, y: 0 });
      }}
      onTouchEnd={(e) => {
        if (pinchStart.current) {
          if (e.touches.length >= 2) return;
          pinchStart.current = null;
          if (pinchMoved.current) { pinchMoved.current = false; touchStartX.current = null; return; }
        }
        if (imageZoom > 1 || touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) setViewingImageIdx((i) => Math.min(viewingImages.length - 1, i + 1));
        else setViewingImageIdx((i) => Math.max(0, i - 1));
      }}
      tabIndex={0}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', touchAction: 'none' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={viewingImage} alt="이미지" onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); setImageZoom((z) => z > 1 ? 1 : 2); setImagePan({ x: 0, y: 0 }); }}
        onPointerDown={(e) => { if (imageZoom <= 1) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); imageDragStart.current = { x: e.clientX, y: e.clientY, panX: imagePan.x, panY: imagePan.y }; }}
        onPointerMove={(e) => { if (!imageDragStart.current) return; e.stopPropagation(); const s = imageDragStart.current; setImagePan({ x: s.panX + e.clientX - s.x, y: s.panY + e.clientY - s.y }); }}
        onPointerUp={(e) => { e.stopPropagation(); imageDragStart.current = null; }}
        onPointerCancel={() => { imageDragStart.current = null; }}
        style={{ maxWidth: '95vw', maxHeight: '78vh', borderRadius: 8, objectFit: 'contain', userSelect: 'none', cursor: imageZoom > 1 ? 'grab' : 'zoom-in', transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`, transition: imageDragStart.current ? 'none' : 'transform 120ms ease' }}
      />
      <button onClick={(e) => { e.stopPropagation(); setViewingImageItems([]); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      {viewingImageIdx > 0 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i - 1); }} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>}
      {viewingImageIdx < viewingImages.length - 1 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i + 1); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{viewingImageIdx + 1} / {viewingImages.length}</div>
    </div>
  ) : null;

  // ── 채팅방 열린 상태 ──────────────────────────────────────────────────────────
  if (selectedRoom) {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100dvh', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: HEADER_H, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
          <button onClick={() => setSelectedRoom(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#111', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: avatarColor(selectedRoom.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
          </div>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRoom.name}</span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatWindow roomId={selectedRoom.id} onLeave={() => setSelectedRoom(null)}
            onImageView={(url, imageList) => {
              const idx = imageList.findIndex((item) => item.url === url);
              setViewingImageItems(imageList); setViewingImageIdx(idx >= 0 ? idx : 0);
              setImageZoom(1); setImagePan({ x: 0, y: 0 });
            }}
          />
        </div>
        {lightbox}
      </div>
    );
  }

  // ── 네이버 메인 홈 화면 ────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#eef0f3', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif' }}>

      {/* ① 헤더 */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: '#eef0f3', height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 4, display: 'flex', alignItems: 'center' }}><IconHamburger /></button>
        {/* pay 로고 */}
        <div style={{ width: 52, height: 28, borderRadius: 7, border: '1.5px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#555', fontSize: 13, fontWeight: 900, letterSpacing: -0.5 }}>pay</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* 알림 */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', position: 'relative', display: 'flex', alignItems: 'center', padding: 4 }}>
          <IconBell />
          {totalUnread > 0 && (
            <span style={{ position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, background: '#f7685b', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
        {/* 프로필 아바타 (클릭 시 SLR 테마로 전환) */}
        <button onClick={() => setChatTheme('slr')} title="SLR 테마로 전환" style={{ width: 34, height: 34, borderRadius: 17, background: user ? avatarColor(user.username) : '#ccc', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {user?.username?.charAt(0) ?? '?'}
        </button>
      </header>

      {/* ② 검색바 */}
      <div style={{ padding: '0 12px 14px', background: '#eef0f3' }}>
        <div style={{ background: '#fff', borderRadius: 28, height: 52, display: 'flex', alignItems: 'center', paddingLeft: 18, paddingRight: 6, gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <span style={{ color: '#03C75A', fontWeight: 900, fontSize: 26, fontStyle: 'italic', lineHeight: 1, flexShrink: 0 }}>N</span>
          <span style={{ flex: 1, fontSize: 15, color: '#c8c8c8', userSelect: 'none' }}>검색어를 입력하세요</span>
          <button style={{ width: 40, height: 40, borderRadius: 20, background: '#03C75A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconMic />
          </button>
        </div>
      </div>

      {/* ③ 배너 (읽지 않은 메시지 or 고정 이벤트 배너) */}
      <div style={{ background: '#fff', marginBottom: 8, padding: '0 14px' }}>
        {totalUnread > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fff0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>💬</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                읽지 않은 메시지 {totalUnread}개
              </div>
              <div style={{ fontSize: 12, color: '#f7685b', fontWeight: 600, marginTop: 2 }}>
                {rooms.filter((r) => !r.isMuted && (r.unreadCount ?? 0) > 0).map((r) => r.name).join(', ')}
              </div>
            </div>
            <div style={{ color: '#ccc', flexShrink: 0 }}><IconChevronRight /></div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fff5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🎯</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111' }}>마이클조던 채팅</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>채팅방을 더블탭하여 입장하세요</div>
            </div>
            <div style={{ color: '#ccc', flexShrink: 0 }}><IconChevronRight /></div>
          </div>
        )}

        {/* ④ 빠른 서비스 아이콘 */}
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '14px 0 4px', gap: 0, scrollbarWidth: 'none' as const }}>
          {[
            { bg: '#03C75A', emoji: '✉️', label: '메일' },
            { bg: '#6db33f', emoji: '☕', label: '카페' },
            { bg: '#1ec800', emoji: '🛍️', label: 'N쇼핑', active: false },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22 }}>{s.emoji}</span>
              </div>
              <span style={{ fontSize: 11, color: '#444' }}>{s.label}</span>
            </div>
          ))}
          {/* 구분선 */}
          <div style={{ width: 1, height: 46, background: '#e8e8e8', alignSelf: 'center', margin: '0 6px', flexShrink: 0 }} />
          {['뉴스', '스포츠', '엔터', '쇼핑', '경제', '클립'].map((label) => (
            <button key={label} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', flexShrink: 0, fontSize: 13.5, color: '#444', height: 46, display: 'flex', alignItems: 'center' }}>{label}</button>
          ))}
        </div>

        {/* ⑤ 이벤트 공지 스트립 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📢</span>
          <span style={{ fontSize: 13, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            채팅방 카드를 <strong>더블탭(더블클릭)</strong>하면 바로 입장됩니다
          </span>
        </div>
      </div>

      {/* ⑥ 날씨 / 주가 스트립 */}
      <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 22 }}>🌙</span>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>--°</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>
              {user?.timeZone?.includes('/') ? user.timeZone.split('/')[1].replace('_', ' ') : '서울'}
            </span>
          </div>
        </div>
        <div style={{ width: 1, height: 26, background: '#e8e8e8' }} />
        <div style={{ flex: 1, paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#666' }}>코스피</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>--</span>
          <span style={{ fontSize: 11, color: '#03C75A', fontWeight: 700 }}>▲</span>
        </div>
      </div>

      {/* ⑦ 채팅방 카드 2열 그리드 (메인 컨텐츠) */}
      <div style={{ background: '#fff', marginBottom: 8 }}>
        {/* 섹션 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>채팅</span>
            {totalUnread > 0 && (
              <span style={{ background: '#f7685b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '2px 7px' }}>{totalUnread}</span>
            )}
          </div>
          <button onClick={() => setShowCreateModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#03C75A', fontWeight: 600 }}>
            + 채팅방 추가
          </button>
        </div>

        {rooms.length === 0 ? (
          <div style={{ padding: '40px 0 48px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14, color: '#aaa', marginBottom: 18 }}>참여 중인 채팅방이 없습니다</div>
            <button onClick={() => setShowCreateModal(true)} style={{ background: '#03C75A', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 26px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>채팅방 만들기</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#f0f0f0', border: '1px solid #f0f0f0' }}>
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} onDoubleClick={() => openRoom(room)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ⑧ 프로필 / 하단 */}
      <div style={{ background: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: user ? avatarColor(user.username) : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
          {user?.username?.charAt(0) ?? '?'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>{user?.username}</div>
          <div style={{ fontSize: 11, color: '#03C75A', fontWeight: 600, marginTop: 1 }}>● 온라인</div>
        </div>
        <button onClick={() => setChatTheme('slr')} title="SLR 테마로 전환" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 4, display: 'flex', alignItems: 'center' }}>
          <IconPalette />
        </button>
        <button onClick={() => { clearAuth(); router.replace('/login'); }} style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 16, padding: '6px 14px', fontSize: 12, color: '#555', cursor: 'pointer', fontWeight: 600 }}>로그아웃</button>
      </div>

      {/* FAB */}
      <button onClick={() => setShowCreateModal(true)} style={{ position: 'fixed', bottom: 24, right: '50%', transform: 'translateX(50%) translateX(195px)', width: 52, height: 52, borderRadius: 26, background: '#03C75A', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(3,199,90,0.45)', zIndex: 50 }} title="새 채팅방 만들기">
        <IconPlus />
      </button>

      {showCreateModal && (
        <CreateRoomModal onClose={() => setShowCreateModal(false)} onCreated={(room) => { setShowCreateModal(false); openRoom(room); }} />
      )}
    </div>
  );
}
