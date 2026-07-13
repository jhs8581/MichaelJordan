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

type Schedule = {
  id: number; roomId: number; title: string; description?: string | null;
  scheduledAt: string; isAllDay: boolean; notified: boolean;
  createdById: number; createdAt: string;
  createdBy: { id: number; username: string };
};
type Post = {
  id: number; roomId: number; title: string; content: string; authorId: number;
  sourceMessageId?: number | null; createdAt: string; updatedAt: string;
  author: { id: number; username: string; avatarUrl?: string };
  sourceMessage?: { id: number; content: string; createdAt: string; sender?: { id: number; username: string } | null } | null;
  _count?: { comments: number };
};
type Comment = {
  id: number; postId: number; content: string; authorId: number;
  createdAt: string; updatedAt: string;
  author: { id: number; username: string; avatarUrl?: string };
};
type RoomImageItem = { url: string; createdAt?: string };

async function handleImageDownload(url: string, e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault(); e.stopPropagation();
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
    link.download = `image_${Date.now()}.${extension}`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch {
    const link = document.createElement('a');
    link.href = url; link.download = '';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }
}
function getTouchDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}
function getImageDateLabel(createdAt?: string): string {
  if (!createdAt) return '날짜 없음';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '날짜 없음';
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function groupImagesByDate(items: RoomImageItem[]) {
  const groups: { label: string; items: Array<RoomImageItem & { index: number }> }[] = [];
  items.forEach((item, index) => {
    const label = getImageDateLabel(item.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.label === label) lastGroup.items.push({ ...item, index });
    else groups.push({ label, items: [{ ...item, index }] });
  });
  return groups;
}

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
  { name: '[BEAUTY LAB] 펩타이드 부스터 앰플', brand: 'BEAUTY LAB', price: '32,000원', isNew: true },
  { name: '[ROUND LAB] 1025 독도 토너 미스트', brand: 'ROUND LAB', price: '18,500원', isNew: true },
  { name: '[구달] 청귤 비타C 선세럼', brand: '구달', price: '14,900원', isNew: false },
  { name: '[numbuzin] 3번 세라마이드 크림', brand: 'numbuzin', price: '29,000원', isNew: true },
];

const OY_DAY = {
  primary: '#00C4B4', primaryLight: '#E8F9F7', primaryDark: '#00968A',
  bg: '#F5F5F5', cardBg: '#FFFFFF',
  text: '#1A1A1A', textSub: '#555555', textMuted: '#888888', textFaint: '#C0C0C0',
  border: '#F0F0F0', borderMid: '#E8E8E8',
  red: '#FF424D', orange: '#FF8C00',
  navBg: '#FFFFFF', searchBg: '#F5F5F5',
  tagNew: '#FF424D', tagExclusive: '#FF8C00', iconLabel: '#444444',
  bestRankHigh: '#00C4B4', bestRankMid: '#00968A', bestRankLow: '#D0D0D0',
  couponGlow: '#00C4B4', tagNewBg: '#FFF0F1', tagExBg: '#FFF8F0',
  popupText: '#FFFFFF',
};
const OY_NIGHT = {
  primary: '#00C4B4', primaryLight: '#0A2424', primaryDark: '#00968A',
  bg: '#0D1A1A', cardBg: '#0F2222',
  text: '#E0E8E8', textSub: '#8ABCBC', textMuted: '#5A8888', textFaint: '#2E5050',
  border: '#1A3030', borderMid: '#1E3838',
  red: '#FF6B74', orange: '#FFB347',
  navBg: '#0F2222', searchBg: '#162626',
  tagNew: '#FF6B74', tagExclusive: '#FFB347', iconLabel: '#8ABCBC',
  bestRankHigh: '#00C4B4', bestRankMid: '#00968A', bestRankLow: '#3A6060',
  couponGlow: '#00968A', tagNewBg: '#3A1A1A', tagExBg: '#2A1A0A',
  popupText: '#FFFFFF',
};

