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
};
type Comment = {
  id: number; postId: number; content: string; authorId: number;
  createdAt: string; updatedAt: string;
  author: { id: number; username: string; avatarUrl?: string };
};
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
    if (lastGroup?.label === label) {
      lastGroup.items.push({ ...item, index });
    } else {
      groups.push({ label, items: [{ ...item, index }] });
    }
  });
  return groups;
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
function IconMoon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}
function IconSun() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}

// ── 카페 행 (채팅방 = 카페) ──────────────────────────────────────────────────
function CafeRow({ room, onDoubleClick, dark }: { room: Room; onDoubleClick: () => void; dark?: boolean }) {
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
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: pressed ? (dark ? '#252525' : '#f5f5f5') : (dark ? '#1c1c1c' : '#fff'), borderBottom: `1px solid ${dark ? '#282828' : '#f2f2f2'}`, cursor: 'pointer', transition: 'background 80ms' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: 900 }}>
        {room.isArchive ? '📦' : room.name.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 14.5, fontWeight: hasUnread ? 800 : 700, color: dark ? '#e0e0e0' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
          {room.isMuted && <span style={{ fontSize: 11 }}>🔇</span>}
        </div>
        <div style={{ fontSize: 12.5, color: hasUnread ? (dark ? '#cccccc' : '#333') : (dark ? '#666666' : '#999'), fontWeight: hasUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMsg
            ? (lastMsg.content.startsWith('data:') || lastMsg.content.startsWith('http') ? '사진을 공유했습니다' : lastMsg.content)
            : (room.isArchive ? '나의 자료를 보관합니다' : '새 글이 없습니다')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {lastMsg && <span style={{ fontSize: 11, color: dark ? '#555555' : '#bbb' }}>{timeAgo(lastMsg.createdAt)}</span>}
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
export default function NaverChatPage({ backRef }: { backRef?: MutableRefObject<(() => void) | null> }) {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);
  const setChatTheme = usePreferencesStore((s) => s.setChatTheme);
  const naverDark = usePreferencesStore((s) => s.naverDark);
  const setNaverDark = usePreferencesStore((s) => s.setNaverDark);

  const [view, setView] = useState<View>('home');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomView, setRoomView] = useState<'' | 'schedule' | 'posts'>('');
  const [newsTab, setNewsTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingImageItems, setViewingImageItems] = useState<RoomImageItem[]>([]);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [showImageGrid, setShowImageGrid] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchMoved = useRef(false);
  const cafeClickCount = useRef(0);
  const cafeClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cafeTouchRef = useRef<number>(0);
  const cafeTransitionRef = useRef<number>(0);
  const ptrStartY = useRef<number | null>(null);
  const [ptrDist, setPtrDist] = useState(0);
  const [ptrLoading, setPtrLoading] = useState(false);
  const PTR_THRESHOLD = 60;

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

  const viewingImages = useMemo(() => viewingImageItems.map((i) => i.url), [viewingImageItems]);
  const viewingImage = viewingImages[viewingImageIdx] ?? null;
  const imageDateGroups = useMemo(() => groupImagesByDate(viewingImageItems), [viewingImageItems]);
  const totalUnread = useMemo(() =>
    rooms.reduce((acc, r) => acc + (!r.isMuted ? (r.unreadCount ?? 0) : 0), 0), [rooms]);

  // backRef 업데이트 — 렌더마다 갱신해서 최신 클로저 유지 (stale closure 방지)
  // ChatWindow 내부(모아보기 패널 등)에서 등록하는 뒤로가기 인터셉터
  const chatBackInterceptorRef = useRef<(() => boolean) | null>(null);
  if (backRef) backRef.current = () => {
    if (chatBackInterceptorRef.current?.()) return;
    if (showImageGrid || viewingImages.length > 0) { setViewingImageItems([]); setShowImageGrid(false); return; }
    if (roomView !== '') { setRoomView(''); return; }
    if (view === 'chat') { setView('rooms'); return; }
    if (view === 'rooms') { setView('home'); return; }
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

  // 각 상태 진입 시 history 항목 push → 뒤로가기 1회 = 상태 1단계 닫기
  useEffect(() => {
    if (view === 'chat' || view === 'rooms') {
      history.pushState({ _chat: true }, '', window.location.href);
    }
  }, [view]);
  useEffect(() => {
    if (roomView !== '') history.pushState({ _chat: true }, '', window.location.href);
  }, [roomView]);
  useEffect(() => {
    if (viewingImages.length > 0) history.pushState({ _chat: true }, '', window.location.href);
  }, [viewingImages.length]);

  useEffect(() => {
    if (roomView === 'schedule' && selectedRoom && accessToken) {
      setSchedLoading(true);
      setSchedules([]);
      api.get<{ data: { schedules: Schedule[] } }>(`/schedules?roomId=${selectedRoom.id}`)
        .then(res => setSchedules(res.data.data.schedules)).catch(() => {}).finally(() => setSchedLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomView, selectedRoom?.id, accessToken]);
  useEffect(() => {
    if (roomView === 'posts' && selectedRoom && accessToken) {
      setPostsLoading(true);
      setPosts([]);
      api.get<{ data: { posts: Post[] } }>(`/posts?roomId=${selectedRoom.id}`)
        .then(res => setPosts(res.data.data.posts)).catch(() => {}).finally(() => setPostsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomView, selectedRoom?.id, accessToken]);

  // 게시글 상세 보기로 전환될 때 댓글 로드
  useEffect(() => {
    if (postDetail) {
      loadComments(postDetail.id);
    } else {
      setComments([]);
      setCommentInput('');
      setCommentEditId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postDetail?.id]);

  function handlePtrTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (view !== 'home') return;
    if (window.scrollY > 0) return;
    ptrStartY.current = e.touches[0].clientY;
  }
  function handlePtrTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (ptrStartY.current === null) return;
    if (window.scrollY > 0) { ptrStartY.current = null; return; }
    const dy = e.touches[0].clientY - ptrStartY.current;
    if (dy > 0) setPtrDist(Math.min(dy * 0.4, PTR_THRESHOLD));
  }
  function handlePtrTouchEnd() {
    if (ptrStartY.current === null) return;
    ptrStartY.current = null;
    if (ptrDist >= PTR_THRESHOLD) {
      setPtrLoading(true);
      setPtrDist(0);
      window.location.reload();
    } else {
      setPtrDist(0);
    }
  }

  function openRoom(room: Room) {
    setRooms(rooms.map((r) => r.id === room.id ? { ...r, unreadCount: 0 } : r));
    setSelectedRoom({ ...room, unreadCount: 0 });
    setRoomView('');
    setView('chat');
  }
  function handleCafeClick() {
    cafeClickCount.current++;
    if (cafeClickTimer.current) clearTimeout(cafeClickTimer.current);
    cafeClickTimer.current = setTimeout(() => { cafeClickCount.current = 0; }, 320);
    if (cafeClickCount.current >= 2) {
      cafeClickCount.current = 0;
      cafeTransitionRef.current = Date.now();
      setTimeout(() => setView('rooms'), 80);
    }
  }
  function handleCafeTouchEnd() {
    const now = Date.now();
    if (now - cafeTouchRef.current < 320) {
      cafeTransitionRef.current = Date.now();
      setTimeout(() => setView('rooms'), 80);
    }
    cafeTouchRef.current = now;
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

  // ── 댓글 함수
  async function loadComments(postId: number) {
    setCommentsLoading(true);
    try {
      const res = await api.get<{ data: { comments: Comment[] } }>(`/comments?postId=${postId}`);
      setComments(res.data.data.comments);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
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

  function startEditComment(comment: Comment) {
    setCommentEditId(comment.id);
    setCommentInput(comment.content);
  }

  function cancelEditComment() {
    setCommentEditId(null);
    setCommentInput('');
  }

  async function deleteComment(id: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    await api.delete(`/comments/${id}`);
    setComments(prev => prev.filter(c => c.id !== id));
  }
    if (postDetail?.id === id) setPostDetail(null);
  }

  if (!hydrated || !accessToken) return null;

  const HEADER_H = 52;  const nv = {
    pageBg:      naverDark ? '#111111' : '#eef0f3',
    cardBg:      naverDark ? '#1c1c1c' : '#ffffff',
    headerBg:    naverDark ? '#161616' : '#eef0f3',
    border:      naverDark ? '#2e2e2e' : '#e8e8e8',
    borderFaint: naverDark ? '#252525' : '#f0f0f0',
    text:        naverDark ? '#e0e0e0' : '#111111',
    textMuted:   '#888888',
    textFaint:   naverDark ? '#555555' : '#bbbbbb',
    searchBg:    naverDark ? '#222222' : '#ffffff',
    searchPH:    naverDark ? '#555555' : '#c8c8c8',
    iconLabel:   naverDark ? '#bbbbbb' : '#444444',
    payColor:    naverDark ? '#aaaaaa' : '#555555',
    newsTagBg:   naverDark ? '#2a2a2a' : '#f5f5f5',
    bottomBg:    naverDark ? '#1c1c1c' : '#ffffff',
    gridGap:     naverDark ? '#111111' : '#f0f0f0',
    cardText:    naverDark ? '#cccccc' : '#222222',
    tabActive:   naverDark ? '#e0e0e0' : '#111111',
    tabInactive: naverDark ? '#555555' : '#aaaaaa',
  };
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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', inset: '60px 10px 20px', overflowY: 'auto', padding: '2px 6px 20px' }}
        >
          {imageDateGroups.map((group) => (
            <section key={group.label} style={{ marginBottom: 22 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px 10px', background: '#000' }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{group.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{group.items.length}장</span>
                <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.16)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, alignContent: 'start' }}>
                {group.items.map((item) => (
                  <button
                    key={`${item.url}-${item.index}`}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewingImageIdx(item.index); setShowImageGrid(false); setImageZoom(1); setImagePan({ x: 0, y: 0 }); }}
                    style={{ aspectRatio: '1 / 1', borderRadius: 12, padding: 0, overflow: 'hidden', border: item.index === viewingImageIdx ? '3px solid #fff' : '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative', boxShadow: '0 4px 14px rgba(0,0,0,0.24)' }}
                    title={`${item.index + 1}번째 이미지`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="이미지 썸네일" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
      {/* 도구 버튼 (왼쪽 상단) */}
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 14, left: 14 }}>
        <button onClick={() => setShowImageGrid((v) => !v)} style={{ background: showImageGrid ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 18, color: showImageGrid ? '#111' : '#fff', height: 34, padding: '0 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>▦ 사진목록</button>
      </div>
      {/* 닫기 버튼 */}
      <button onClick={(e) => { e.stopPropagation(); setViewingImageItems([]); setShowImageGrid(false); }} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      {/* 이전/다음 버튼 */}
      {!showImageGrid && viewingImageIdx > 0 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i - 1); }} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>}
      {!showImageGrid && viewingImageIdx < viewingImages.length - 1 && <button onClick={(e) => { e.stopPropagation(); setViewingImageIdx((i) => i + 1); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>}
      {!showImageGrid && <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{viewingImageIdx + 1} / {viewingImages.length}</div>}
    </div>
  ) : null;

  // ── 채팅창 뷰 ─────────────────────────────────────────────────────────────────
  if (view === 'chat' && selectedRoom) {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: HEADER_H, background: naverDark ? '#161616' : '#fff', borderBottom: `1px solid ${naverDark ? '#2e2e2e' : '#e8e8e8'}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
          {roomView !== '' ? (
            <button onClick={() => setRoomView('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: naverDark ? '#aaa' : '#111', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          ) : (
            <button onClick={() => setView('rooms')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: naverDark ? '#aaa' : '#111', fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
          )}
          <div style={{ width: 30, height: 30, borderRadius: 10, background: avatarColor(selectedRoom.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
            {selectedRoom.isArchive ? '📦' : selectedRoom.name.charAt(0)}
          </div>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: naverDark ? '#e0e0e0' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRoom.name}</span>
          {roomView === '' && (
            <>
              <button onClick={() => setRoomView('schedule')} title="일정" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>📅</button>
              <button onClick={() => setRoomView('posts')} title="게시판" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>📝</button>
            </>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {roomView === 'schedule' ? (
            /* ── 채팅방 일정 패널 ── */
            <div style={{ background: naverDark ? '#111' : '#f5f5f5', height: '100%', overflowY: 'auto' }}>
              <div style={{ background: nv.cardBg, borderBottom: `1px solid ${nv.border}`, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#03C75A' }}>📅 {selectedRoom.name} 일정</span>
                <button onClick={() => openScheduleForm()} style={{ background: '#03C75A', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 등록</button>
              </div>
              {schedLoading ? (
                <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
              ) : schedules.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>등록된 일정이 없습니다</p>
              ) : schedules.map(sc => {
                const d = new Date(sc.scheduledAt);
                const timeStr = sc.isAllDay ? '종일' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                const isPast = d < new Date();
                return (
                  <div key={sc.id} style={{ background: nv.cardBg, marginBottom: 1, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: `1px solid ${nv.borderFaint}` }}>
                    <div style={{ width: 42, flexShrink: 0, textAlign: 'center' as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: isPast ? '#666' : '#03C75A', lineHeight: 1 }}>{d.getDate()}</div>
                      <div style={{ fontSize: 10, color: nv.textMuted, marginTop: 1 }}>{d.toLocaleDateString('ko-KR', { weekday: 'short' })}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isPast ? '#666' : nv.text, marginBottom: 2, textDecoration: isPast ? 'line-through' : 'none' }}>{sc.title}</div>
                      <div style={{ fontSize: 12, color: nv.textMuted }}>{d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} · {timeStr}</div>
                      {sc.description && <div style={{ fontSize: 12, color: nv.textMuted, marginTop: 4, whiteSpace: 'pre-wrap' }}>{sc.description}</div>}
                      <div style={{ fontSize: 11, color: nv.textFaint, marginTop: 4 }}>등록: {sc.createdBy.username}</div>
                    </div>
                    {sc.createdById === user?.id && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openScheduleForm(sc)} style={{ background: 'none', border: `1px solid ${nv.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: nv.text }}>수정</button>
                        <button onClick={() => deleteSchedule(sc.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#f7685b' }}>삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {schedFormOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setSchedFormOpen(false)}>
                  <div style={{ background: nv.cardBg, borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: nv.text }}>{schedEditTarget ? '일정 수정' : '일정 등록'}</h3>
                    <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="일정 제목 *" maxLength={200} style={{ width: '100%', border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, background: nv.searchBg, color: nv.text }} />
                    <textarea value={schedDesc} onChange={e => setSchedDesc(e.target.value)} placeholder="설명 (선택)" rows={2} style={{ width: '100%', border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none' as const, marginBottom: 10, boxSizing: 'border-box' as const, background: nv.searchBg, color: nv.text }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ flex: 1, border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, background: nv.searchBg, color: nv.text }} />
                      {!schedAllDay && <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={{ width: 100, border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, background: nv.searchBg, color: nv.text }} />}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: nv.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={schedAllDay} onChange={e => setSchedAllDay(e.target.checked)} /> 종일
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setSchedFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${nv.border}`, background: nv.searchBg, fontSize: 14, cursor: 'pointer', color: nv.text }}>취소</button>
                      <button onClick={submitSchedule} disabled={!schedTitle.trim() || !schedDate} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#03C75A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!schedTitle.trim() || !schedDate) ? 0.5 : 1 }}>저장</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : roomView === 'posts' ? (
            /* ── 채팅방 게시판 패널 ── */
            <div style={{ background: naverDark ? '#111' : '#f5f5f5', height: '100%', overflowY: 'auto' }}>
              {postDetail ? (
                <div style={{ background: nv.cardBg, minHeight: '100%', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                    <button onClick={() => setPostDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#03C75A', fontSize: 13, fontWeight: 700, padding: 0 }}>← 목록</button>
                    {postDetail.authorId === user?.id && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => { setPostEditTarget(postDetail); setPostTitle(postDetail.title); setPostContent(postDetail.content); setPostFormOpen(true); }} style={{ background: 'none', border: `1px solid ${nv.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: nv.text }}>수정</button>
                        <button onClick={() => deletePost(postDetail.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#f7685b' }}>삭제</button>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: nv.text, marginBottom: 8 }}>{postDetail.title}</div>
                  <div style={{ fontSize: 11, color: nv.textFaint, marginBottom: 12 }}>
                    {postDetail.author.username} · {new Date(postDetail.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  {postDetail.sourceMessage && (
                    <div style={{ background: naverDark ? '#1a2e20' : '#e6f7f0', borderLeft: '3px solid #03C75A', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: nv.textMuted, marginBottom: 4 }}>💬 원본 메시지 · {postDetail.sourceMessage.sender?.username}</div>
                      <div style={{ fontSize: 13, color: nv.text, whiteSpace: 'pre-wrap' }}>{postDetail.sourceMessage.content}</div>
                    </div>
                  )}
                  <p style={{ fontSize: 14.5, color: nv.text, lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 24 }}>{postDetail.content}</p>
                  
                  {/* ── 댓글 섹션 ── */}
                  <div style={{ borderTop: `1px solid ${nv.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: nv.text, marginBottom: 12 }}>
                      댓글 {comments.length}개
                    </div>
                    
                    {/* 댓글 입력 */}
                    <div style={{ marginBottom: 16 }}>
                      <textarea 
                        value={commentInput} 
                        onChange={e => setCommentInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentInput.trim()) { e.preventDefault(); submitComment(); } }}
                        placeholder="댓글을 입력하세요..."
                        rows={2}
                        style={{ width: '100%', border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'none', marginBottom: 8, boxSizing: 'border-box', background: nv.searchBg, color: nv.text }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        {commentEditId && (
                          <button onClick={cancelEditComment} 
                            style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${nv.border}`, background: nv.searchBg, fontSize: 12, cursor: 'pointer', color: nv.text }}>
                            취소
                          </button>
                        )}
                        <button onClick={submitComment} disabled={!commentInput.trim()}
                          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#03C75A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: commentInput.trim() ? 1 : 0.5 }}>
                          {commentEditId ? '수정' : '등록'}
                        </button>
                      </div>
                    </div>

                    {/* 댓글 목록 */}
                    {commentsLoading ? (
                      <p style={{ textAlign: 'center', color: '#aaa', padding: '20px 0', fontSize: 12 }}>불러오는 중...</p>
                    ) : comments.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#aaa', padding: '20px 0', fontSize: 12 }}>첫 댓글을 작성해보세요</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {comments.map(comment => (
                          <div key={comment.id} style={{ padding: '12px', background: naverDark ? '#1e1e1e' : '#f8f9fa', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: nv.text }}>{comment.author.username}</span>
                                <span style={{ fontSize: 11, color: nv.textFaint, marginLeft: 6 }}>
                                  {new Date(comment.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {comment.authorId === user?.id && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => startEditComment(comment)}
                                    style={{ background: 'none', border: `1px solid ${nv.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: nv.text }}>
                                    수정
                                  </button>
                                  <button onClick={() => deleteComment(comment.id)}
                                    style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#f7685b' }}>
                                    삭제
                                  </button>
                                </div>
                              )}
                            </div>
                            <p style={{ fontSize: 13, color: nv.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background: nv.cardBg, borderBottom: `1px solid ${nv.border}`, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#03C75A' }}>📝 {selectedRoom.name} 게시판</span>
                    <button onClick={() => { setPostEditTarget(null); setPostTitle(''); setPostContent(''); setPostFormOpen(true); }} style={{ background: '#03C75A', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 글쓰기</button>
                  </div>
                  {postsLoading ? (
                    <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
                  ) : posts.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>게시글이 없습니다</p>
                  ) : posts.map(p => (
                    <div key={p.id} onClick={() => setPostDetail(p)} style={{ background: nv.cardBg, padding: '13px 16px', cursor: 'pointer', borderBottom: `1px solid ${nv.borderFaint}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {p.sourceMessageId && <span style={{ fontSize: 10, background: naverDark ? '#1a2e20' : '#e6f7f0', color: '#03C75A', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>채팅</span>}
                        <span style={{ fontWeight: 700, fontSize: 14, color: nv.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: nv.textMuted }}>{p.author.username} · {new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  ))}
                </>
              )}
              {postFormOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setPostFormOpen(false)}>
                  <div style={{ background: nv.cardBg, borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: nv.text }}>{postEditTarget ? '게시글 수정' : '게시글 작성'}</h3>
                    <input value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="제목 *" maxLength={200} style={{ width: '100%', border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, background: nv.searchBg, color: nv.text }} />
                    <textarea value={postContent} onChange={e => setPostContent(e.target.value)} placeholder="내용 *" rows={6} style={{ width: '100%', border: `1px solid ${nv.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none' as const, marginBottom: 16, boxSizing: 'border-box' as const, background: nv.searchBg, color: nv.text }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setPostFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${nv.border}`, background: nv.searchBg, fontSize: 14, cursor: 'pointer', color: nv.text }}>취소</button>
                      <button onClick={submitPost} disabled={!postTitle.trim() || !postContent.trim()} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#03C75A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!postTitle.trim() || !postContent.trim()) ? 0.5 : 1 }}>저장</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ChatWindow roomId={selectedRoom.id} onLeave={() => setView('rooms')} naverTheme naverDark={naverDark}
              backInterceptorRef={chatBackInterceptorRef}
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

  // ── 카페 목록 뷰 ──────────────────────────────────────────────────────────────
  if (view === 'rooms') {
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: naverDark ? '#111111' : '#f5f5f5', fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 100, height: HEADER_H, background: nv.cardBg, borderBottom: `1px solid ${nv.border}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
          <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: nv.text, fontSize: 20, padding: '4px 8px 4px 0', lineHeight: 1, flexShrink: 0 }}>←</button>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#03C75A', letterSpacing: -0.5 }}>카페</span>
          <button onClick={() => setShowCreateModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: nv.textMuted, display: 'flex', alignItems: 'center', padding: 4 }}><IconSearch /></button>
          <button onClick={() => setShowCreateModal(true)} style={{ width: 32, height: 32, borderRadius: 16, background: '#03C75A', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
        </header>
        <div style={{ background: nv.cardBg, borderBottom: `1px solid ${nv.border}`, padding: '0 16px', display: 'flex' }}>
          <div style={{ padding: '12px 0', fontSize: 14, fontWeight: 800, color: '#03C75A', borderBottom: '2.5px solid #03C75A', marginBottom: -1 }}>내 카페</div>
          <div style={{ padding: '12px 16px', fontSize: 14, color: nv.tabInactive }}>추천 카페</div>
        </div>
        <div style={{ background: nv.cardBg, marginTop: 8 }}>
          {rooms.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' as const }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☕</div>
              <div style={{ fontSize: 14, color: nv.tabInactive, marginBottom: 20 }}>가입한 카페가 없습니다</div>
              <button onClick={() => setShowCreateModal(true)} style={{ background: '#03C75A', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 26px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>카페 만들기</button>
            </div>
          ) : (
            rooms.map((room) => <CafeRow key={room.id} room={room} onDoubleClick={() => { if (Date.now() - cafeTransitionRef.current < 350) return; openRoom(room); }} dark={naverDark} />)
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
    <div
      style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: nv.pageBg, fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif' }}
      onTouchStart={handlePtrTouchStart}
      onTouchMove={handlePtrTouchMove}
      onTouchEnd={handlePtrTouchEnd}
    >
      {/* Pull-to-Refresh 인디케이터 */}
      {(ptrDist > 0 || ptrLoading) && (
        <div style={{
          height: ptrLoading ? 44 : ptrDist * 44 / PTR_THRESHOLD,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: ptrDist === 0 ? 'height 200ms ease' : 'none',
        }}>
          <span style={{ fontSize: 20, opacity: ptrLoading ? 1 : ptrDist / PTR_THRESHOLD, animation: ptrLoading ? 'spin 0.7s linear infinite' : 'none' }}>
            {ptrLoading ? '⟳' : '↓'}
          </span>
        </div>
      )}

      {/* ① 헤더 */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: nv.headerBg, height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
        <div style={{ width: 52, height: 28, borderRadius: 7, border: `1.5px solid ${nv.payColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: nv.payColor, fontSize: 13, fontWeight: 900, letterSpacing: -0.5 }}>pay</span>
        </div>
      </header>

      {/* ② 검색바 */}
      <div style={{ padding: '0 12px 14px', background: nv.headerBg }}>
        <div style={{ background: nv.searchBg, borderRadius: 28, height: 52, display: 'flex', alignItems: 'center', paddingLeft: 18, paddingRight: 6, gap: 10, boxShadow: naverDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
          <span style={{ color: '#03C75A', fontWeight: 900, fontSize: 26, fontStyle: 'italic', lineHeight: 1, flexShrink: 0 }}>N</span>
          <span style={{ flex: 1, fontSize: 15, color: nv.searchPH, userSelect: 'none' }}>검색어를 입력하세요</span>
          <button style={{ width: 40, height: 40, borderRadius: 20, background: '#03C75A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconMic />
          </button>
        </div>
      </div>

      {/* ③ 빠른 서비스 아이콘 */}
      <div style={{ background: nv.cardBg, marginBottom: 8, padding: '0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '14px 0 4px', gap: 0, scrollbarWidth: 'none' }}>
          {/* 메일 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#03C75A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22 }}>✉️</span>
            </div>
            <span style={{ fontSize: 11, color: nv.iconLabel }}>메일</span>
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
            <span style={{ fontSize: 11, color: nv.iconLabel }}>카페</span>
          </div>
          {/* N쇼핑 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 68, flexShrink: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#1ec800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22 }}>🛍️</span>
            </div>
            <span style={{ fontSize: 11, color: nv.iconLabel }}>N쇼핑</span>
          </div>
          {/* 구분선 */}
          <div style={{ width: 1, height: 46, background: nv.border, alignSelf: 'center', margin: '0 6px', flexShrink: 0 }} />
          {(naverDark ? [
            { emoji: '📰', label: '뉴스',   bg: '#1a2a4a', fg: '#6ba4ff' },
            { emoji: '⚽', label: '스포츠', bg: '#1a2e1a', fg: '#4eca71' },
            { emoji: '🎬', label: '엔터',   bg: '#2e1a1a', fg: '#ff6b6b' },
            { emoji: '🛒', label: '쇼핑',   bg: '#2e2214', fg: '#ffb347' },
            { emoji: '📊', label: '경제',   bg: '#1a244a', fg: '#6b9fff' },
            { emoji: '▶️', label: '클립',   bg: '#231a2e', fg: '#c084f5' },
          ] : [
            { emoji: '📰', label: '뉴스',   bg: '#e8f0fe', fg: '#1a73e8' },
            { emoji: '⚽', label: '스포츠', bg: '#e6f4ea', fg: '#1e8e3e' },
            { emoji: '🎬', label: '엔터',   bg: '#fce8e6', fg: '#d93025' },
            { emoji: '🛒', label: '쇼핑',   bg: '#fff3e0', fg: '#e37400' },
            { emoji: '📊', label: '경제',   bg: '#e8f0fe', fg: '#1967d2' },
            { emoji: '▶️', label: '클립',   bg: '#f3e8fd', fg: '#9334e6' },
          ]).map(({ emoji, label, bg, fg }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 60, flexShrink: 0, cursor: 'pointer' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22 }}>{emoji}</span>
              </div>
              <span style={{ fontSize: 11, color: fg, fontWeight: 700 }}>{label}</span>
            </div>
          ))}
        </div>
        {/* 공지 스트립 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: `1px solid ${nv.borderFaint}` }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📢</span>
          <span style={{ fontSize: 13, color: nv.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            코스피 8,476 마감...개인투자자 순매수 3조원 돌파
          </span>
        </div>
      </div>

      {/* ④ 날씨 / 주가 스트립 */}
      <div style={{ background: nv.cardBg, padding: '12px 16px', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 22 }}>🌙</span>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: nv.text }}>23.6°</span>
            <span style={{ fontSize: 12, color: nv.textMuted, marginLeft: 6 }}>서울</span>
          </div>
        </div>
        <div style={{ width: 1, height: 26, background: nv.border }} />
        <div style={{ flex: 1, paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: nv.textMuted }}>다우존스</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: nv.text }}>50,865.33</span>
          <span style={{ fontSize: 11, color: '#f7685b', fontWeight: 700 }}>▲0.39%</span>
        </div>
      </div>

      {/* ⑤ 뉴스 카드 (이코노미스트 스타일) */}
      <div style={{ background: nv.cardBg, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 0', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#c8001e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', textAlign: 'center' as const, lineHeight: 1.3 }}>이코노미스트</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: nv.text }}>이코노미스트</span>
              <span style={{ background: nv.newsTagBg, color: nv.textMuted, fontSize: 10, padding: '2px 7px', borderRadius: 10 }}>100만</span>
            </div>
            <span style={{ fontSize: 11.5, color: nv.textFaint }}>{todayStr()}</span>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: nv.textFaint, padding: 4 }}><IconMore /></button>
        </div>
        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${nv.borderFaint}`, padding: '0 14px', marginTop: 10 }}>
          {NEWS_TABS.map((tab, i) => (
            <button key={tab} onClick={() => setNewsTab(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px 10px 0', fontSize: 14, fontWeight: newsTab === i ? 800 : 500, color: newsTab === i ? nv.tabActive : nv.tabInactive, borderBottom: newsTab === i ? `2.5px solid ${nv.tabActive}` : '2.5px solid transparent', marginBottom: -1 }}>
              {tab}
            </button>
          ))}
        </div>
        {/* 뉴스 목록 */}
        <div style={{ padding: '4px 0 8px' }}>
          {NEWS_ITEMS[newsTab].map((headline, i) => (
            <div key={i} style={{ padding: '10px 16px', borderBottom: i < NEWS_ITEMS[newsTab].length - 1 ? `1px solid ${nv.borderFaint}` : 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 13.5, color: nv.cardText, lineHeight: 1.5 }}>{headline}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ⑥ 2열 이미지 뉴스 카드 */}
      <div style={{ background: nv.cardBg, marginBottom: 70 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: nv.gridGap }}>
          {NEWS_CARDS.map((card, i) => (
            <div key={i} style={{ background: nv.cardBg, cursor: 'pointer', overflow: 'hidden' }}>
              <div style={{ width: '100%', aspectRatio: '16/9', background: `linear-gradient(145deg, ${card.c1}, ${card.c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 36 }}>{card.emoji}</span>
              </div>
              <div style={{ padding: '8px 10px 12px' }}>
                <span style={{ fontSize: 12.5, color: nv.cardText, lineHeight: 1.45 }}>{card.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 바 (다크모드 토글 + 테마전환 + 로그아웃) */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: nv.bottomBg, borderTop: `1px solid ${nv.border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, zIndex: 50 }}>
        <button onClick={() => setNaverDark(!naverDark)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: naverDark ? '#ffd700' : '#aaa', padding: 4, display: 'flex', alignItems: 'center' }} title="다크/라이트 모드">
          {naverDark ? <IconSun /> : <IconMoon />}
        </button>
        <button onClick={() => setChatTheme('slr')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 4, display: 'flex', alignItems: 'center' }} title="SLR 테마로 전환">
          <IconPalette />
        </button>
        <button onClick={() => { clearAuth(); router.replace('/login'); }} style={{ background: naverDark ? '#2a2a2a' : '#f5f5f5', border: `1px solid ${naverDark ? '#444' : '#e0e0e0'}`, borderRadius: 16, padding: '6px 14px', fontSize: 12, color: naverDark ? '#cccccc' : '#555', cursor: 'pointer', fontWeight: 600 }}>로그아웃</button>
      </div>
    </div>
  );
}
