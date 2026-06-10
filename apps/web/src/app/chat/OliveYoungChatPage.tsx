'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { usePreferencesStore } from '@/store/preferences';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';

type View = 'home' | 'rooms' | 'chat';
type BottomTab = '홈' | '카테고리' | '뷰티톡' | 'MY' | '더보기';

// ── 상수 데이터 ──────────────────────────────────────────────────────────────
const OY_CATEGORIES = [
  { emoji: '🧴', label: '스킨케어' },
  { emoji: '🫧', label: '클렌징' },
  { emoji: '🎭', label: '마스크팩' },
  { emoji: '💄', label: '색조' },
  { emoji: '🛁', label: '바디케어' },
  { emoji: '💇', label: '헤어케어' },
  { emoji: '🌸', label: '향수' },
  { emoji: '💊', label: '건강식품' },
];

const OY_DEALS = [
  { label: '달팽이 크림', sub: '최대 30% 할인', c1: '#00C4B4', c2: '#00968A', emoji: '🐌' },
  { label: '비타민 세럼', sub: '오늘만 특가!', c1: '#FFB347', c2: '#E8960E', emoji: '🍋' },
  { label: '콜라겐 팩', sub: '2개 사면 1개 더', c1: '#FF8FAB', c2: '#E8617A', emoji: '✨' },
  { label: '선크림 SET', sub: '기획 상품', c1: '#5BC28D', c2: '#3A9B6A', emoji: '☀️' },
];

const OY_BEST = [
  { rank: 1, brand: 'COSRX', name: '어드밴스드 스네일 96 뮤신 파워 에센스', price: '17,900원', tag: '리뷰 12만+' },
  { rank: 2, brand: '아누아', name: '어성초 77% 토너 패드 70매입', price: '15,800원', tag: 'NEW' },
  { rank: 3, brand: '닥터지', name: 'RED 블레미쉬 클리어 수딩 크림', price: '19,500원', tag: '' },
  { rank: 4, brand: 'LANEIGE', name: '크림 스킨 리파이너 170ml', price: '27,000원', tag: '단독특가' },
  { rank: 5, brand: '토리든', name: '다이브인 히알루론산 세럼 50ml', price: '23,000원', tag: '' },
];

const OY_EVENTS = [
  { title: '올영세일 D-2', sub: '전품목 최대 50% 할인 🎉', c1: '#00C4B4', c2: '#00968A' },
  { title: '오늘드림 무료배송', sub: '오늘 자정 전 주문 → 오늘 도착!', c1: '#FF8FAB', c2: '#E8617A' },
  { title: '적립금 10배 DAY', sub: '이번 주말 한정 • 회원 전용 혜택', c1: '#FFB347', c2: '#E8960E' },
];

const OY_NEW_ITEMS = [
  { name: '[BEAUTY LAB] 펩타이드 부스터 앰플', brand: 'BEAUTY LAB', price: '32,000원', isNew: true, color: '#E8F9F7' },
  { name: '[ROUND LAB] 1025 독도 토너 미스트', brand: 'ROUND LAB', price: '18,500원', isNew: true, color: '#FFF0F3' },
  { name: '[구달] 청귤 비타C 선세럼', brand: '구달', price: '14,900원', isNew: false, color: '#FFFBF0' },
  { name: '[numbuzin] 3번 세라마이드 크림', brand: 'numbuzin', price: '29,000원', isNew: true, color: '#F0F4FF' },
];

// ── 색상 팔레트 ──────────────────────────────────────────────────────────────
const OY = {
  primary:      '#00C4B4',
  primaryLight: '#E8F9F7',
  primaryDark:  '#00968A',
  bg:           '#F5F5F5',
  cardBg:       '#FFFFFF',
  text:         '#1A1A1A',
  textSub:      '#555555',
  textMuted:    '#888888',
  textFaint:    '#C0C0C0',
  border:       '#F0F0F0',
  borderMid:    '#E8E8E8',
  red:          '#FF424D',
  orange:       '#FF8C00',
  navBg:        '#FFFFFF',
  searchBg:     '#F5F5F5',
  tagNew:       '#FF424D',
  tagExclusive: '#FF8C00',
};

const HEADER_H = 54;
const NAV_H = 64;

