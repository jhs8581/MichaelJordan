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

type View = 'home' | 'rooms' | 'chat';
type RoomImageItem = { url: string; createdAt?: string };

const NEWS_TABS = ['주요뉴스', 'CEO 긴급진단'];
const NEWS_ITEMS: string[][] = [
  [
    "'9000피' 카운트다운 들어간 코스피...8476.15 마감하며 최고치 또 경신",
    "코스피 불장 속 고배당 은행지수 16.8%↓...'배당주'의 눈물",
    "LG 구광모-젠슨 황 첫 회동...SK 최태원은 7개월 4차례 '진정한 간부'",
    "[단독] KB국민은행, 6월 1일부터 '국민성장펀드 취소분 판매예약' 신청...",
  ],
  [
    '"AI 투자, 지금이 기회다"...삼성·SK 수장들 실리콘밸리 총출동',
    '현대차 CEO "전기차 캐즘 극복, 하이브리드로 돌파"',
    '포스코 회장 "탈탄소 전환에 5조 베팅...그린스틸이 미래"',
    'LG엔솔 CEO "배터리 사업 재편, 수익성 우선 전략으로"',
  ],
];
const NEWS_CARDS = [
  { title: '코스피 9천 돌파 임박...개인 순매수 3조 돌파', c1: '#1a76c8', c2: '#0d4fa0', emoji: '📈' },
  { title: 'AI 반도체 쟁탈전...엔비디아 vs 삼성 2라운드', c1: '#7c3aed', c2: '#4c1d95', emoji: '🤖' },
  { title: '서울 아파트값 4주 연속 상승...강남 10억 회복', c1: '#d97706', c2: '#92400e', emoji: '🏢' },
  { title: '전기차 보조금 확대...하반기 2만대 추가 지원', c1: '#059669', c2: '#064e3b', emoji: '⚡' },
];

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
function todayStr(): string {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
function IconSearch() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IconMore() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>;
}

