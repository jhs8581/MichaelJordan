'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

/* ── 슬라이드 썸네일 ─────────────────────────────────────── */
function SlideThumbnail({
  item, isActive, onClick, index,
}: { item: SlideItem; isActive: boolean; onClick: () => void; index: number }) {
  const bg = isActive ? '#2d5fa6' : '#3a3f4a';
  const border = isActive ? '2px solid #5b9bd5' : '2px solid transparent';

  return (
    <button
      onClick={onClick}
      style={{ background: bg, border, borderRadius: 4, marginBottom: 6, padding: 0, cursor: 'pointer', display: 'flex', gap: 0, alignItems: 'stretch', width: '100%', textAlign: 'left' }}
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
      const electronAPI = (window as unknown as { electronAPI?: { isElectron?: boolean; openPptxFile?: () => Promise<{ name: string; buffer: ArrayBuffer } | null> } }).electronAPI;
      if (electronAPI?.isElectron && electronAPI.openPptxFile) {
        const result = await electronAPI.openPptxFile();
        if (!result) return;
        const file = new File([result.buffer], result.name);
        const parsed = await parsePptx(file);
        setPptSlides(parsed);
        setPptFileName(result.name);
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
      <header style={{ background: '#c43e1c', display: 'flex', alignItems: 'center', gap: 0, height: 44, flexShrink: 0, userSelect: 'none' }}>
        {/* 로고 */}
        <div style={{ width: 46, height: 44, background: '#c43e1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        {/* 탭 */}
        {['파일', '홈', '삽입', '보기'].map((tab) => (
          <button key={tab} style={{ height: 44, padding: '0 14px', color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >{tab}</button>
        ))}
        <div style={{ flex: 1 }} />
        {/* 파일 열기 버튼 */}
        <button
          onClick={handleFileOpen}
          title="PPT 파일 열기"
          style={{ height: 44, padding: '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          파일 열기
        </button>
        {/* 새 채팅방 버튼 */}
        <button
          onClick={() => setShowModal(true)}
          title="새 채팅방"
          style={{ height: 44, padding: '0 16px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          채팅방
        </button>
        {/* 사용자 */}
        <div style={{ height: 44, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 12 }}>
          <span>{user?.username}</span>
          <button onClick={handleLogout} style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>로그아웃</button>
        </div>
      </header>

      {/* ── 제목 표시줄 (PPT 파일명) ─────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #d4d4d4', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#333', flexShrink: 0 }}>
        {pptFileName || '채팅 - 프레젠테이션 모드'}
      </div>

      {/* ── 본문 ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#f0f0f0' }}>

        {/* 슬라이드 패널 (왼쪽) */}
        <div ref={listRef} style={{ width: 160, minWidth: 160, background: '#2d2d2d', overflowY: 'auto', padding: '8px 6px', display: 'flex', flexDirection: 'column' }}>
          {slides.length === 0 ? (
            <p style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 20 }}>채팅방을 만들거나<br/>PPT 파일을 여세요</p>
          ) : (
            slides.map((item, i) => (
              <SlideThumbnail
                key={getSlideId(item)}
                item={item}
                index={i}
                isActive={getSlideId(item) === activeId}
                onClick={() => setActiveId(getSlideId(item))}
              />
            ))
          )}
        </div>

        {/* ── 세로 구분선 ─────────────────────────────────── */}
        <div style={{ width: 1, background: '#ccc', flexShrink: 0 }} />

        {/* 메인 슬라이드 영역 (가운데) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#525659', overflow: 'hidden' }}>
          {activeRoomId ? (
            /* 채팅 슬라이드 */
            <div style={{ flex: 1, margin: 20, background: '#1e1f22', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatWindow roomId={activeRoomId} />
            </div>
          ) : activeSlide?.kind === 'ppt' ? (
            /* PPT 슬라이드 */
            <div style={{ flex: 1, margin: 20, background: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative' }}>
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
      <footer style={{ height: 22, background: '#c43e1c', display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 11, color: 'rgba(255,255,255,0.85)', flexShrink: 0, gap: 16 }}>
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