// ── 유틸 ────────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function roomColor(name: string): string {
  const colors = [
    '#00C4B4', '#FF8FAB', '#FFB347', '#9B59B6',
    '#3498DB', '#5BC28D', '#E74C3C', '#1ABC9C',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

// ── 아이콘 컴포넌트 ─────────────────────────────────────────────────────────
function IcHome({ active }: { active?: boolean }) {
  const c = active ? OY.primary : '#BBBBBB';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? OY.primary : 'none'} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  );
}

function IcCategory({ active }: { active?: boolean }) {
  const c = active ? OY.primary : '#BBBBBB';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </svg>
  );
}

function IcBeautyTalk({ active }: { active?: boolean }) {
  const c = active ? OY.primary : '#BBBBBB';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? OY.primary : 'none'} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IcMy({ active }: { active?: boolean }) {
  const c = active ? OY.primary : '#BBBBBB';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IcMore({ active }: { active?: boolean }) {
  const c = active ? OY.primary : '#BBBBBB';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function IcSearch() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={OY.text} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IcBell() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={OY.text} strokeWidth="1.8" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function IcCart() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={OY.text} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}

// ── 채팅방 카드 ─────────────────────────────────────────────────────────────
function RoomCard({ room, onClick }: { room: Room; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  const lastMsg = room.messages?.[0];
  const unread = room.unreadCount ?? 0;
  const hasUnread = unread > 0 && !room.isMuted;
  const color = roomColor(room.name);

  return (
    <div
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px',
        background: pressed ? '#FAFAFA' : '#FFFFFF',
        borderBottom: `1px solid ${OY.border}`,
        cursor: 'pointer',
        transition: 'background 80ms',
      }}
    >
      {/* 아바타 */}
      <div style={{
        width: 50, height: 50, borderRadius: 18, flexShrink: 0,
        background: `linear-gradient(135deg, ${color}, ${color}BB)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color: '#fff', fontWeight: 900,
        boxShadow: `0 2px 8px ${color}44`,
      }}>
        {room.isArchive ? '📦' : room.name.charAt(0)}
      </div>

      {/* 텍스트 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 14.5, fontWeight: hasUnread ? 700 : 600,
            color: OY.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {room.name}
          </span>
          {room.isMuted && <span style={{ fontSize: 11 }}>🔇</span>}
        </div>
        <div style={{
          fontSize: 12.5,
          color: hasUnread ? '#555' : OY.textMuted,
          fontWeight: hasUnread ? 500 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {lastMsg
            ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http')
              ? '📷 사진을 공유했습니다'
              : lastMsg.content)
            : (room.isArchive ? '나의 자료를 보관합니다' : '새 메시지가 없습니다')}
        </div>
      </div>

      {/* 시간 + 배지 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        {lastMsg && (
          <span style={{ fontSize: 11, color: OY.textFaint }}>{timeAgo(lastMsg.createdAt)}</span>
        )}
        {hasUnread && (
          <span style={{
            background: OY.primary, color: '#fff', borderRadius: 10,
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            minWidth: 18, textAlign: 'center' as const,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function OliveYoungChatPage({ backRef }: { backRef?: MutableRefObject<(() => void) | null> }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const [hydrated, setHydrated] = useState(false);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);
  const setChatTheme = usePreferencesStore((s) => s.setChatTheme);

  const [view, setView] = useState<View>('home');
  const [activeTab, setActiveTab] = useState<BottomTab>('홈');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);

  const chatBackInterceptorRef = useRef<(() => boolean) | null>(null);

  if (backRef) backRef.current = () => {
    if (chatBackInterceptorRef.current?.()) return;
    if (view === 'chat') { setView('rooms'); setActiveTab('뷰티톡'); return; }
    if (view === 'rooms') { setView('home'); setActiveTab('홈'); return; }
  };

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

  // 배너 자동 슬라이드
  useEffect(() => {
    const timer = setInterval(() => setBannerIdx((i) => (i + 1) % OY_EVENTS.length), 3200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view === 'chat' || view === 'rooms') {
      history.pushState({ _chat: true }, '', window.location.href);
    }
  }, [view]);

  const totalUnread = useMemo(
    () => rooms.reduce((acc, r) => acc + (!r.isMuted ? (r.unreadCount ?? 0) : 0), 0),
    [rooms],
  );

  function openRoom(room: Room) {
    setRooms(rooms.map((r) => r.id === room.id ? { ...r, unreadCount: 0 } : r));
    setSelectedRoom({ ...room, unreadCount: 0 });
    setView('chat');
  }

  function switchTab(tab: BottomTab) {
    setActiveTab(tab);
    if (tab === '뷰티톡') {
      setSelectedRoom(null);
      setView('rooms');
    } else {
      setSelectedRoom(null);
      setView('home');
    }
  }

  if (!hydrated || !accessToken) return null;

  // ── 하단 내비게이션 ─────────────────────────────────────────────────────────
  const bottomNav = (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, height: NAV_H,
      background: OY.navBg, borderTop: `1px solid ${OY.border}`,
      display: 'flex', alignItems: 'center', zIndex: 100,
      boxShadow: '0 -1px 8px rgba(0,0,0,0.06)',
    }}>
      {([
        { tab: '홈' as BottomTab,      icon: <IcHome active={activeTab === '홈'} />,           label: '홈' },
        { tab: '카테고리' as BottomTab, icon: <IcCategory active={activeTab === '카테고리'} />,  label: '카테고리' },
        { tab: '뷰티톡' as BottomTab,  icon: <IcBeautyTalk active={activeTab === '뷰티톡'} />,  label: '뷰티톡', badge: totalUnread },
        { tab: 'MY' as BottomTab,      icon: <IcMy active={activeTab === 'MY'} />,             label: 'MY' },
        { tab: '더보기' as BottomTab,  icon: <IcMore active={activeTab === '더보기'} />,        label: '더보기' },
      ] as { tab: BottomTab; icon: React.ReactNode; label: string; badge?: number }[]).map(({ tab, icon, label, badge }) => (
        <button
          key={tab}
          onClick={() => switchTab(tab)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4, padding: '8px 0',
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === tab ? OY.primary : OY.textMuted,
            position: 'relative',
          }}
        >
          <div style={{ position: 'relative' }}>
            {icon}
            {badge ? (
              <span style={{
                position: 'absolute', top: -5, right: -8,
                background: OY.red, color: '#fff',
                borderRadius: 8, fontSize: 9, fontWeight: 700,
                padding: '1px 4px', minWidth: 14, textAlign: 'center',
                lineHeight: '14px',
              }}>
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </div>
          <span style={{ fontSize: 10, fontWeight: activeTab === tab ? 700 : 400, lineHeight: 1 }}>{label}</span>
        </button>
      ))}
    </div>
  );

  // ── 채팅창 뷰 ────────────────────────────────────────────────────────────────
  if (view === 'chat' && selectedRoom) {
    const rColor = roomColor(selectedRoom.name);
    return (
      <div style={{
        maxWidth: 430, margin: '0 auto',
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 채팅 헤더 */}
        <div style={{
          height: HEADER_H, background: OY.cardBg,
          borderBottom: `1px solid ${OY.border}`,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <button
            onClick={() => { setView('rooms'); setActiveTab('뷰티톡'); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: OY.primary, fontSize: 22, padding: '4px 8px 4px 0', lineHeight: 1,
            }}
          >←</button>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${rColor}, ${rColor}BB)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 800,
          }}>
            {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: OY.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedRoom.name}
            </div>
          </div>
        </div>
        {/* 채팅 윈도우 */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatWindow
            roomId={selectedRoom.id}
            onLeave={() => { setView('rooms'); setActiveTab('뷰티톡'); }}
            backInterceptorRef={chatBackInterceptorRef}
          />
        </div>
      </div>
    );
  }

  // ── 채팅방 목록 뷰 (뷰티톡) ──────────────────────────────────────────────────
  if (view === 'rooms') {
    return (
      <div style={{
        maxWidth: 430, margin: '0 auto',
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
        display: 'flex', flexDirection: 'column', background: OY.bg,
      }}>
        {/* 헤더 */}
        <div style={{
          height: HEADER_H, background: OY.cardBg,
          borderBottom: `1px solid ${OY.border}`,
          display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: OY.text }}>뷰티톡</div>
            <div style={{ fontSize: 11, color: OY.textMuted, marginTop: 1 }}>뷰티 고민 함께 나눠요 💬</div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: OY.primary, color: '#fff', border: 'none',
              borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', boxShadow: `0 2px 8px ${OY.primary}44`,
            }}
          >
            + 새 채팅방
          </button>
        </div>

        {/* 방 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', background: OY.cardBg }}>
          {rooms.length === 0 ? (
            <div style={{ padding: '72px 0', textAlign: 'center', color: OY.textMuted }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: OY.text, marginBottom: 6 }}>채팅방이 없습니다</div>
              <div style={{ fontSize: 13 }}>뷰티 고민을 나눌 채팅방을 만들어보세요</div>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  marginTop: 20, background: OY.primary, color: '#fff', border: 'none',
                  borderRadius: 22, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >채팅방 만들기</button>
            </div>
          ) : (
            rooms.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => openRoom(room)} />
            ))
          )}
        </div>

        {bottomNav}

        {showCreateModal && (
          <CreateRoomModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(room: Room) => { setShowCreateModal(false); openRoom(room); }}
          />
        )}
      </div>
    );
  }

  // ── 홈 뷰 ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 430, margin: '0 auto',
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
      display: 'flex', flexDirection: 'column', background: OY.bg,
      overflow: 'hidden',
    }}>
      {/* ── 헤더 ── */}
      <div style={{
        height: HEADER_H, background: OY.cardBg, flexShrink: 0,
        display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: `1px solid ${OY.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {/* 로고 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${OY.primary}, ${OY.primaryDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>🌿</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: OY.primary, letterSpacing: -0.3, lineHeight: 1.1 }}>
              OLIVE YOUNG
            </div>
            <div style={{ fontSize: 9, color: OY.textMuted, letterSpacing: 0.2, lineHeight: 1 }}>
              헬스&뷰티 스토어
            </div>
          </div>
        </div>
        {/* 우측 아이콘 */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <IcSearch />
          </button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <IcBell />
          </button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <IcCart />
          </button>
          <button
            onClick={() => setChatTheme('naver')}
            style={{
              background: 'none', border: `1px solid #E0E0E0`,
              borderRadius: 12, padding: '3px 7px',
              fontSize: 10, color: OY.textMuted, cursor: 'pointer', fontWeight: 600,
            }}
            title="네이버 테마로 전환"
          >N</button>
        </div>
      </div>

      {/* ── 스크롤 컨텐츠 ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: NAV_H }}>

        {/* 검색바 */}
        <div style={{ background: OY.cardBg, padding: '10px 16px 14px' }}>
          <div style={{
            background: OY.searchBg, borderRadius: 26, height: 42,
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
            border: `1px solid ${OY.border}`,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={OY.textFaint} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span style={{ fontSize: 13, color: OY.textFaint }}>상품명, 브랜드, 성분 검색</span>
          </div>
        </div>

        {/* ── 메인 이벤트 배너 ── */}
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
          {OY_EVENTS.map((ev, i) => (
            <div
              key={i}
              style={{
                display: i === bannerIdx ? 'block' : 'none',
                background: `linear-gradient(135deg, ${ev.c1} 0%, ${ev.c2} 100%)`,
                padding: '26px 22px 36px',
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>
                EVENT
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: 6 }}>
                {ev.title}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 18 }}>
                {ev.sub}
              </div>
              <button style={{
                background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.55)',
                borderRadius: 22, padding: '7px 18px', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                자세히 보기 →
              </button>
            </div>
          ))}
          {/* 배너 인디케이터 */}
          <div style={{
            position: 'absolute', bottom: 10, right: 14,
            display: 'flex', gap: 5,
          }}>
            {OY_EVENTS.map((_, i) => (
              <button
                key={i}
                onClick={() => setBannerIdx(i)}
                style={{
                  width: i === bannerIdx ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === bannerIdx ? '#fff' : 'rgba(255,255,255,0.45)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width 300ms ease',
                }}
              />
            ))}
          </div>
          {/* 배너 번호 */}
          <div style={{
            position: 'absolute', bottom: 10, left: 14,
            background: 'rgba(0,0,0,0.22)', borderRadius: 10,
            padding: '2px 8px', fontSize: 11, color: '#fff',
          }}>
            {bannerIdx + 1} / {OY_EVENTS.length}
          </div>
        </div>

        {/* ── 카테고리 퀵메뉴 ── */}
        <div style={{ background: OY.cardBg, padding: '16px 6px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 0' }}>
            {OY_CATEGORIES.map(({ emoji, label }) => (
              <button
                key={label}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 20,
                  background: OY.primaryLight,
                  border: `1.5px solid ${OY.primary}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                  transition: 'transform 120ms',
                }}>
                  {emoji}
                </div>
                <span style={{ fontSize: 11.5, color: OY.textSub, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: 8, background: OY.bg }} />

        {/* ── 오늘의 특가 ── */}
        <div style={{ background: OY.cardBg, paddingBottom: 18 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: OY.text }}>오늘의 특가</div>
              <div style={{ fontSize: 12, color: OY.red, fontWeight: 600, marginTop: 2 }}>🔥 오늘 자정 마감</div>
            </div>
            <span style={{ fontSize: 12, color: OY.textMuted, cursor: 'pointer', paddingBottom: 2 }}>전체보기 ›</span>
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {OY_DEALS.map(({ label, sub, c1, c2, emoji }) => (
              <div
                key={label}
                style={{
                  flex: '0 0 130px', borderRadius: 18, overflow: 'hidden',
                  background: `linear-gradient(140deg, ${c1}, ${c2})`,
                  cursor: 'pointer', boxShadow: `0 4px 14px ${c1}44`,
                }}
              >
                <div style={{ padding: '16px 14px 16px' }}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>{emoji}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1.25 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{sub}</div>
                  <div style={{
                    marginTop: 12, display: 'inline-block',
                    background: 'rgba(255,255,255,0.25)', borderRadius: 10,
                    padding: '3px 8px', fontSize: 11, color: '#fff', fontWeight: 600,
                  }}>구매하기 →</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: 8, background: OY.bg }} />

        {/* ── 베스트셀러 TOP 5 ── */}
        <div style={{ background: OY.cardBg, paddingBottom: 6 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: OY.text }}>베스트셀러</span>
              <span style={{
                background: OY.primaryLight, color: OY.primary,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
              }}>TOP 5</span>
            </div>
            <span style={{ fontSize: 12, color: OY.textMuted, cursor: 'pointer' }}>전체보기 ›</span>
          </div>

          {OY_BEST.map(({ rank, brand, name, price, tag }) => (
            <div
              key={rank}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                borderBottom: rank < OY_BEST.length ? `1px solid ${OY.border}` : 'none',
                cursor: 'pointer',
              }}
            >
              {/* 순위 */}
              <div style={{
                width: 28, textAlign: 'center' as const, flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 18, fontWeight: 900,
                  color: rank === 1 ? OY.primary : rank <= 3 ? OY.primaryDark : OY.textFaint,
                }}>{rank}</span>
              </div>

              {/* 상품 아이콘 자리 */}
              <div style={{
                width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                background: OY.primaryLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>
                {['🐌', '🌿', '🔴', '💧', '💦'][rank - 1]}
              </div>

              {/* 텍스트 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: OY.primary }}>{brand}</span>
                  {tag && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      color: tag === 'NEW' ? OY.red : tag === '단독특가' ? OY.orange : OY.primary,
                      background: tag === 'NEW' ? '#FFF0F1' : tag === '단독특가' ? '#FFF8F0' : OY.primaryLight,
                    }}>{tag}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: OY.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>{name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: OY.text }}>{price}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 구분선 */}
        <div style={{ height: 8, background: OY.bg }} />

        {/* ── 쿠폰 배너 ── */}
        <div style={{ background: OY.cardBg, padding: '14px 16px' }}>
          <div style={{
            background: `linear-gradient(135deg, ${OY.primary} 0%, ${OY.primaryDark} 100%)`,
            borderRadius: 16, padding: '18px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', boxShadow: `0 4px 14px ${OY.primary}33`,
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>
                오늘의 혜택
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                🎫 쿠폰 받고 더 저렴하게!
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                최대 3,000원 즉시 할인
              </div>
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>🎁</div>
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: 8, background: OY.bg }} />

        {/* ── 뷰티 신상품 ── */}
        <div style={{ background: OY.cardBg, paddingBottom: 16 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: OY.text }}>뷰티 신상</span>
              <span style={{
                background: '#FFF0F1', color: OY.red,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
              }}>NEW</span>
            </div>
            <span style={{ fontSize: 12, color: OY.textMuted, cursor: 'pointer' }}>전체보기 ›</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, padding: '0 0' }}>
            {OY_NEW_ITEMS.map((item) => (
              <div
                key={item.name}
                style={{
                  background: item.color, padding: '16px 14px',
                  cursor: 'pointer', borderBottom: `1px solid ${OY.border}`,
                }}
              >
                <div style={{
                  width: '100%', aspectRatio: '1 / 1',
                  borderRadius: 12, background: `${item.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36, marginBottom: 10,
                  border: `1px solid rgba(0,0,0,0.05)`,
                }}>
                  🧴
                </div>
                {item.isNew && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: OY.red,
                    background: '#FFF0F1', padding: '2px 6px', borderRadius: 4,
                    display: 'inline-block', marginBottom: 4,
                  }}>NEW</span>
                )}
                <div style={{ fontSize: 10, color: OY.primary, fontWeight: 600, marginBottom: 2 }}>{item.brand}</div>
                <div style={{
                  fontSize: 12.5, color: OY.text, fontWeight: 500, lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                }}>{item.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: OY.text, marginTop: 6 }}>{item.price}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: 8, background: OY.bg }} />

        {/* ── 뷰티톡 채팅방 미리보기 ── */}
        <div style={{ background: OY.cardBg, padding: '16px 16px 20px' }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: OY.text }}>뷰티톡 💬</div>
              <div style={{ fontSize: 12, color: OY.textMuted, marginTop: 2 }}>뷰티 고민 함께 나눠요</div>
            </div>
            <button
              onClick={() => { setView('rooms'); setActiveTab('뷰티톡'); }}
              style={{
                background: 'none', border: `1px solid ${OY.primary}`, borderRadius: 16,
                padding: '5px 14px', fontSize: 12, color: OY.primary, fontWeight: 700,
                cursor: 'pointer',
              }}
            >전체보기</button>
          </div>

          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {rooms.slice(0, 4).map((room) => (
              <div
                key={room.id}
                onClick={() => openRoom(room)}
                style={{
                  flex: '0 0 100px', borderRadius: 16,
                  background: OY.primaryLight,
                  border: `1.5px solid ${OY.primary}22`,
                  padding: '14px 10px', cursor: 'pointer',
                  textAlign: 'center' as const,
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 14,
                  background: roomColor(room.name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 18,
                  margin: '0 auto 8px',
                }}>
                  {room.name.charAt(0)}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: OY.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{room.name}</div>
                {(room.unreadCount ?? 0) > 0 && !room.isMuted && (
                  <div style={{
                    marginTop: 5, background: OY.red, color: '#fff',
                    borderRadius: 8, fontSize: 10, fontWeight: 700,
                    padding: '2px 6px', display: 'inline-block',
                  }}>{room.unreadCount}</div>
                )}
              </div>
            ))}

            {/* 더보기 카드 */}
            <div
              onClick={() => { setView('rooms'); setActiveTab('뷰티톡'); }}
              style={{
                flex: '0 0 72px', borderRadius: 16,
                background: OY.primaryLight,
                border: `1.5px dashed ${OY.primary}55`,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, cursor: 'pointer', minHeight: 100,
              }}
            >
              <span style={{ fontSize: 20, color: OY.primary }}>›</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: OY.primary }}>전체</span>
            </div>

            {rooms.length === 0 && (
              <div
                onClick={() => setShowCreateModal(true)}
                style={{
                  flex: '0 0 120px', borderRadius: 16,
                  border: `1.5px dashed ${OY.primary}66`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 8, cursor: 'pointer', minHeight: 100,
                  background: OY.primaryLight,
                }}
              >
                <span style={{ fontSize: 28 }}>💬</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: OY.primary }}>채팅방 만들기</span>
              </div>
            )}
          </div>
        </div>

        {/* 하단 여백 */}
        <div style={{ height: 16, background: OY.bg }} />
      </div>

      {/* 하단 네비 */}
      {bottomNav}

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(room: Room) => { setShowCreateModal(false); openRoom(room); }}
        />
      )}
    </div>
  );
}
