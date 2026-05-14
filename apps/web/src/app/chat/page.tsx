'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';
import JSZip from 'jszip';

/* ── 타입 ─────────────────────────────────────────────────── */
type PptSlide = { kind: 'ppt'; id: string; index: number; title: string; texts: string[]; thumb?: string };
type ChatSlide = { kind: 'chat'; room: Room };
type SlideItem = PptSlide | ChatSlide;

const MOCK_PRESENTATION = [
  {
    title: '프로젝트 개요',
    bullets: ['채팅 + 프레젠테이션 결합 UX', '데스크톱과 웹 동시 지원', '실시간 협업 중심 시나리오'],
  },
  {
    title: '핵심 목표',
    bullets: ['빠른 커뮤니케이션', '문서 공유 흐름 단순화', '발표 중 채팅 맥락 유지'],
  },
  {
    title: '사용자 시나리오',
    bullets: ['회의 중 슬라이드 공유', '슬라이드 단위 의견 수집', '핵심 질문 즉시 피드백'],
  },
  {
    title: '화면 구성',
    bullets: ['왼쪽: 슬라이드 목록', '가운데: 메인 슬라이드', '채팅방과 PPT를 동일 내비게이션으로 통합'],
  },
  {
    title: '기능 1 - 파일 불러오기',
    bullets: ['PPTX 선택', '텍스트 기반 슬라이드 파싱', '슬라이드 목록 자동 생성'],
  },
  {
    title: '기능 2 - 원본 열기',
    bullets: ['데스크톱 환경에서 기본 앱 호출', 'PowerPoint 원본 렌더 확인', '내부 뷰와 병행 사용'],
  },
  {
    title: '기능 3 - 실시간 채팅',
    bullets: ['방 단위 메시지', '읽음 상태 동기화', '슬라이드와 채팅 간 빠른 전환'],
  },
  {
    title: '운영/배포',
    bullets: ['웹: Next.js 배포', '서버: Fastify + Prisma', '데스크톱: Electron 패키징'],
  },
  {
    title: '기대 효과',
    bullets: ['발표 효율 향상', '의사결정 시간 단축', '회의 기록 정확도 향상'],
  },
  {
    title: '다음 단계',
    bullets: ['슬라이드 이미지 렌더 옵션 추가', '발표자 모드 도입', '주석/하이라이트 기능 확장'],
  },
] as const;

/* ── PPT 파서 ─────────────────────────────────────────────── */
async function parsePptx(file: File): Promise<PptSlide[]> {
  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0]);
      const nb = parseInt(b.match(/\d+/)![0]);
      return na - nb;
    });

  const slides: PptSlide[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const texts = Array.from(doc.getElementsByTagNameNS('*', 't'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
    const title = texts[0] ?? `슬라이드 ${i + 1}`;
    slides.push({ kind: 'ppt', id: `ppt-${i}`, index: i, title, texts });
  }
  return slides;
}

function buildMockSlides(): PptSlide[] {
  return MOCK_PRESENTATION.map((item, i) => ({
    kind: 'ppt',
    id: `mock-ppt-${i}`,
    index: i,
    title: item.title,
    texts: [item.title, ...item.bullets],
  }));
}

/* ── 슬라이드 썸네일 ─────────────────────────────────────── */
function SlideThumbnail({
  item, isActive, onClick, index, isMobile,
}: { item: SlideItem; isActive: boolean; onClick: () => void; index: number; isMobile: boolean }) {
  const bg = isActive ? '#2d5fa6' : '#3a3f4a';
  const border = isActive ? '2px solid #5b9bd5' : '2px solid transparent';

  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        border,
        borderRadius: 4,
        marginBottom: isMobile ? 0 : 6,
        marginRight: isMobile ? 6 : 0,
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        gap: 0,
        alignItems: 'stretch',
        width: isMobile ? 122 : '100%',
        minWidth: isMobile ? 122 : undefined,
        textAlign: 'left',
      }}
    >
      {/* 번호 */}
      <span style={{ width: 24, minWidth: 24, fontSize: 10, color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 }}>
        {index + 1}
      </span>
      {/* 썸네일 */}
      <div style={{ flex: 1, aspectRatio: '4/3', background: item.kind === 'chat' ? '#1a1b1e' : '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative', padding: 4 }}>
        {item.kind === 'chat' ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={{ fontSize: 9, color: '#fff', marginTop: 2, textAlign: 'center', wordBreak: 'break-all', padding: '0 2px' }}>{item.room.name}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 8, color: '#333', fontWeight: 'bold', textAlign: 'center', width: '100%', padding: '0 4px', lineHeight: 1.2 }}>{item.title}</span>
            {item.texts.slice(1, 3).map((t, i) => (
              <span key={i} style={{ fontSize: 7, color: '#666', textAlign: 'center', width: '100%', padding: '0 4px' }}>{t}</span>
            ))}
          </>
        )}
      </div>
    </button>
  );
}