const HEADER_H = 54;
const NAV_H = 64;

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
function roomColor(name: string): string {
  const colors = ['#00C4B4','#FF8FAB','#FFB347','#9B59B6','#3498DB','#5BC28D','#E74C3C','#1ABC9C'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function IcHome({ active, c }: { active?: boolean; c: string }) {
  const col = active ? c : '#BBBBBB';
  return <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? col : 'none'} stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>;
}
function IcCategory({ active, c }: { active?: boolean; c: string }) {
  const col = active ? c : '#BBBBBB';
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>;
}
function IcBeautyTalk({ active, c }: { active?: boolean; c: string }) {
  const col = active ? c : '#BBBBBB';
  return <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? col : 'none'} stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function IcMy({ active, c }: { active?: boolean; c: string }) {
  const col = active ? c : '#BBBBBB';
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcMore({ active, c }: { active?: boolean; c: string }) {
  const col = active ? c : '#BBBBBB';
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function IcSearch({ c }: { c: string }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IcBell({ c }: { c: string }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IcCart({ c }: { c: string }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
function IcSun({ c }: { c: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}
function IcMoon({ c }: { c: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}

function RoomCard({ room, onClick, oy }: { room: Room; onClick: () => void; oy: typeof OY_DAY }) {
  const [pressed, setPressed] = useState(false);
  const lastMsg = room.messages?.[0];
  const unread = room.unreadCount ?? 0;
  const hasUnread = unread > 0 && !room.isMuted;
  const contentUnread = (room.scheduleUnreadCount ?? 0) + (room.postUnreadCount ?? 0) + (room.commentUnreadCount ?? 0);
  const color = roomColor(room.name);
  return (
    <div onClick={onClick} onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: pressed ? oy.bg : oy.cardBg, borderBottom: `1px solid ${oy.border}`, cursor: 'pointer', transition: 'background 80ms' }}>
      <div style={{ width: 50, height: 50, borderRadius: 18, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}BB)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: 900, boxShadow: `0 2px 8px ${color}44` }}>
        {room.isArchive ? '📦' : room.name.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 14.5, fontWeight: hasUnread ? 700 : 600, color: oy.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
          {contentUnread > 0 && <span style={{ fontSize: 10, color: oy.primary, fontWeight: 800, background: oy.primaryLight, borderRadius: 8, padding: '1px 6px' }}>새 글</span>}
          {room.isMuted && <span style={{ fontSize: 11 }}>🔇</span>}
        </div>
        <div style={{ fontSize: 12.5, color: hasUnread ? oy.textSub : oy.textMuted, fontWeight: hasUnread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMsg ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http') ? '📷 사진을 공유했습니다' : lastMsg.content) : (room.isArchive ? '나의 자료를 보관합니다' : '새 메시지가 없습니다')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        {lastMsg && <span style={{ fontSize: 11, color: oy.textFaint }}>{timeAgo(lastMsg.createdAt)}</span>}
        {hasUnread && <span style={{ background: oy.primary, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '2px 7px', minWidth: 18, textAlign: 'center' as const }}>{unread > 99 ? '99+' : unread}</span>}
      </div>
    </div>
  );
}

export default function OliveYoungChatPage({ backRef }: { backRef?: MutableRefObject<(() => void) | null> }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);
  const setChatTheme = usePreferencesStore((s) => s.setChatTheme);
  const oyDark = usePreferencesStore((s) => s.oyDark);
  const setOyDark = usePreferencesStore((s) => s.setOyDark);

  const oy = oyDark ? OY_NIGHT : OY_DAY;

  const [view, setView] = useState<View>('home');
  const [activeTab, setActiveTab] = useState<BottomTab>('홈');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);

  // 이미지 뷰어 상태
  const [roomView, setRoomView] = useState<'' | 'schedule' | 'posts'>('');
  const [viewingImageItems, setViewingImageItems] = useState<RoomImageItem[]>([]);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [showImageGrid, setShowImageGrid] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchMoved = useRef(false);

  // 일정/게시판 상태
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedFormOpen, setSchedFormOpen] = useState(false);
  const [schedEditTarget, setSchedEditTarget] = useState<Schedule | null>(null);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedAllDay, setSchedAllDay] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postFormOpen, setPostFormOpen] = useState(false);
  const [postEditTarget, setPostEditTarget] = useState<Post | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postDetail, setPostDetail] = useState<Post | null>(null);
  // 댓글 상태
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentEditId, setCommentEditId] = useState<number | null>(null);

  const oyTabClickCount = useRef(0);
  const oyTabClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatBackInterceptorRef = useRef<(() => boolean) | null>(null);

  if (backRef) backRef.current = () => {
    if (showImageGrid || viewingImageItems.length > 0) { setViewingImageItems([]); setShowImageGrid(false); return; }
    if (chatBackInterceptorRef.current?.()) return;
    if (roomView !== '') { setRoomView(''); return; }
    if (view === 'chat') { setView('rooms'); setActiveTab('뷰티톡'); return; }
    if (view === 'rooms') { setView('home'); setActiveTab('홈'); return; }
  };

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  useEffect(() => { if (hydrated && !accessToken) router.replace('/login'); }, [hydrated, accessToken, router]);
  useEffect(() => {
    if (!accessToken) return;
    api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data)).catch(() => {});
  }, [accessToken, setRooms]);
  useEffect(() => {
    const timer = setInterval(() => setBannerIdx((i) => (i + 1) % OY_EVENTS.length), 3200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (view === 'chat' || view === 'rooms') history.pushState({ _chat: true }, '', window.location.href);
  }, [view]);
  useEffect(() => {
    if (roomView !== '') history.pushState({ _chat: true }, '', window.location.href);
  }, [roomView]);
  useEffect(() => {
    if (viewingImageItems.length > 0) history.pushState({ _chat: true }, '', window.location.href);
  }, [viewingImageItems.length]);
  useEffect(() => {
    if (roomView === 'schedule' && selectedRoom && accessToken) {
      setSchedLoading(true); setSchedules([]);
      api.get<{ data: { schedules: Schedule[] } }>(`/schedules?roomId=${selectedRoom.id}`)
        .then(res => setSchedules(res.data.data.schedules)).catch(() => {}).finally(() => setSchedLoading(false));
      markRoomContentRead(selectedRoom.id, 'schedule');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomView, selectedRoom?.id, accessToken]);
  useEffect(() => {
    if (roomView === 'posts' && selectedRoom && accessToken) {
      setPostsLoading(true); setPosts([]);
      api.get<{ data: { posts: Post[] } }>(`/posts?roomId=${selectedRoom.id}`)
        .then(res => setPosts(res.data.data.posts)).catch(() => {}).finally(() => setPostsLoading(false));
      markRoomContentRead(selectedRoom.id, 'post');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomView, selectedRoom?.id, accessToken]);
  useEffect(() => {
    if (postDetail) {
      loadComments(postDetail.id);
      if (selectedRoom) markRoomContentRead(selectedRoom.id, 'comment');
    }
    else { setComments([]); setCommentInput(''); setCommentEditId(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postDetail?.id]);

  const totalUnread = useMemo(() => rooms.reduce((acc, r) => acc + (!r.isMuted ? (r.unreadCount ?? 0) : 0), 0), [rooms]);

  function openRoom(room: Room) {
    setRooms(rooms.map((r) => r.id === room.id ? { ...r, unreadCount: 0 } : r));
    setSelectedRoom({ ...room, unreadCount: 0 });
    setRoomView('');
    setView('chat');
  }

  function clearRoomContentUnread(roomId: number, type: 'schedule' | 'post' | 'comment' | 'all') {
    setRooms(rooms.map((room) => {
      if (room.id !== roomId) return room;
      if (type === 'schedule') return { ...room, scheduleUnreadCount: 0 };
      if (type === 'post') return { ...room, postUnreadCount: 0 };
      if (type === 'comment') return { ...room, commentUnreadCount: 0 };
      return { ...room, scheduleUnreadCount: 0, postUnreadCount: 0, commentUnreadCount: 0 };
    }));
    setSelectedRoom((current) => {
      if (!current || current.id !== roomId) return current;
      if (type === 'schedule') return { ...current, scheduleUnreadCount: 0 };
      if (type === 'post') return { ...current, postUnreadCount: 0 };
      if (type === 'comment') return { ...current, commentUnreadCount: 0 };
      return { ...current, scheduleUnreadCount: 0, postUnreadCount: 0, commentUnreadCount: 0 };
    });
  }

  async function markRoomContentRead(roomId: number, type: 'schedule' | 'post' | 'comment' | 'all') {
    try {
      await api.patch(`/rooms/${roomId}/read-content`, { type });
      clearRoomContentUnread(roomId, type);
    } catch {
      // 실패 시 다음 새로고침에서 서버 상태 반영
    }
  }

  function switchTab(tab: BottomTab) {
    setActiveTab(tab);
    if (tab === '뷰티톡') {
      oyTabClickCount.current++;
      if (oyTabClickTimer.current) clearTimeout(oyTabClickTimer.current);
      oyTabClickTimer.current = setTimeout(() => { oyTabClickCount.current = 0; }, 350);
      if (oyTabClickCount.current >= 2) {
        oyTabClickCount.current = 0;
        setSelectedRoom(null);
        setView('rooms');
      }
    } else {
      oyTabClickCount.current = 0;
      setSelectedRoom(null);
      setView('home');
    }
  }

  function openScheduleForm(edit?: Schedule) {
    setSchedEditTarget(edit ?? null);
    if (edit) {
      setSchedTitle(edit.title); setSchedDesc(edit.description ?? '');
      const d = new Date(edit.scheduledAt);
      setSchedDate([d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'));
      setSchedTime(edit.isAllDay ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
      setSchedAllDay(edit.isAllDay);
    } else {
      const now = new Date(); now.setMinutes(now.getMinutes() + 30);
      setSchedTitle(''); setSchedDesc('');
      setSchedDate([now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-'));
      setSchedTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
      setSchedAllDay(false);
    }
    setSchedFormOpen(true);
  }
  async function submitSchedule() {
    if (!schedTitle.trim() || !schedDate || !selectedRoom) return;
    const scheduledAt = schedAllDay ? new Date(schedDate + 'T00:00:00').toISOString() : new Date(`${schedDate}T${schedTime || '00:00'}:00`).toISOString();
    try {
      if (schedEditTarget) {
        const res = await api.patch<{ data: { schedule: Schedule } }>(`/schedules/${schedEditTarget.id}`, { title: schedTitle.trim(), description: schedDesc.trim() || undefined, scheduledAt, isAllDay: schedAllDay });
        setSchedules(prev => prev.map(s => s.id === schedEditTarget.id ? res.data.data.schedule : s));
      } else {
        const res = await api.post<{ data: { schedule: Schedule } }>('/schedules', { roomId: selectedRoom.id, title: schedTitle.trim(), description: schedDesc.trim() || undefined, scheduledAt, isAllDay: schedAllDay });
        setSchedules(prev => [res.data.data.schedule, ...prev]);
      }
      setSchedFormOpen(false);
    } catch { /* 무시 */ }
  }
  async function deleteSchedule(id: number) {
    if (!confirm('일정을 삭제하시겠습니까?')) return;
    await api.delete(`/schedules/${id}`);
    setSchedules(prev => prev.filter(s => s.id !== id));
  }
  async function submitPost() {
    if (!postTitle.trim() || !postContent.trim() || !selectedRoom) return;
    try {
      if (postEditTarget) {
        const res = await api.patch<{ data: { post: Post } }>(`/posts/${postEditTarget.id}`, { title: postTitle.trim(), content: postContent.trim() });
        setPosts(prev => prev.map(p => p.id === postEditTarget.id ? res.data.data.post : p));
        if (postDetail?.id === postEditTarget.id) setPostDetail(res.data.data.post);
      } else {
        const res = await api.post<{ data: { post: Post } }>('/posts', { roomId: selectedRoom.id, title: postTitle.trim(), content: postContent.trim() });
        setPosts(prev => [res.data.data.post, ...prev]);
      }
      setPostFormOpen(false);
    } catch { /* 무시 */ }
  }
  async function deletePost(id: number) {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;
    await api.delete(`/posts/${id}`);
    setPosts(prev => prev.filter(p => p.id !== id));
    if (postDetail?.id === id) setPostDetail(null);
  }
  async function loadComments(postId: number) {
    setCommentsLoading(true);
    try {
      const res = await api.get<{ data: { comments: Comment[] } }>(`/comments?postId=${postId}`);
      setComments(res.data.data.comments);
    } catch { setComments([]); } finally { setCommentsLoading(false); }
  }
  async function submitComment() {
    if (!commentInput.trim() || !postDetail) return;
    try {
      if (commentEditId) {
        const res = await api.patch<{ data: { comment: Comment } }>(`/comments/${commentEditId}`, { content: commentInput.trim() });
        setComments(prev => prev.map(c => c.id === commentEditId ? res.data.data.comment : c));
        setCommentEditId(null);
      } else {
        const res = await api.post<{ data: { comment: Comment } }>('/comments', { postId: postDetail.id, content: commentInput.trim() });
        setComments(prev => [...prev, res.data.data.comment]);
      }
      setCommentInput('');
    } catch { /* 무시 */ }
  }
  function startEditComment(comment: Comment) { setCommentEditId(comment.id); setCommentInput(comment.content); }
  function cancelEditComment() { setCommentEditId(null); setCommentInput(''); }
  async function deleteComment(id: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    await api.delete(`/comments/${id}`);
    setComments(prev => prev.filter(c => c.id !== id));
  }

  if (!hydrated || !accessToken) return null;

  const viewingImages = viewingImageItems.map((i) => i.url);
  const viewingImage = viewingImages[viewingImageIdx] ?? null;
  const imageDateGroups = groupImagesByDate(viewingImageItems);

  // ── 이미지 라이트박스 ─────────────────────────────────────────────────────────
  const lightbox = viewingImages.length > 0 && viewingImage ? (
    <div
      onClick={() => { if (!showImageGrid) { setViewingImageItems([]); setShowImageGrid(false); } }}
      onTouchStart={(e) => {
        if (showImageGrid) return;
        if (e.touches.length >= 2) {
          pinchStart.current = { distance: getTouchDistance(e.touches), zoom: imageZoom };
          pinchMoved.current = false; touchStartX.current = null; return;
        }
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchMove={(e) => {
        if (showImageGrid || !pinchStart.current || e.touches.length < 2) return;
        e.preventDefault();
        const d = getTouchDistance(e.touches);
        if (pinchStart.current.distance <= 0 || d <= 0) return;
        const nz = Math.min(4, Math.max(1, Number((pinchStart.current.zoom * (d / pinchStart.current.distance)).toFixed(2))));
        pinchMoved.current = true; setImageZoom(nz);
        if (nz === 1) setImagePan({ x: 0, y: 0 });
      }}
      onTouchEnd={(e) => {
        if (showImageGrid) return;
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
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', touchAction: showImageGrid ? 'auto' : 'none' }}
    >
      {showImageGrid ? (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: '60px 10px 20px', overflowY: 'auto', padding: '2px 6px 20px' }}>
          {imageDateGroups.map((group) => (
            <section key={group.label} style={{ marginBottom: 22 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px 10px', background: '#000' }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{group.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{group.items.length}장</span>
                <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.16)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                {group.items.map((item) => (
                  <button key={`${item.url}-${item.index}`} type="button"
                    onClick={(e) => { e.stopPropagation(); setViewingImageIdx(item.index); setShowImageGrid(false); setImageZoom(1); setImagePan({ x: 0, y: 0 }); }}
                    style={{ aspectRatio: '1 / 1', borderRadius: 12, padding: 0, overflow: 'hidden', border: item.index === viewingImageIdx ? '3px solid #00C4B4' : '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <span style={{ position: 'absolute', right: 6, bottom: 6, minWidth: 20, height: 20, borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{item.index + 1}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={viewingImage} alt="이미지" onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); setImageZoom((z) => z > 1 ? 1 : 2); setImagePan({ x: 0, y: 0 }); }}
          onPointerDown={(e) => { if (imageZoom <= 1) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); imageDragStart.current = { x: e.clientX, y: e.clientY, panX: imagePan.x, panY: imagePan.y }; }}
          onPointerMove={(e) => { if (!imageDragStart.current) return; e.stopPropagation(); const s = imageDragStart.current; setImagePan({ x: s.panX + e.clientX - s.x, y: s.panY + e.clientY - s.y }); }}
          onPointerUp={(e) => { e.stopPropagation(); imageDragStart.current = null; }}
          onPointerCancel={() => { imageDragStart.current = null; }}
          style={{ maxWidth: '95vw', maxHeight: '78vh', borderRadius: 8, objectFit: 'contain', userSelect: 'none', cursor: imageZoom > 1 ? 'grab' : 'zoom-in', transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`, transition: imageDragStart.current ? 'none' : 'transform 120ms ease' }}
        />
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 14, left: 14 }}>
        <button onClick={() => setShowImageGrid((v) => !v)} style={{ background: showImageGrid ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 18, color: showImageGrid ? '#111' : '#fff', height: 34, padding: '0 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>▦ 사진목록</button>
      </div>
      <button onClick={(e) => { e.stopPropagation(); setViewingImageItems([]); setShowImageGrid(false); }} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      {!showImageGrid && viewingImageIdx > 0 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i - 1); }} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>}
      {!showImageGrid && viewingImageIdx < viewingImages.length - 1 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i + 1); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>}
      {!showImageGrid && <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{viewingImageIdx + 1} / {viewingImages.length}</span>
        <a href={viewingImage} download onClick={(e) => handleImageDownload(viewingImage, e)}
          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>⬇ 저장</a>
      </div>}
    </div>
  ) : null;

  const DayNightBtn = () => (
    <button onClick={() => setOyDark(!oyDark)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }} title={oyDark ? '라이트 모드' : '다크 모드'}>
      {oyDark ? <IcSun c={oy.primary} /> : <IcMoon c={oy.textMuted} />}
    </button>
  );

  const bottomNav = (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, height: NAV_H, background: oy.navBg, borderTop: `1px solid ${oy.border}`, display: 'flex', alignItems: 'center', zIndex: 100, boxShadow: oyDark ? '0 -1px 8px rgba(0,0,0,0.4)' : '0 -1px 8px rgba(0,0,0,0.06)' }}>
      {(['홈', '카테고리', '뷰티톡', 'MY', '더보기'] as BottomTab[]).map((tab) => {
        const active = activeTab === tab;
        const badge = tab === '뷰티톡' ? totalUnread : 0;
        const c = active ? oy.primary : '#BBBBBB';
        return (
          <button key={tab} onClick={() => switchTab(tab)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: active ? oy.primary : oy.textMuted, position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              {tab === '홈' && <IcHome active={active} c={c} />}
              {tab === '카테고리' && <IcCategory active={active} c={c} />}
              {tab === '뷰티톡' && <IcBeautyTalk active={active} c={c} />}
              {tab === 'MY' && <IcMy active={active} c={c} />}
              {tab === '더보기' && <IcMore active={active} c={c} />}
              {badge > 0 && <span style={{ position: 'absolute', top: -5, right: -8, background: oy.red, color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700, padding: '1px 4px', minWidth: 14, textAlign: 'center', lineHeight: '14px' }}>{badge > 99 ? '99+' : badge}</span>}
            </div>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, lineHeight: 1 }}>{tab}</span>
          </button>
        );
      })}
    </div>
  );

  // ── 채팅창 뷰 ────────────────────────────────────────────────────────────────
  if (view === 'chat' && selectedRoom) {
    const rColor = roomColor(selectedRoom.name);
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: HEADER_H, background: oy.cardBg, borderBottom: `1px solid ${oy.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
          {roomView !== '' ? (
            <button onClick={() => setRoomView('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: oy.primary, fontSize: 22, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          ) : (
            <button onClick={() => { setView('rooms'); setActiveTab('뷰티톡'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: oy.primary, fontSize: 22, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          )}
          <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${rColor}, ${rColor}BB)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>
            {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: oy.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRoom.name}</div>
          </div>
          {roomView === '' && (
            <>
              <button onClick={() => setRoomView('schedule')} title="일정" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0, position: 'relative' }}>
                📅
                {(selectedRoom.scheduleUnreadCount ?? 0) > 0 && <span style={{ position: 'absolute', top: 0, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#f7685b' }} />}
              </button>
              <button onClick={() => setRoomView('posts')} title="게시판" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0, position: 'relative' }}>
                📝
                {((selectedRoom.postUnreadCount ?? 0) + (selectedRoom.commentUnreadCount ?? 0)) > 0 && <span style={{ position: 'absolute', top: 0, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#f7685b' }} />}
              </button>
            </>
          )}
          <DayNightBtn />
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {roomView === 'schedule' ? (
            /* ── 일정 패널 ── */
            <div style={{ background: oy.bg, height: '100%', overflowY: 'auto' }}>
              <div style={{ background: oy.cardBg, borderBottom: `1px solid ${oy.border}`, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: oy.primary }}>📅 {selectedRoom.name} 일정</span>
                <button onClick={() => openScheduleForm()} style={{ background: oy.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 등록</button>
              </div>
              {schedLoading ? (
                <p style={{ textAlign: 'center', color: oy.textMuted, padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
              ) : schedules.length === 0 ? (
                <p style={{ textAlign: 'center', color: oy.textMuted, padding: '40px 0', fontSize: 13 }}>등록된 일정이 없습니다</p>
              ) : schedules.map(sc => {
                const d = new Date(sc.scheduledAt);
                const timeStr = sc.isAllDay ? '종일' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                const isPast = d < new Date();
                return (
                  <div key={sc.id} style={{ background: oy.cardBg, marginBottom: 1, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: `1px solid ${oy.border}` }}>
                    <div style={{ width: 42, flexShrink: 0, textAlign: 'center' as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: isPast ? oy.textMuted : oy.primary, lineHeight: 1 }}>{d.getDate()}</div>
                      <div style={{ fontSize: 10, color: oy.textMuted, marginTop: 1 }}>{d.toLocaleDateString('ko-KR', { weekday: 'short' })}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isPast ? oy.textMuted : oy.text, marginBottom: 2, textDecoration: isPast ? 'line-through' : 'none' }}>{sc.title}</div>
                      <div style={{ fontSize: 12, color: oy.textMuted }}>{d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} · {timeStr}</div>
                      {sc.description && <div style={{ fontSize: 12, color: oy.textMuted, marginTop: 4, whiteSpace: 'pre-wrap' }}>{sc.description}</div>}
                      <div style={{ fontSize: 11, color: oy.textFaint, marginTop: 4 }}>등록: {sc.createdBy.username}</div>
                    </div>
                    {sc.createdById === user?.id && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openScheduleForm(sc)} style={{ background: 'none', border: `1px solid ${oy.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: oy.text }}>수정</button>
                        <button onClick={() => deleteSchedule(sc.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#f7685b' }}>삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {schedFormOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setSchedFormOpen(false)}>
                  <div style={{ background: oy.cardBg, borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: oy.text }}>{schedEditTarget ? '일정 수정' : '일정 등록'}</h3>
                    <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="일정 제목 *" maxLength={200} style={{ width: '100%', border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, background: oy.searchBg, color: oy.text }} />
                    <textarea value={schedDesc} onChange={e => setSchedDesc(e.target.value)} placeholder="설명 (선택)" rows={2} style={{ width: '100%', border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none' as const, marginBottom: 10, boxSizing: 'border-box' as const, background: oy.searchBg, color: oy.text }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ flex: 1, border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, background: oy.searchBg, color: oy.text }} />
                      {!schedAllDay && <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={{ width: 100, border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, background: oy.searchBg, color: oy.text }} />}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: oy.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={schedAllDay} onChange={e => setSchedAllDay(e.target.checked)} /> 종일
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setSchedFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${oy.border}`, background: oy.searchBg, fontSize: 14, cursor: 'pointer', color: oy.text }}>취소</button>
                      <button onClick={submitSchedule} disabled={!schedTitle.trim() || !schedDate} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: oy.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!schedTitle.trim() || !schedDate) ? 0.5 : 1 }}>저장</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : roomView === 'posts' ? (
            /* ── 게시판 패널 ── */
            <div style={{ background: oy.bg, height: '100%', overflowY: 'auto' }}>
              {postDetail ? (
                <div style={{ background: oy.cardBg, minHeight: '100%', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                    <button onClick={() => setPostDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: oy.primary, fontSize: 13, fontWeight: 700, padding: 0 }}>← 목록</button>
                    {postDetail.authorId === user?.id && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => { setPostEditTarget(postDetail); setPostTitle(postDetail.title); setPostContent(postDetail.content); setPostFormOpen(true); }} style={{ background: 'none', border: `1px solid ${oy.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: oy.text }}>수정</button>
                        <button onClick={() => deletePost(postDetail.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#f7685b' }}>삭제</button>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: oy.text, marginBottom: 8 }}>{postDetail.title}</div>
                  <div style={{ fontSize: 11, color: oy.textFaint, marginBottom: 12 }}>{postDetail.author.username} · {new Date(postDetail.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                  {postDetail.sourceMessage && (
                    <div style={{ background: oyDark ? '#1A3030' : '#E8F9F7', borderLeft: `3px solid ${oy.primary}`, borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: oy.textMuted, marginBottom: 4 }}>💬 원본 메시지 · {postDetail.sourceMessage.sender?.username}</div>
                      <div style={{ fontSize: 13, color: oy.text, whiteSpace: 'pre-wrap' }}>{postDetail.sourceMessage.content}</div>
                    </div>
                  )}
                  <p style={{ fontSize: 14.5, color: oy.text, lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 24 }}>{postDetail.content}</p>
                  <div style={{ borderTop: `1px solid ${oy.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: oy.text, marginBottom: 12 }}>댓글 {comments.length}개</div>
                    <div style={{ marginBottom: 16 }}>
                      <textarea value={commentInput} onChange={e => setCommentInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentInput.trim()) { e.preventDefault(); submitComment(); } }}
                        placeholder="댓글을 입력하세요..." rows={2}
                        style={{ width: '100%', border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'none' as const, marginBottom: 8, boxSizing: 'border-box' as const, background: oy.searchBg, color: oy.text }} />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        {commentEditId && <button onClick={cancelEditComment} style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${oy.border}`, background: oy.searchBg, fontSize: 12, cursor: 'pointer', color: oy.text }}>취소</button>}
                        <button onClick={submitComment} disabled={!commentInput.trim()} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: oy.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: commentInput.trim() ? 1 : 0.5 }}>{commentEditId ? '수정' : '등록'}</button>
                      </div>
                    </div>
                    {commentsLoading ? (
                      <p style={{ textAlign: 'center', color: oy.textMuted, padding: '20px 0', fontSize: 12 }}>불러오는 중...</p>
                    ) : comments.length === 0 ? (
                      <p style={{ textAlign: 'center', color: oy.textMuted, padding: '20px 0', fontSize: 12 }}>첫 댓글을 작성해보세요</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                        {comments.map(comment => (
                          <div key={comment.id} style={{ padding: '12px', background: oyDark ? '#162626' : '#F5F5F5', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: oy.text }}>{comment.author.username}</span>
                                <span style={{ fontSize: 11, color: oy.textFaint, marginLeft: 6 }}>{new Date(comment.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {comment.authorId === user?.id && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => startEditComment(comment)} style={{ background: 'none', border: `1px solid ${oy.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: oy.text }}>수정</button>
                                  <button onClick={() => deleteComment(comment.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#f7685b' }}>삭제</button>
                                </div>
                              )}
                            </div>
                            <p style={{ fontSize: 13, color: oy.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background: oy.cardBg, borderBottom: `1px solid ${oy.border}`, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: oy.primary }}>📝 {selectedRoom.name} 게시판</span>
                    <button onClick={() => { setPostEditTarget(null); setPostTitle(''); setPostContent(''); setPostFormOpen(true); }} style={{ background: oy.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 글쓰기</button>
                  </div>
                  {postsLoading ? (
                    <p style={{ textAlign: 'center', color: oy.textMuted, padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
                  ) : posts.length === 0 ? (
                    <p style={{ textAlign: 'center', color: oy.textMuted, padding: '40px 0', fontSize: 13 }}>게시글이 없습니다</p>
                  ) : posts.map(p => (
                    <div key={p.id} onClick={() => setPostDetail(p)} style={{ background: oy.cardBg, padding: '13px 16px', cursor: 'pointer', borderBottom: `1px solid ${oy.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {p.sourceMessageId && <span style={{ fontSize: 10, background: oyDark ? '#1A3030' : '#E8F9F7', color: oy.primary, borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>채팅</span>}
                        <span style={{ fontWeight: 700, fontSize: 14, color: oy.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                        {p._count && p._count.comments > 0 && <span style={{ fontSize: 12, color: oy.primary, fontWeight: 700 }}>[{p._count.comments}]</span>}
                      </div>
                      <div style={{ fontSize: 12, color: oy.textMuted }}>{p.author.username} · {new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  ))}
                </>
              )}
              {postFormOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setPostFormOpen(false)}>
                  <div style={{ background: oy.cardBg, borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: oy.text }}>{postEditTarget ? '게시글 수정' : '게시글 작성'}</h3>
                    <input value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="제목 *" maxLength={200} style={{ width: '100%', border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, background: oy.searchBg, color: oy.text }} />
                    <textarea value={postContent} onChange={e => setPostContent(e.target.value)} placeholder="내용 *" rows={6} style={{ width: '100%', border: `1px solid ${oy.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none' as const, marginBottom: 16, boxSizing: 'border-box' as const, background: oy.searchBg, color: oy.text }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setPostFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${oy.border}`, background: oy.searchBg, fontSize: 14, cursor: 'pointer', color: oy.text }}>취소</button>
                      <button onClick={submitPost} disabled={!postTitle.trim() || !postContent.trim()} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: oy.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!postTitle.trim() || !postContent.trim()) ? 0.5 : 1 }}>저장</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ChatWindow
              roomId={selectedRoom.id}
              onLeave={() => { setView('rooms'); setActiveTab('뷰티톡'); }}
              backInterceptorRef={chatBackInterceptorRef}
              oyTheme oyDark={oyDark}
              onImageView={(url, imageList, options) => {
                const idx = imageList.findIndex((item) => item.url === url);
                setViewingImageItems(imageList); setViewingImageIdx(idx >= 0 ? idx : 0);
                setImageZoom(1); setImagePan({ x: 0, y: 0 });
                setShowImageGrid(Boolean(options?.showGrid));
              }}
            />
          )}
        </div>
        {lightbox}
      </div>
    );
  }

  // ── 채팅방 목록 뷰 ────────────────────────────────────────────────────────────
  if (view === 'rooms') {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column', background: oy.bg }}>
        <div style={{ height: HEADER_H, background: oy.cardBg, borderBottom: `1px solid ${oy.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: oy.text }}>뷰티톡</div>
            <div style={{ fontSize: 11, color: oy.textMuted, marginTop: 1 }}>뷰티 고민 함께 나눠요 💬</div>
          </div>
          <DayNightBtn />
          <button onClick={() => setShowCreateModal(true)} style={{ background: oy.primary, color: '#fff', border: 'none', borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 2px 8px ${oy.primary}44`, marginLeft: 6 }}>
            + 새 채팅방
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: oy.cardBg }}>
          {rooms.length === 0 ? (
            <div style={{ padding: '72px 0', textAlign: 'center', color: oy.textMuted }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: oy.text, marginBottom: 6 }}>채팅방이 없습니다</div>
              <div style={{ fontSize: 13 }}>뷰티 고민을 나눌 채팅방을 만들어보세요</div>
              <button onClick={() => setShowCreateModal(true)} style={{ marginTop: 20, background: oy.primary, color: '#fff', border: 'none', borderRadius: 22, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>채팅방 만들기</button>
            </div>
          ) : rooms.map((room) => <RoomCard key={room.id} room={room} onClick={() => openRoom(room)} oy={oy} />)}
        </div>
        {bottomNav}
        {showCreateModal && <CreateRoomModal onClose={() => setShowCreateModal(false)} onCreated={(room: Room) => { setShowCreateModal(false); openRoom(room); }} />}
      </div>
    );
  }

  // ── 홈 뷰 ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column', background: oy.bg, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ height: HEADER_H, background: oy.cardBg, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${oy.border}`, boxShadow: oyDark ? '0 1px 6px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${oy.primary}, ${oy.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🌿</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: oy.primary, letterSpacing: -0.3, lineHeight: 1.1 }}>OLIVE YOUNG</div>
            <div style={{ fontSize: 9, color: oy.textMuted, letterSpacing: 0.2, lineHeight: 1 }}>헬스&뷰티 스토어</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><IcSearch c={oy.text} /></button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><IcBell c={oy.text} /></button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><IcCart c={oy.text} /></button>
          <DayNightBtn />
          <button onClick={() => setChatTheme('naver')} style={{ background: 'none', border: `1px solid ${oy.borderMid}`, borderRadius: 12, padding: '3px 7px', fontSize: 10, color: oy.textMuted, cursor: 'pointer', fontWeight: 600 }} title="네이버 테마로 전환">N</button>
        </div>
      </div>

      {/* 스크롤 컨텐츠 */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: NAV_H }}>

        {/* 검색바 */}
        <div style={{ background: oy.cardBg, padding: '10px 16px 14px' }}>
          <div style={{ background: oy.searchBg, borderRadius: 26, height: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', border: `1px solid ${oy.border}` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={oy.textFaint} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ fontSize: 13, color: oy.textFaint }}>상품명, 브랜드, 성분 검색</span>
          </div>
        </div>

        {/* 메인 이벤트 배너 */}
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
          {OY_EVENTS.map((ev, i) => (
            <div key={i} style={{ display: i === bannerIdx ? 'block' : 'none', background: `linear-gradient(135deg, ${ev.c1} 0%, ${ev.c2} 100%)`, padding: '26px 22px 36px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: 1.5, marginBottom: 8 }}>EVENT</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: 6 }}>{ev.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 18 }}>{ev.sub}</div>
              <button style={{ background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 22, padding: '7px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>자세히 보기 →</button>
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 10, right: 14, display: 'flex', gap: 5 }}>
            {OY_EVENTS.map((_, i) => (<button key={i} onClick={() => setBannerIdx(i)} style={{ width: i === bannerIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === bannerIdx ? '#fff' : 'rgba(255,255,255,0.45)', border: 'none', cursor: 'pointer', padding: 0, transition: 'width 300ms ease' }} />))}
          </div>
          <div style={{ position: 'absolute', bottom: 10, left: 14, background: 'rgba(0,0,0,0.22)', borderRadius: 10, padding: '2px 8px', fontSize: 11, color: '#fff' }}>{bannerIdx + 1} / {OY_EVENTS.length}</div>
        </div>

        {/* 카테고리 퀵메뉴 */}
        <div style={{ background: oy.cardBg, padding: '16px 6px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 0' }}>
            {OY_CATEGORIES.map(({ emoji, label }) => (
              <button key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 20, background: oy.primaryLight, border: `1.5px solid ${oy.primary}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{emoji}</div>
                <span style={{ fontSize: 11.5, color: oy.textSub, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 8, background: oy.bg }} />

        {/* 오늘의 특가 */}
        <div style={{ background: oy.cardBg, paddingBottom: 18 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: oy.text }}>오늘의 특가</div>
              <div style={{ fontSize: 12, color: oy.red, fontWeight: 600, marginTop: 2 }}>🔥 오늘 자정 마감</div>
            </div>
            <span style={{ fontSize: 12, color: oy.textMuted, cursor: 'pointer', paddingBottom: 2 }}>전체보기 ›</span>
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {OY_DEALS.map(({ label, sub, c1, c2, emoji }) => (
              <div key={label} style={{ flex: '0 0 130px', borderRadius: 18, overflow: 'hidden', background: `linear-gradient(140deg, ${c1}, ${c2})`, cursor: 'pointer', boxShadow: `0 4px 14px ${c1}44` }}>
                <div style={{ padding: '16px 14px 16px' }}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>{emoji}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1.25 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{sub}</div>
                  <div style={{ marginTop: 12, display: 'inline-block', background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '3px 8px', fontSize: 11, color: '#fff', fontWeight: 600 }}>구매하기 →</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 8, background: oy.bg }} />

        {/* 베스트셀러 TOP 5 */}
        <div style={{ background: oy.cardBg, paddingBottom: 6 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: oy.text }}>베스트셀러</span>
              <span style={{ background: oy.primaryLight, color: oy.primary, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8 }}>TOP 5</span>
            </div>
            <span style={{ fontSize: 12, color: oy.textMuted, cursor: 'pointer' }}>전체보기 ›</span>
          </div>
          {OY_BEST.map(({ rank, brand, name, price, tag }) => (
            <div key={rank} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: rank < OY_BEST.length ? `1px solid ${oy.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ width: 28, textAlign: 'center' as const, flexShrink: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: rank === 1 ? oy.bestRankHigh : rank <= 3 ? oy.bestRankMid : oy.bestRankLow }}>{rank}</span>
              </div>
              <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: oy.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {['🐌', '🌿', '🔴', '💧', '💦'][rank - 1]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: oy.primary }}>{brand}</span>
                  {tag && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, color: tag === 'NEW' ? oy.tagNew : tag === '단독특가' ? oy.tagExclusive : oy.primary, background: tag === 'NEW' ? oy.tagNewBg : tag === '단독특가' ? oy.tagExBg : oy.primaryLight }}>{tag}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: oy.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: oy.text }}>{price}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 8, background: oy.bg }} />

        {/* 쿠폰 배너 */}
        <div style={{ background: oy.cardBg, padding: '14px 16px' }}>
          <div style={{ background: `linear-gradient(135deg, ${oy.primary} 0%, ${oy.primaryDark} 100%)`, borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: `0 4px 14px ${oy.couponGlow}33` }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>오늘의 혜택</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>🎫 쿠폰 받고 더 저렴하게!</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>최대 3,000원 즉시 할인</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎁</div>
          </div>
        </div>

        <div style={{ height: 8, background: oy.bg }} />

        {/* 뷰티 신상품 */}
        <div style={{ background: oy.cardBg, paddingBottom: 16 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: oy.text }}>뷰티 신상</span>
              <span style={{ background: oy.tagNewBg, color: oy.tagNew, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8 }}>NEW</span>
            </div>
            <span style={{ fontSize: 12, color: oy.textMuted, cursor: 'pointer' }}>전체보기 ›</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {OY_NEW_ITEMS.map((item) => (
              <div key={item.name} style={{ background: oy.cardBg, padding: '16px 14px', cursor: 'pointer', borderBottom: `1px solid ${oy.border}` }}>
                <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: oy.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 10, border: `1px solid ${oy.border}` }}>🧴</div>
                {item.isNew && <span style={{ fontSize: 10, fontWeight: 700, color: oy.tagNew, background: oy.tagNewBg, padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginBottom: 4 }}>NEW</span>}
                <div style={{ fontSize: 10, color: oy.primary, fontWeight: 600, marginBottom: 2 }}>{item.brand}</div>
                <div style={{ fontSize: 12.5, color: oy.text, fontWeight: 500, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{item.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: oy.text, marginTop: 6 }}>{item.price}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 16, background: oy.bg }} />
      </div>

      {bottomNav}

      {showCreateModal && <CreateRoomModal onClose={() => setShowCreateModal(false)} onCreated={(room: Room) => { setShowCreateModal(false); openRoom(room); }} />}
    </div>
  );
}
