'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { usePreferencesStore } from '@/store/preferences';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import NaverChatPage from './NaverChatPage';
import type { Room, Schedule, Post } from '@chat/types';

type RoomImageItem = {
  url: string;
  createdAt?: string;
};

function IconCommunity() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/>
      <circle cx='9' cy='7' r='4'/>
      <path d='M23 21v-2a4 4 0 0 0-3-3.87'/>
      <path d='M16 3.13a4 4 0 0 1 0 7.75'/>
    </svg>
  );
}
function IconForum() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>
    </svg>
  );
}
function IconGallery() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <rect x='3' y='3' width='18' height='18' rx='2'/>
      <circle cx='8.5' cy='8.5' r='1.5'/>
      <polyline points='21 15 16 10 5 21'/>
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <rect x='3' y='3' width='18' height='18' rx='2'/>
      <line x1='9' y1='9' x2='15' y2='9'/>
      <line x1='9' y1='13' x2='15' y2='13'/>
      <line x1='9' y1='17' x2='12' y2='17'/>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <circle cx='9' cy='21' r='1'/>
      <circle cx='20' cy='21' r='1'/>
      <path d='M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <rect x='3' y='4' width='18' height='18' rx='2'/>
      <line x1='16' y1='2' x2='16' y2='6'/>
      <line x1='8' y1='2' x2='8' y2='6'/>
      <line x1='3' y1='10' x2='21' y2='10'/>
    </svg>
  );
}
function IconBoard() {
  return (
    <svg width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6'>
      <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/>
      <polyline points='14 2 14 8 20 8'/>
      <line x1='16' y1='13' x2='8' y2='13'/>
      <line x1='16' y1='17' x2='8' y2='17'/>
      <polyline points='10 9 9 9 8 9'/>
    </svg>
  );
}

function PostRow({ category, title, count, onClick }: {
  category: string;
  title: string;
  count?: number;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        height: 44,
        borderBottom: '1px solid #efefef',
        background: hovered ? '#fafafa' : '#fff',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        fontSize: 13.5, color: '#333', flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4,
      }}>
        <span style={{ color: '#333' }}>[{category}]</span>
        {' '}{title}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          marginLeft: 8, minWidth: 22, height: 22, borderRadius: 11,
          background: '#1a76c8', color: '#fff', fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', flexShrink: 0,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      padding: '10px 14px 9px', background: '#f4f4f4', borderBottom: '1px solid #e0e0e0',
      fontSize: 14, fontWeight: 700, color: '#222',
    }}>
      {title}
    </div>
  );
}

function SectionGap() {
  return <div style={{ height: 10, background: '#f0f0f0' }} />;
}

function AdBlock() {
  return (
    <div style={{ background: '#fff', padding: '10px 14px 12px', borderBottom: '1px solid #efefef' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>파워링크</span>
        <span style={{ fontSize: 10, color: '#888', border: '1px solid #ccc', padding: '0 3px', borderRadius: 2 }}>광고</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>광고신청</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b', marginBottom: 2 }}>
        미러리스 카메라 최대 30% 할인
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 3 }}>www.photomall.co.kr</div>
      <div style={{ fontSize: 12, color: '#555' }}>
        소니, 캐논, 니콘 최신 카메라 특가 판매
      </div>
    </div>
  );
}

function ScrollToTopBtn({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed', bottom: 22, right: 16,
        background: '#555', color: '#fff', fontSize: 12, padding: '7px 14px',
        borderRadius: 20, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        userSelect: 'none', zIndex: 200,
      }}
    >
      ↑ 맨위로
    </div>
  );
}