/* ── PPT 슬라이드 뷰 ──────────────────────────────────────── */
function PptSlideContent({ slide }: { slide: PptSlide }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 60, boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 36, fontWeight: 'bold', color: '#1f3864', textAlign: 'center', marginBottom: 24, borderBottom: '3px solid #5b9bd5', paddingBottom: 16, width: '100%' }}>
        {slide.title}
      </h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        {slide.texts.slice(1).map((t, i) => (
          <p key={i} style={{ fontSize: 20, color: '#333', lineHeight: 1.6 }}>• {t}</p>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 12, color: '#999' }}>
        {slide.index + 1}
      </div>
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

  const [pptSlides, setPptSlides] = useState<PptSlide[]>([]);
  const [pptFileName, setPptFileName] = useState('');
  const [pptFilePath, setPptFilePath] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const apply = (matches: boolean) => setIsMobile(matches);

    apply(media.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  useEffect(() => {
    if (accessToken) {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
    }
  }, [accessToken, setRooms]);

  // 창 포커스 시 첫 슬라이드로 이동
  useEffect(() => {
    function onFocus() {
      setActiveId(null);
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const slides: SlideItem[] = [
    ...rooms.map<ChatSlide>((r) => ({ kind: 'chat', room: r })),
    ...pptSlides,
  ];

  const activeSlide = slides.find((s) =>
    s.kind === 'chat' ? String(s.room.id) === activeId : s.id === activeId
  ) ?? null;

  const activeRoomId = activeSlide?.kind === 'chat' ? activeSlide.room.id : null;

  function getSlideId(s: SlideItem) {
    return s.kind === 'chat' ? String(s.room.id) : s.id;
  }

  async function handleFileOpen() {
    try {
      // Electron 앱: Node.js fs로 직접 읽기 (DLP 우회)
      const electronAPI = (window as unknown as {
        electronAPI?: {
          isElectron?: boolean;
          openPptxFile?: () => Promise<{ name: string; filePath?: string; buffer: ArrayBuffer } | null>;
          openFileInDefaultApp?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
        };
      }).electronAPI;
      if (electronAPI?.isElectron && electronAPI.openPptxFile) {
        const result = await electronAPI.openPptxFile();
        if (!result) return;
        const file = new File([result.buffer], result.name);
        const parsed = await parsePptx(file);
        setPptSlides(parsed);
        setPptFileName(result.name);
        setPptFilePath(result.filePath ?? '');
        if (parsed.length > 0) setActiveId(parsed[0].id);
        return;
      }

      // 웹 브라우저: File System Access API
      if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
        const [fileHandle] = await (window as unknown as { showOpenFilePicker: (opts: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          types: [{ description: 'PowerPoint 파일', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } }],
          multiple: false,
        });
        const file = await fileHandle.getFile();
        const parsed = await parsePptx(file);
        setPptSlides(parsed);
        setPptFileName(file.name);
        setPptFilePath('');
        if (parsed.length > 0) setActiveId(parsed[0].id);
      } else {
        alert('이 기능은 데스크탑 앱에서 사용하거나, Chrome/Edge 브라우저를 이용해주세요.');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        alert('PPT 파일을 읽는 중 오류가 발생했습니다.');
      }
    }
  }

  async function handleOpenOriginalPpt() {
    const electronAPI = (window as unknown as {
      electronAPI?: {
        isElectron?: boolean;
        openFileInDefaultApp?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      };
    }).electronAPI;

    if (!electronAPI?.isElectron || !electronAPI.openFileInDefaultApp) {
      alert('원본 파일 열기는 데스크톱 앱에서만 지원됩니다.');
      return;
    }

    if (!pptFilePath) {
      alert('먼저 PPT 파일을 불러와 주세요.');
      return;
    }

    const result = await electronAPI.openFileInDefaultApp(pptFilePath);
    if (!result.ok) {
      alert(`원본 PPT를 여는 중 오류가 발생했습니다.\n${result.error ?? ''}`);
    }
  }

  function handleCreateMockPpt() {
    const mockSlides = buildMockSlides();
    setPptSlides(mockSlides);
    setPptFileName('샘플_프레젠테이션_10장.pptx');
    setPptFilePath('');
    setActiveId(mockSlides[0]?.id ?? null);
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCreated(room: Room) {
    setRooms([room, ...rooms]);
    setActiveId(String(room.id));
  }

  function handleLogout() {
    clear();
    router.replace('/login');
  }

  if (!accessToken) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0', fontFamily: 'Segoe UI, sans-serif', overflow: 'hidden' }}>

      {/* ── 리본 툴바 ────────────────────────────────────── */}
      <header style={{ background: '#c43e1c', display: 'flex', alignItems: 'center', gap: 0, minHeight: 44, height: isMobile ? 'auto' : 44, flexShrink: 0, userSelect: 'none', flexWrap: isMobile ? 'wrap' : 'nowrap', paddingBottom: isMobile ? 6 : 0 }}>
        {/* 로고 */}
        <div style={{ width: 46, height: 44, background: '#c43e1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        {/* 탭 */}
        {!isMobile && ['파일', '홈', '삽입', '보기'].map((tab) => (
          <button key={tab} style={{ height: 44, padding: '0 14px', color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >{tab}</button>
        ))}
        <div style={{ flex: 1, minWidth: isMobile ? '100%' : undefined }} />
        {/* 파일 열기 버튼 */}
        <button
          onClick={handleFileOpen}
          title="PPT 파일 열기"
          style={{ height: isMobile ? 34 : 44, padding: isMobile ? '0 10px' : '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 6, marginLeft: isMobile ? 8 : 0, borderRadius: isMobile ? 6 : 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          파일 열기
        </button>
        <button
          onClick={handleCreateMockPpt}
          title="가상 PPT 10장 생성"
          style={{ height: isMobile ? 34 : 44, padding: isMobile ? '0 10px' : '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 6, borderRadius: isMobile ? 6 : 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v12H4z"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>
          가상 10장
        </button>
        <button
          onClick={handleOpenOriginalPpt}
          title="원본 PPT 열기"
          style={{ height: isMobile ? 34 : 44, padding: isMobile ? '0 10px' : '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: pptFilePath ? 'pointer' : 'not-allowed', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 6, opacity: pptFilePath ? 1 : 0.6, borderRadius: isMobile ? 6 : 0 }}
          onMouseEnter={(e) => {
            if (pptFilePath) e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          disabled={!pptFilePath}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v7h-7"/><path d="M3 10V3h7"/><path d="M3 3l7 7"/></svg>
          원본 열기
        </button>
        {/* 새 채팅방 버튼 */}
        <button
          onClick={() => setShowModal(true)}
          title="새 채팅방"
          style={{ height: isMobile ? 34 : 44, padding: isMobile ? '0 10px' : '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 6, borderRadius: isMobile ? 6 : 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          채팅방
        </button>
        {/* 사용자 */}
        <div style={{ height: isMobile ? 34 : 44, padding: isMobile ? '0 8px' : '0 14px', display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: isMobile ? 11 : 12 }}>
          {!isMobile && <span>{user?.username}</span>}
          <button onClick={handleLogout} style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>로그아웃</button>
        </div>
      </header>

      {/* ── 제목 표시줄 (PPT 파일명) ─────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #d4d4d4', height: isMobile ? 24 : 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 11 : 13, color: '#333', flexShrink: 0, padding: isMobile ? '0 8px' : 0 }}>
        {pptFileName || '채팅 - 프레젠테이션 모드'}
      </div>

      {/* ── 본문 ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#f0f0f0', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* 슬라이드 패널 (왼쪽) */}
        <div ref={listRef} style={{ width: isMobile ? '100%' : 160, minWidth: isMobile ? 0 : 160, height: isMobile ? 112 : 'auto', background: '#2d2d2d', overflowY: isMobile ? 'hidden' : 'auto', overflowX: isMobile ? 'auto' : 'hidden', padding: '8px 6px', display: 'flex', flexDirection: isMobile ? 'row' : 'column' }}>
          {slides.length === 0 ? (
            <p style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 20 }}>채팅방을 만들거나<br/>PPT 파일/가상 10장을 여세요</p>
          ) : (
            slides.map((item, i) => (
              <SlideThumbnail
                key={getSlideId(item)}
                item={item}
                index={i}
                isMobile={isMobile}
                isActive={getSlideId(item) === activeId}
                onClick={() => setActiveId(getSlideId(item))}
              />
            ))
          )}
        </div>

        {/* ── 세로 구분선 ─────────────────────────────────── */}
        {!isMobile && <div style={{ width: 1, background: '#ccc', flexShrink: 0 }} />}

        {/* 메인 슬라이드 영역 (가운데) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#525659', overflow: 'hidden' }}>
          {activeRoomId ? (
            /* 채팅 슬라이드 */
            <div style={{ flex: 1, margin: isMobile ? 8 : 20, background: '#1e1f22', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatWindow roomId={activeRoomId} />
            </div>
          ) : activeSlide?.kind === 'ppt' ? (
            /* PPT 슬라이드 */
            <div style={{ flex: 1, margin: isMobile ? 8 : 20, background: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative' }}>
              <PptSlideContent slide={activeSlide} />
            </div>
          ) : (
            /* 아무것도 선택 안 됨 */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#aaa' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              <p style={{ fontSize: 16 }}>슬라이드를 선택하세요</p>
              <p style={{ fontSize: 12, color: '#666' }}>왼쪽 패널에서 채팅방 또는 PPT 슬라이드를 클릭하세요</p>
            </div>
          )}
        </div>

        {/* ── 노트 패널 (하단 작은 영역) ─────────────────── */}
      </div>

      {/* ── 상태 표시줄 ──────────────────────────────────── */}
      <footer style={{ minHeight: isMobile ? 34 : 22, background: '#c43e1c', display: 'flex', alignItems: 'center', padding: isMobile ? '6px 10px' : '0 0 0 12px', fontSize: isMobile ? 10 : 11, color: 'rgba(255,255,255,0.85)', flexShrink: 0, gap: isMobile ? 8 : 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <span>슬라이드 {activeId ? slides.findIndex((s) => getSlideId(s) === activeId) + 1 : 0} / {slides.length}</span>
        {pptFileName && <span>📄 {pptFileName}</span>}
        <div style={{ flex: 1 }} />
        <span>채팅 프레젠테이션</span>
      </footer>

      {/* 채팅방 생성 모달 */}
      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}