// ── 카페 행 (채팅방 = 카페) ──────────────────────────────────────────────────
function CafeRow({ room, onDoubleClick }: { room: Room; onDoubleClick: () => void }) {
  const [pressed, setPressed] = useState(false);

  const lastMsg = room.messages?.[0];
  const unread = room.unreadCount ?? 0;
  const hasUnread = unread > 0 && !room.isMuted;
  const color = room.isArchive ? '#34d399' : avatarColor(room.name);

  return (
    <div
      onClick={onDoubleClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: pressed ? '#f5f5f5' : '#fff', borderBottom: '1px solid #f2f2f2', cursor: 'pointer', transition: 'background 80ms' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: 900 }}>
        {room.isArchive ? '📦' : room.name.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 14.5, fontWeight: hasUnread ? 800 : 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
          {room.isMuted && <span style={{ fontSize: 11 }}>🔇</span>}
        </div>
        <div style={{ fontSize: 12.5, color: hasUnread ? '#333' : '#999', fontWeight: hasUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMsg
            ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http') ? '사진을 공유했습니다' : lastMsg.content)
            : (room.isArchive ? '나의 자료를 보관합니다' : '새 글이 없습니다')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {lastMsg && <span style={{ fontSize: 11, color: '#bbb' }}>{timeAgo(lastMsg.createdAt)}</span>}
        {hasUnread && (
          <span style={{ background: '#f7685b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '2px 7px', minWidth: 18, textAlign: 'center' as const }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
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

  const [view, setView] = useState<View>('home');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [newsTab, setNewsTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingImageItems, setViewingImageItems] = useState<RoomImageItem[]>([]);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const touchStartX = useRef<number | null>(null);
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchMoved = useRef(false);
  const cafeClickCount = useRef(0);
  const cafeClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cafeTouchRef = useRef<number>(0);

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
    setView('chat');
  }
  function handleCafeClick() {
    cafeClickCount.current++;
    if (cafeClickTimer.current) clearTimeout(cafeClickTimer.current);
    cafeClickTimer.current = setTimeout(() => { cafeClickCount.current = 0; }, 320);
    if (cafeClickCount.current >= 2) {
      cafeClickCount.current = 0;
      setView('rooms');
    }
  }
  function handleCafeTouchEnd() {
    const now = Date.now();
    if (now - cafeTouchRef.current < 320) setView('rooms');
    cafeTouchRef.current = now;
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

  // ── 채팅창 뷰 ─────────────────────────────────────────────────────────────────
  if (view === 'chat' && selectedRoom) {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', height: '100dvh', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: HEADER_H, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
          <button onClick={() => setView('rooms')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#111', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: avatarColor(selectedRoom.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
          </div>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRoom.name}</span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatWindow roomId={selectedRoom.id} onLeave={() => setView('rooms')} naverTheme
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

  // ── 카페 목록 뷰 ──────────────────────────────────────────────────────────────
  if (view === 'rooms') {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#f5f5f5', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 100, height: HEADER_H, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
          <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#111', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1, flexShrink: 0 }}>←</button>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#03C75A', letterSpacing: -0.5 }}>카페</span>
          <button onClick={() => setShowCreateModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', padding: 4 }}><IconSearch /></button>
          <button onClick={() => setShowCreateModal(true)} style={{ width: 32, height: 32, borderRadius: 16, background: '#03C75A', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
        </header>
        <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '0 16px', display: 'flex' }}>
          <div style={{ padding: '12px 0', fontSize: 14, fontWeight: 800, color: '#03C75A', borderBottom: '2.5px solid #03C75A', marginBottom: -1 }}>내 카페</div>
          <div style={{ padding: '12px 16px', fontSize: 14, color: '#aaa' }}>추천 카페</div>
        </div>
        <div style={{ background: '#fff', marginTop: 8 }}>
          {rooms.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' as const }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☕</div>
              <div style={{ fontSize: 14, color: '#aaa', marginBottom: 20 }}>가입한 카페가 없습니다</div>
              <button onClick={() => setShowCreateModal(true)} style={{ background: '#03C75A', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 26px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>카페 만들기</button>
            </div>
          ) : (
            rooms.map((room) => <CafeRow key={room.id} room={room} onDoubleClick={() => openRoom(room)} />)
          )}
        </div>
        {showCreateModal && (
          <CreateRoomModal onClose={() => setShowCreateModal(false)} onCreated={(room) => { setShowCreateModal(false); openRoom(room); }} />
        )}
      </div>
    );
  }

  // ── 네이버 메인 홈 뷰 ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#eef0f3', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif' }}>

      {/* ① 헤더 */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: '#eef0f3', height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
        <div style={{ width: 52, height: 28, borderRadius: 7, border: '1.5px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#555', fontSize: 13, fontWeight: 900, letterSpacing: -0.5 }}>pay</span>
        </div>
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

      {/* ③ 빠른 서비스 아이콘 */}
      <div style={{ background: '#fff', marginBottom: 8, padding: '0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '14px 0 4px', gap: 0, scrollbarWidth: 'none' }}>
          {/* 메일 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#03C75A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22 }}>✉️</span>
            </div>
            <span style={{ fontSize: 11, color: '#444' }}>메일</span>
          </div>
          {/* 카페 — 더블클릭/더블탭으로 카페 목록 진입 */}
          <div
            onClick={handleCafeClick}
            onTouchEnd={handleCafeTouchEnd}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0, cursor: 'pointer' }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#6db33f', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ fontSize: 22 }}>☕</span>
              {totalUnread > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, background: '#f7685b', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: '#444' }}>카페</span>
          </div>
          {/* N쇼핑 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#1ec800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22 }}>🛍️</span>
            </div>
            <span style={{ fontSize: 11, color: '#444' }}>N쇼핑</span>
          </div>
          {/* 구분선 */}
          <div style={{ width: 1, height: 46, background: '#e8e8e8', alignSelf: 'center', margin: '0 6px', flexShrink: 0 }} />
          {[
            { emoji: '📰', label: '뉴스',   bg: '#e8f0fe', fg: '#1a73e8' },
            { emoji: '⚽', label: '스포츠', bg: '#e6f4ea', fg: '#1e8e3e' },
            { emoji: '🎬', label: '엔터',   bg: '#fce8e6', fg: '#d93025' },
            { emoji: '🛒', label: '쇼핑',   bg: '#fff3e0', fg: '#e37400' },
            { emoji: '📊', label: '경제',   bg: '#e8f0fe', fg: '#1967d2' },
            { emoji: '▶️', label: '클립',   bg: '#f3e8fd', fg: '#9334e6' },
          ].map(({ emoji, label, bg, fg }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 60, flexShrink: 0, cursor: 'pointer' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22 }}>{emoji}</span>
              </div>
              <span style={{ fontSize: 11, color: fg, fontWeight: 700 }}>{label}</span>
            </div>
          ))}
        </div>
        {/* 공지 스트립 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📢</span>
          <span style={{ fontSize: 13, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            코스피 8,476 마감...개인투자자 순매수 3조원 돌파
          </span>
        </div>
      </div>

      {/* ④ 날씨 / 주가 스트립 */}
      <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 22 }}>🌙</span>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>23.6°</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>서울</span>
          </div>
        </div>
        <div style={{ width: 1, height: 26, background: '#e8e8e8' }} />
        <div style={{ flex: 1, paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#666' }}>다우존스</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>50,865.33</span>
          <span style={{ fontSize: 11, color: '#f7685b', fontWeight: 700 }}>▲0.39%</span>
        </div>
      </div>

      {/* ⑤ 뉴스 카드 (이코노미스트 스타일) */}
      <div style={{ background: '#fff', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 0', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#c8001e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', textAlign: 'center' as const, lineHeight: 1.3 }}>이코노미스트</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>이코노미스트</span>
              <span style={{ background: '#f5f5f5', color: '#888', fontSize: 10, padding: '2px 7px', borderRadius: 10 }}>100만</span>
            </div>
            <span style={{ fontSize: 11.5, color: '#bbb' }}>{todayStr()}</span>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 4 }}><IconMore /></button>
        </div>
        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '0 14px', marginTop: 10 }}>
          {NEWS_TABS.map((tab, i) => (
            <button key={tab} onClick={() => setNewsTab(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px 10px 0', fontSize: 14, fontWeight: newsTab === i ? 800 : 500, color: newsTab === i ? '#111' : '#aaa', borderBottom: newsTab === i ? '2.5px solid #111' : '2.5px solid transparent', marginBottom: -1 }}>
              {tab}
            </button>
          ))}
        </div>
        {/* 뉴스 목록 */}
        <div style={{ padding: '4px 0 8px' }}>
          {NEWS_ITEMS[newsTab].map((headline, i) => (
            <div key={i} style={{ padding: '10px 16px', borderBottom: i < NEWS_ITEMS[newsTab].length - 1 ? '1px solid #f8f8f8' : 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 13.5, color: '#222', lineHeight: 1.5 }}>{headline}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ⑥ 2열 이미지 뉴스 카드 */}
      <div style={{ background: '#fff', marginBottom: 70 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#f0f0f0' }}>
          {NEWS_CARDS.map((card, i) => (
            <div key={i} style={{ background: '#fff', cursor: 'pointer', overflow: 'hidden' }}>
              <div style={{ width: '100%', aspectRatio: '16/9', background: `linear-gradient(145deg, ${card.c1}, ${card.c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 36 }}>{card.emoji}</span>
              </div>
              <div style={{ padding: '8px 10px 12px' }}>
                <span style={{ fontSize: 12.5, color: '#222', lineHeight: 1.45 }}>{card.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 바 (테마전환 + 로그아웃) */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderTop: '1px solid #e8e8e8', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, zIndex: 50 }}>
        <button onClick={() => setChatTheme('slr')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 4, display: 'flex', alignItems: 'center' }} title="SLR 테마로 전환">
          <IconPalette />
        </button>
        <button onClick={() => { clearAuth(); router.replace('/login'); }} style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 16, padding: '6px 14px', fontSize: 12, color: '#555', cursor: 'pointer', fontWeight: 600 }}>로그아웃</button>
      </div>
    </div>
  );
}