function getTouchDistance(touches: { length: number; [index: number]: { clientX: number; clientY: number } }): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
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

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);
  const chatTheme = usePreferencesStore((s) => s.chatTheme);
  const setChatTheme = usePreferencesStore((s) => s.setChatTheme);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showChatList, setShowChatList] = useState(false);
  const [activeView, setActiveView] = useState<'' | 'schedule' | 'posts'>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingImageItems, setViewingImageItems] = useState<RoomImageItem[]>([]);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [showImageGrid, setShowImageGrid] = useState(false);
  const viewingImages = useMemo(() => viewingImageItems.map((item) => item.url), [viewingImageItems]);
  const imageDateGroups = useMemo(() => groupImagesByDate(viewingImageItems), [viewingImageItems]);
  const viewingImage = viewingImages[viewingImageIdx] ?? null;
  const touchStartX = useRef<number | null>(null);
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const pinchMoved = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryClickCount = useRef(0);
  const galleryClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // popstate 핸들러를 ref로 관리 → capture phase로 等록해 Next.js router보다 먼저 실행
  const popStateHandlerRef = useRef<(() => void) | null>(null);

  function handleGalleryClick() {
    galleryClickCount.current += 1;
    if (galleryClickTimer.current) clearTimeout(galleryClickTimer.current);
    galleryClickTimer.current = setTimeout(() => { galleryClickCount.current = 0; }, 350);
    if (galleryClickCount.current >= 2) {
      galleryClickCount.current = 0;
      if (galleryClickTimer.current) clearTimeout(galleryClickTimer.current);
      setSelectedRoom(null);
      setShowChatList(true);
    }
  }

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/login');
  }, [hydrated, accessToken, router]);

  // 푸시 알림 클릭으로 ?view=schedule 진입 시 일정 뷰 자동 오픈
  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const view = searchParams.get('view');
    if (view === 'schedule') setActiveView('schedule');
  }, [hydrated, accessToken, searchParams]);

  // ───────── 브라우저 뒤로가기 인터셉트 ─────────
  // 문제 원인: Next.js App Router는 bubble phase에서 popstate를 수신 → history 상태에 따라
  //   /login 으로 이동해버림. capture phase로 먼저 잡고 stopImmediatePropagation으로 차단.
  // 각 상태 진입시 별도 history 항목을 push → 뒤로가기 1회 = 상태 1단계 닫기
  popStateHandlerRef.current = () => {
    if (viewingImages.length > 0) {
      setViewingImageItems([]);
    } else if (selectedRoom) {
      setSelectedRoom(null);
    } else if (showChatList) {
      setShowChatList(false);
    } else if (activeView !== '') {
      setActiveView('');
    }
    // 다음 뒤로가기도 가로채기 위해 센티넬 재push
    history.pushState({ _chat: true }, '', window.location.href);
  };

  // 마운트 1회: 초기 센티넬 + capture phase 리스너 등록
  useEffect(() => {
    history.pushState({ _chat: true }, '', window.location.href);
    function handler(e: PopStateEvent) {
      // _chat 마커가 없는 항목(Next.js 자체 항목)은 가로채지 않음
      if (!e.state?._chat) return;
      // Next.js의 bubble phase 핸들러가 실행되지 않도록 차단
      e.stopImmediatePropagation();
      popStateHandlerRef.current?.();
    }
    window.addEventListener('popstate', handler, true); // capture phase
    return () => window.removeEventListener('popstate', handler, true);
  }, []);

  // 각 상태 진입시 별도 history 항목 push (레이어별 1개)
  useEffect(() => {
    if (activeView !== '') history.pushState({ _chat: true }, '', window.location.href);
  }, [activeView]);
  useEffect(() => {
    if (showChatList) history.pushState({ _chat: true }, '', window.location.href);
  }, [showChatList]);
  useEffect(() => {
    if (selectedRoom) history.pushState({ _chat: true }, '', window.location.href);
  }, [selectedRoom]);
  useEffect(() => {
    if (viewingImages.length > 0) history.pushState({ _chat: true }, '', window.location.href);
  }, [viewingImages.length]);

  useEffect(() => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setShowImageGrid(false);
    imageDragStart.current = null;
    pinchStart.current = null;
    pinchMoved.current = false;
  }, [viewingImageIdx, viewingImageItems]);

  useEffect(() => {
    if (accessToken) {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
    }
  }, [accessToken, setRooms]);

  useEffect(() => {
    if (!accessToken || !showChatList || selectedRoom) return;
    const timer = setInterval(() => {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data)).catch(() => { /* 목록 갱신 실패 무시 */ });
    }, 8000);
    return () => clearInterval(timer);
  }, [accessToken, showChatList, selectedRoom, setRooms]);

  // ── 일정 상태
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedFormOpen, setSchedFormOpen] = useState(false);
  const [schedEditTarget, setSchedEditTarget] = useState<Schedule | null>(null);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedAllDay, setSchedAllDay] = useState(false);

  // ── 게시글 상태
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postFormOpen, setPostFormOpen] = useState(false);
  const [postEditTarget, setPostEditTarget] = useState<Post | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postDetail, setPostDetail] = useState<Post | null>(null);

  // 일정 데이터 로드
  useEffect(() => {
    if (activeView === 'schedule' && accessToken && schedules.length === 0 && !schedLoading) {
      setSchedLoading(true);
      api.get<{ data: { schedules: Schedule[] } }>('/schedules')
        .then(res => setSchedules(res.data.data.schedules))
        .catch(() => {})
        .finally(() => setSchedLoading(false));
    }
  }, [activeView, accessToken, schedules.length, schedLoading]);

  // 게시글 데이터 로드
  useEffect(() => {
    if (activeView === 'posts' && accessToken && posts.length === 0 && !postsLoading) {
      setPostsLoading(true);
      api.get<{ data: { posts: Post[] } }>('/posts')
        .then(res => setPosts(res.data.data.posts))
        .catch(() => {})
        .finally(() => setPostsLoading(false));
    }
  }, [activeView, accessToken, posts.length, postsLoading]);

  function openScheduleForm(edit?: Schedule) {
    setSchedEditTarget(edit ?? null);
    if (edit) {
      setSchedTitle(edit.title);
      setSchedDesc(edit.description ?? '');
      const d = new Date(edit.scheduledAt);
      setSchedDate(d.toISOString().slice(0, 10));
      setSchedTime(edit.isAllDay ? '' : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
      setSchedAllDay(edit.isAllDay);
    } else {
      const now = new Date(); now.setMinutes(now.getMinutes() + 30);
      setSchedTitle('');
      setSchedDesc('');
      setSchedDate(now.toISOString().slice(0, 10));
      setSchedTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
      setSchedAllDay(false);
    }
    setSchedFormOpen(true);
  }

  async function submitSchedule() {
    if (!schedTitle.trim() || !schedDate) return;
    const scheduledAt = schedAllDay
      ? new Date(schedDate + 'T00:00:00').toISOString()
      : new Date(`${schedDate}T${schedTime || '00:00'}:00`).toISOString();
    try {
      if (schedEditTarget) {
        const res = await api.patch<{ data: { schedule: Schedule } }>(`/schedules/${schedEditTarget.id}`, { title: schedTitle.trim(), description: schedDesc.trim() || undefined, scheduledAt, isAllDay: schedAllDay });
        setSchedules(prev => prev.map(s => s.id === schedEditTarget.id ? res.data.data.schedule : s));
      } else {
        const res = await api.post<{ data: { schedule: Schedule } }>('/schedules', { title: schedTitle.trim(), description: schedDesc.trim() || undefined, scheduledAt, isAllDay: schedAllDay });
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

  function openPostForm(edit?: Post, prefill?: { title?: string; content?: string }) {
    setPostEditTarget(edit ?? null);
    setPostTitle(edit?.title ?? prefill?.title ?? '');
    setPostContent(edit?.content ?? prefill?.content ?? '');
    setPostFormOpen(true);
  }

  async function submitPost() {
    if (!postTitle.trim() || !postContent.trim()) return;
    try {
      if (postEditTarget) {
        const res = await api.patch<{ data: { post: Post } }>(`/posts/${postEditTarget.id}`, { title: postTitle.trim(), content: postContent.trim() });
        setPosts(prev => prev.map(p => p.id === postEditTarget.id ? res.data.data.post : p));
        if (postDetail?.id === postEditTarget.id) setPostDetail(res.data.data.post);
      } else {
        const res = await api.post<{ data: { post: Post } }>('/posts', { title: postTitle.trim(), content: postContent.trim() });
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

  function handleLogout() {
    clear();
    router.replace('/login');
  }

  function openRoom(room: Room) {
    setSelectedRoom(room);
    setShowChatList(false);
    setActiveView('');
  }

  if (!hydrated || !accessToken) return null;

  // 네이버 테마 선택 시 전용 컴포넌트 렌더링
  if (chatTheme === 'naver') return <NaverChatPage />;

  const HOT_POSTS = [
    { category: '자유게시판', title: '정말 좋으네요', count: 11 },
    { category: '소니포럼', title: '지금 온라인샵에서a7m5 구입하면 정품등록이벤트 있나요?', count: 3 },
    { category: '자유게시판', title: '한국 핵잠수함 기본설계, 올해 마무리', count: 21 },
    { category: '정치게시판', title: '이번 지방선거 투표율 예상이 어떻게 될까요?', count: 14 },
    { category: '자유게시판', title: '주식으로 돈 벌면 부모님 용돈 드릴려구요', count: 8 },
  ];
  const BEST_POSTS = [
    { category: '자유게시판', title: '한국 핵잠수함 기본설계, 올해 마무리', count: 21 },
    { category: '자유게시판', title: '민폐 스토커 피고소충들 정신 못차리네', count: 35 },
    { category: '자유게시판', title: '내일 삼닉 예상', count: 39 },
    { category: '자유게시판', title: '대구 여론조사 놀랍네요.;; (유)', count: 45 },
    { category: '자유게시판', title: '요즘 주변에 카메라 입문하는 사람 많아졌네요', count: 40 },
  ];
  const LATEST_POSTS = [
    { category: '정치게시판', title: 'X의글, 감옥 아방궁' },
    { category: '자유게시판', title: '알리 만원짜리 와이파이 CCTV 주문' },
    { category: '소니갤러리', title: 'ZV-E1 + 35.4GM 점수용' },
    { category: '니콘포럼', title: '니콘 24-70/4S 시리얼번호' },
    { category: '해외직구', title: 'ETENWOLF S1 휴대용 타이어 공기 주입기 160PSI 자동차 타이어 자전거 오토바이' },
  ];
  const MARKET_POSTS = [
    { category: '기타', title: '자동차 햇빛가리개 앞유리 썬가드 (7,900원/무료)', count: 1 },
    { category: '패션/잡화', title: '[지마켓]에어홀 쿨스카프 4개+쿨토시 8개 세트 (12,670원/무배)', count: 1 },
    { category: '식품', title: '[지마켓_슈퍼딜] 행복한명태가 취향대로 골라먹는 명태강정(5,300/유배)', count: 1 },
    { category: '식품', title: '[지마켓]K2 히말라야 숙취해소제 젤리형 10개입(6,900원/무배)', count: 1 },
    { category: '식품', title: '[옥션]1++ 투뿔 한우 골라담기(18,610원~/무배)', count: 1 },
  ];

  const HEADER_H = 48;
  const NAV_H    = 80;

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#f0f0f0',
      fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif', position: 'relative',
    }}>

      <header style={{
        position: 'sticky', top: 0, zIndex: 100, height: HEADER_H,
        background: '#1a76c8', display: 'flex', alignItems: 'center', padding: '0 14px',
      }}>
        <div style={{ flex: 1 }} />
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontWeight: 900, fontSize: 26, fontStyle: 'italic',
          color: '#fff', letterSpacing: -1, lineHeight: 1,
        }}>SLR</div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setChatTheme('naver')}
            style={{ background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)' }}
            title="네이버 스타일로 전환"
          >N테마</button>
          {user?.username ? (
            <button onClick={handleLogout}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >LOGOUT</button>
          ) : (
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>LOGIN</span>
          )}
        </div>
      </header>

      <nav style={{
        position: 'sticky', top: HEADER_H, zIndex: 99,
        background: '#fff', borderBottom: '1px solid #e0e0e0',
      }}>
        <div style={{ display: 'flex' }}>
          {([
            { icon: <IconCommunity />, label: '커뮤니티', home: true },
            { icon: <IconForum />,     label: '포럼', home: true },
            { icon: <IconGallery />,   label: '갤러리', gallery: true },
            { icon: <IconCalendar />,  label: '일정', view: 'schedule' as const },
            { icon: <IconBoard />,     label: '게시판', view: 'posts' as const },
          ] as { icon: React.ReactNode; label: string; home?: boolean; gallery?: boolean; view?: 'schedule' | 'posts' }[]).map(({ icon, label, home, gallery, view }) => (
            <button key={label}
              onClick={
                gallery ? handleGalleryClick
                : home ? () => { setSelectedRoom(null); setShowChatList(false); setActiveView(''); }
                : view ? () => { setSelectedRoom(null); setShowChatList(false); setActiveView(view); }
                : undefined
              }
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 0 8px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 10.5,
                color: (activeView === view && view) ? '#1a76c8' : '#444', gap: 4,
              }}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div ref={scrollRef} style={{ overflowY: 'auto' }}>
        {selectedRoom ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - ${HEADER_H + NAV_H}px)` }}>
            <div style={{
              background: '#fff', borderBottom: '1px solid #e0e0e0',
              padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <button onClick={() => setSelectedRoom(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a76c8', fontSize: 14, fontWeight: 700, padding: '2px 8px 2px 0', flexShrink: 0 }}
              >
                ← 목록
              </button>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRoom.name}</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChatWindow
                roomId={selectedRoom.id}
                onLeave={() => setSelectedRoom(null)}
                onImageView={(url, imageList, options) => {
                  const idx = imageList.findIndex((item) => item.url === url);
                  setViewingImageItems(imageList);
                  setViewingImageIdx(idx >= 0 ? idx : 0);
                  setImageZoom(1);
                  setImagePan({ x: 0, y: 0 });
                  setShowImageGrid(Boolean(options?.showGrid));
                }}
              />
            </div>
          </div>
        ) : showChatList ? (
          <div style={{ position: 'relative', minHeight: '100%' }}>
            <div style={{
              background: '#fff', borderBottom: '1px solid #e0e0e0',
              padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => setShowChatList(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a76c8', fontSize: 14, fontWeight: 700, padding: '2px 8px 2px 0' }}
              >
                ← 게시판
              </button>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>채팅 목록</span>
            </div>
            {rooms.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#aaa', fontSize: 14 }}>참여 중인 방이 없습니다</div>
            ) : rooms.map((r) => {
              const unreadCount = r.unreadCount ?? 0;
              const showUnreadAlarm = unreadCount > 0 && !r.isMuted;
              return (
                <div key={r.id} onClick={() => openRoom(r)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '13px 16px',
                    borderBottom: '1px solid #f0f0f0', background: showUnreadAlarm ? '#f7fbff' : '#fff', cursor: 'pointer',
                    gap: 12,
                  }}
                  title={r.isMuted ? `${r.name} · 알림 꺼짐` : r.name}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 22,
                      background: r.isArchive ? '#a8edca' : '#1a76c8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: r.isArchive ? '#1a1a1a' : '#fff',
                      fontSize: r.isArchive ? 22 : 16, fontWeight: 700,
                    }}>
                      {r.isArchive ? '📦' : r.name.charAt(0)}
                    </div>
                    {showUnreadAlarm && (
                      <span style={{
                        position: 'absolute', top: -3, right: -5, minWidth: 18, height: 18, borderRadius: 9,
                        background: '#ff3b30', color: '#fff', fontSize: 10, fontWeight: 800,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                        boxShadow: '0 0 0 2px #fff',
                      }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                    {r.isMuted && (
                      <span style={{
                        position: 'absolute', right: -4, bottom: -3, width: 20, height: 20, borderRadius: 10,
                        background: '#fff', color: '#777', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 1px #e5e5e5',
                      }} aria-label="알림 꺼짐">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="1" y1="1" x2="23" y2="23"/>
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: showUnreadAlarm ? 800 : 700, fontSize: 14, color: '#111', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: showUnreadAlarm ? '#1a76c8' : '#999', fontWeight: showUnreadAlarm ? 700 : 400 }}>
                      {r.isMuted
                        ? `알림 꺼짐${unreadCount > 0 ? ` · 읽지 않은 메시지 ${unreadCount}개` : ''}`
                        : unreadCount > 0 ? `읽지 않은 메시지 ${unreadCount}개` : (r.isArchive ? '나의 보관함' : (r.isGroup ? `${r.members.length}명` : (r.messages?.[0]?.content ?? '')))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 채팅방 만들기 FAB */}
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                position: 'fixed',
                bottom: 100,
                right: '50%',
                transform: 'translateX(50%) translateX(195px)',
                width: 52, height: 52,
                borderRadius: 26,
                background: '#1a76c8',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                fontSize: 28,
                fontWeight: 300,
                zIndex: 50,
              }}
              title="새 채팅방 만들기"
            >
              +
            </button>
          </div>

        ) : activeView === 'schedule' ? (
          /* ───── 일정 뷰 ───── */
          <div style={{ background: '#f8f9fa', minHeight: '100%', paddingBottom: 80 }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setActiveView('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a76c8', fontSize: 14, fontWeight: 700, padding: '2px 8px 2px 0' }}>← 게시판</button>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111', flex: 1 }}>📅 일정</span>
              <button onClick={() => openScheduleForm()} style={{ background: '#1a76c8', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 등록</button>
            </div>
            {schedLoading ? (
              <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
            ) : schedules.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>등록된 일정이 없습니다</p>
            ) : schedules.map(sc => {
              const d = new Date(sc.scheduledAt);
              const dateStr = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
              const timeStr = sc.isAllDay ? '종일' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              const isPast = d < new Date();
              return (
                <div key={sc.id} style={{ background: '#fff', marginBottom: 1, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 42, flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: isPast ? '#bbb' : '#1a76c8', lineHeight: 1 }}>{d.getDate()}</div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{d.toLocaleDateString('ko-KR', { weekday: 'short' })}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isPast ? '#aaa' : '#111', marginBottom: 2, textDecoration: isPast ? 'line-through' : 'none' }}>{sc.title}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{dateStr} · {timeStr}</div>
                    {sc.description && <div style={{ fontSize: 12, color: '#555', marginTop: 4, whiteSpace: 'pre-wrap' }}>{sc.description}</div>}
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>등록: {sc.createdBy.username}</div>
                  </div>
                  {sc.createdById === user?.id && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => openScheduleForm(sc)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#555' }}>수정</button>
                      <button onClick={() => deleteSchedule(sc.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: '#e74c3c' }}>삭제</button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* 일정 등록/수정 모달 */}
            {schedFormOpen && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                onClick={() => setSchedFormOpen(false)}>
                <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#111' }}>{schedEditTarget ? '일정 수정' : '일정 등록'}</h3>
                  <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="일정 제목 *" maxLength={200}
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
                  <textarea value={schedDesc} onChange={e => setSchedDesc(e.target.value)} placeholder="설명 (선택)" rows={2}
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                      style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14 }} />
                    {!schedAllDay && (
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                        style={{ width: 100, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14 }} />
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#555', cursor: 'pointer' }}>
                    <input type="checkbox" checked={schedAllDay} onChange={e => setSchedAllDay(e.target.checked)} />
                    종일
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setSchedFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #ddd', background: '#f8f8f8', fontSize: 14, cursor: 'pointer' }}>취소</button>
                    <button onClick={submitSchedule} disabled={!schedTitle.trim() || !schedDate}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#1a76c8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!schedTitle.trim() || !schedDate) ? 0.5 : 1 }}>저장</button>
                  </div>
                </div>
              </div>
            )}
          </div>

        ) : activeView === 'posts' ? (
          /* ───── 게시글 뷰 ───── */
          <div style={{ background: '#f8f9fa', minHeight: '100%', paddingBottom: 80 }}>
            {postDetail ? (
              /* 게시글 상세 */
              <div style={{ background: '#fff', minHeight: '100%' }}>
                <div style={{ borderBottom: '1px solid #e0e0e0', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPostDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a76c8', fontSize: 14, fontWeight: 700, padding: '2px 8px 2px 0' }}>← 목록</button>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#111', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{postDetail.title}</span>
                  {postDetail.authorId === user?.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openPostForm(postDetail)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#555' }}>수정</button>
                      <button onClick={() => deletePost(postDetail.id)} style={{ background: 'none', border: '1px solid #f5c6c6', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#e74c3c' }}>삭제</button>
                    </div>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>
                    {postDetail.author.username} · {new Date(postDetail.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  {postDetail.sourceMessage && (
                    <div style={{ background: '#f0f7ff', borderLeft: '3px solid #1a76c8', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>💬 원본 메시지 · {postDetail.sourceMessage.sender?.username}</div>
                      <div style={{ fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>{postDetail.sourceMessage.content}</div>
                    </div>
                  )}
                  <p style={{ fontSize: 14.5, color: '#222', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{postDetail.content}</p>
                </div>
              </div>
            ) : (
              /* 게시글 목록 */
              <>
                <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setActiveView('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a76c8', fontSize: 14, fontWeight: 700, padding: '2px 8px 2px 0' }}>← 게시판</button>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#111', flex: 1 }}>📝 게시판</span>
                  <button onClick={() => openPostForm()} style={{ background: '#1a76c8', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ 글쓰기</button>
                </div>
                {postsLoading ? (
                  <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
                ) : posts.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 13 }}>게시글이 없습니다</p>
                ) : posts.map(p => (
                  <div key={p.id} onClick={() => setPostDetail(p)}
                    style={{ background: '#fff', marginBottom: 1, padding: '13px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {p.sourceMessageId && <span style={{ fontSize: 10, background: '#e8f4ff', color: '#1a76c8', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>채팅</span>}
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {p.author.username} · {new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </>
            )}
            {/* 게시글 작성/수정 모달 */}
            {postFormOpen && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                onClick={() => setPostFormOpen(false)}>
                <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 430 }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#111' }}>{postEditTarget ? '게시글 수정' : '게시글 작성'}</h3>
                  <input value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="제목 *" maxLength={200}
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
                  <textarea value={postContent} onChange={e => setPostContent(e.target.value)} placeholder="내용 *" rows={6}
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setPostFormOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #ddd', background: '#f8f8f8', fontSize: 14, cursor: 'pointer' }}>취소</button>
                    <button onClick={submitPost} disabled={!postTitle.trim() || !postContent.trim()}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#1a76c8', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!postTitle.trim() || !postContent.trim()) ? 0.5 : 1 }}>저장</button>
                  </div>
                </div>
              </div>
            )}
          </div>

        ) : (
          <>
            <div style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0', borderBottom: '1px solid #e8e8e8' }}>
              <div style={{ width: '92%', height: 72, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, color: '#bbb', fontSize: 13, letterSpacing: 1 }}>
                AD
              </div>
            </div>
            <div style={{ background: '#fff' }}>
              <SectionHeader title='인기글' />
              {HOT_POSTS.map((p, i) => (
                <PostRow key={i} category={p.category} title={p.title} count={p.count} />
              ))}
            </div>
            <SectionGap />
            <div style={{ background: '#fff' }}>
              <SectionHeader title='추천인기글' />
              {BEST_POSTS.map((p, i) => (
                <PostRow key={i} category={p.category} title={p.title} count={p.count} />
              ))}
            </div>
            <AdBlock />
            <SectionGap />
            <div style={{ background: '#fff' }}>
              <SectionHeader title='최신글' />
              {LATEST_POSTS.map((p, i) => (
                <PostRow key={i} category={p.category} title={p.title} />
              ))}
            </div>
            <SectionGap />
            <div style={{ background: '#fff' }}>
              <SectionHeader title='시장정보' />
              {MARKET_POSTS.map((p, i) => (
                <PostRow key={i} category={p.category} title={p.title} count={p.count} />
              ))}
            </div>
            <SectionGap />
          </>
        )}
      </div>

      {!selectedRoom && !showChatList && <ScrollToTopBtn containerRef={scrollRef} />}

      {/* 이미지 라이트박스 오버레이 — 어떤 상태에서도 렌더럁 되도록 최상단에 배치 */}
      {viewingImages.length > 0 && viewingImage && (
        <div
          onClick={() => setViewingImageItems([])}
          onKeyDown={(e) => {
            if (showImageGrid) {
              if (e.key === 'Escape') setShowImageGrid(false);
              return;
            }
            if (e.key === 'ArrowLeft') setViewingImageIdx((i) => Math.max(0, i - 1));
            else if (e.key === 'ArrowRight') setViewingImageIdx((i) => Math.min(viewingImages.length - 1, i + 1));
            else if (e.key === 'Escape') setViewingImageItems([]);
          }}
          onTouchStart={(e) => {
            if (showImageGrid) return;
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
            if (showImageGrid || !pinchStart.current || e.touches.length < 2) return;
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
              if (pinchMoved.current) {
                pinchMoved.current = false;
                touchStartX.current = null;
                return;
              }
            }
            if (imageZoom > 1 || showImageGrid) return;
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) < 40) return;
            if (dx < 0) setViewingImageIdx((i) => Math.min(viewingImages.length - 1, i + 1));
            else setViewingImageIdx((i) => Math.max(0, i - 1));
          }}
          onWheel={(e) => {
            if (showImageGrid) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.2 : -0.2;
            setImageZoom((z) => {
              const next = Math.min(4, Math.max(1, Number((z + delta).toFixed(2))));
              if (next === 1) setImagePan({ x: 0, y: 0 });
              return next;
            });
          }}
          tabIndex={0}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            outline: 'none', touchAction: showImageGrid ? 'auto' : 'none',
          }}
        >
          {showImageGrid ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', inset: '70px 10px 20px', overflowY: 'auto',
                padding: '2px 6px 20px',
              }}
            >
              {imageDateGroups.map((group) => (
                <section key={group.label} style={{ marginBottom: 22 }}>
                  <div style={{
                    position: 'sticky', top: 0, zIndex: 1,
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 2px 10px', background: '#000',
                  }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{group.label}</span>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{group.items.length}장</span>
                    <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.16)' }} />
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 12, alignContent: 'start',
                  }}>
                    {group.items.map((item) => (
                      <button
                        key={`${item.url}-${item.index}`}
                        type="button"
                        onClick={() => { setViewingImageIdx(item.index); setShowImageGrid(false); }}
                        style={{
                          aspectRatio: '1 / 1', borderRadius: 12, padding: 0, overflow: 'hidden',
                          border: item.index === viewingImageIdx ? '3px solid #fff' : '1px solid rgba(255,255,255,0.22)',
                          background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative',
                          boxShadow: '0 4px 14px rgba(0,0,0,0.24)',
                        }}
                        title={`${item.index + 1}번째 이미지`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="이미지 썸네일" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <span style={{
                          position: 'absolute', right: 6, bottom: 6, minWidth: 20, height: 20, borderRadius: 10,
                          background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                        }}>{item.index + 1}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={viewingImage}
              alt="이미지"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setImageZoom((z) => z > 1 ? 1 : 2);
                setImagePan({ x: 0, y: 0 });
              }}
              onPointerDown={(e) => {
                if (imageZoom <= 1) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                imageDragStart.current = { x: e.clientX, y: e.clientY, panX: imagePan.x, panY: imagePan.y };
              }}
              onPointerMove={(e) => {
                if (!imageDragStart.current) return;
                e.stopPropagation();
                const start = imageDragStart.current;
                setImagePan({ x: start.panX + e.clientX - start.x, y: start.panY + e.clientY - start.y });
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                imageDragStart.current = null;
              }}
              onPointerCancel={() => { imageDragStart.current = null; }}
              style={{
                maxWidth: '95vw', maxHeight: '78vh', borderRadius: 8, objectFit: 'contain', userSelect: 'none',
                cursor: imageZoom > 1 ? 'grab' : 'zoom-in', touchAction: imageZoom > 1 ? 'none' : 'pan-y',
                transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                transition: imageDragStart.current ? 'none' : 'transform 120ms ease',
              }}
            />
          )}

          {/* 닫기 버튼 */}
          <button
            onClick={(e) => { e.stopPropagation(); setViewingImageItems([]); }}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>

          {/* 보기/확대 도구 */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 16, left: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setShowImageGrid((v) => !v)}
              style={{
                background: showImageGrid ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.28)', borderRadius: 18,
                color: showImageGrid ? '#111' : '#fff', height: 36, padding: '0 12px',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}
            >▦ 사진목록</button>
            {!showImageGrid && (
              <>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => {
                    const next = Math.max(1, Number((z - 0.25).toFixed(2)));
                    if (next === 1) setImagePan({ x: 0, y: 0 });
                    return next;
                  })}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer' }}
                >−</button>
                <span style={{ minWidth: 44, textAlign: 'center', color: '#fff', fontSize: 12 }}>{Math.round(imageZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer' }}
                >＋</button>
                <button
                  type="button"
                  onClick={() => { setImageZoom(1); setImagePan({ x: 0, y: 0 }); }}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 18, height: 36, padding: '0 10px', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                >초기화</button>
              </>
            )}
          </div>

          {/* 이전 버튼 */}
          {!showImageGrid && viewingImageIdx > 0 && (
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

          {/* 다음 버튼 */}
          {!showImageGrid && viewingImageIdx < viewingImages.length - 1 && (
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

          {/* 카운터 + 저장 */}
          {!showImageGrid && <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            {viewingImages.length > 1 && (
              <span style={{
                background: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: '4px 12px',
                color: '#fff', fontSize: 13,
              }}>
                {viewingImageIdx + 1} / {viewingImages.length}
              </span>
            )}
            <a
              href={viewingImage}
              download
              style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 20, padding: '8px 20px',
                color: '#fff', fontSize: 13, textDecoration: 'none',
              }}
            >⬇ 저장</a>
          </div>}
        </div>
      )}

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(room) => {
            setRooms([room, ...rooms]);
            setShowCreateModal(false);
            setSelectedRoom(room);
          }}
        />
      )}
    </div>
  );
}