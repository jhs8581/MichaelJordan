'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';

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

export default function ChatPage() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showChatList, setShowChatList] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryClickCount = useRef(0);
  const galleryClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  // 브라우저 뒤로가기 인터셉트: 채팅창 → 목록 → 게시판 순으로 단계 이동
  useEffect(() => {
    function handlePopState() {
      if (selectedRoom) {
        setSelectedRoom(null);
        history.pushState(null, '', window.location.href);
      } else if (showChatList) {
        setShowChatList(false);
        history.pushState(null, '', window.location.href);
      }
    }
    // 현재 상태를 히스토리에 추가해서 뒤로가기를 가로챌 수 있게 함
    history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedRoom, showChatList]);

  useEffect(() => {
    if (accessToken) {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
    }
  }, [accessToken, setRooms]);

  function handleLogout() {
    clear();
    router.replace('/login');
  }

  if (!accessToken) return null;

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
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
            { icon: <IconInfo />,      label: '인포메이션', home: true },
            { icon: <IconCart />,      label: '마켓', home: true },
          ] as { icon: React.ReactNode; label: string; home?: boolean; gallery?: boolean }[]).map(({ icon, label, home, gallery }) => (
            <button key={label}
              onClick={
                gallery ? handleGalleryClick
                : home ? () => { setSelectedRoom(null); setShowChatList(false); }
                : undefined
              }
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 0 8px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 10.5,
                color: (showChatList && gallery) ? '#1a76c8' : '#444', gap: 4,
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
              <ChatWindow roomId={selectedRoom.id} />
            </div>
          </div>
        ) : showChatList ? (
          <div>
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
            ) : rooms.map((r) => (
              <div key={r.id} onClick={() => setSelectedRoom(r)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '13px 16px',
                  borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer',
                  gap: 12,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 22, background: '#1a76c8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>
                  {r.name.charAt(0)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{r.isGroup ? `${r.members.length}명` : '1:1 대화'}</div>
                </div>
              </div>
            ))}
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
    </div>
  );
}