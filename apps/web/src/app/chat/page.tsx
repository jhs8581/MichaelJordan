'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { api } from '@/lib/api';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CreateRoomModal } from '@/components/chat/RoomList';
import type { Room } from '@chat/types';

/* ?????????????????????????????????????????????????????????
   ?꾩씠肄?SVG 紐⑥쓬
????????????????????????????????????????????????????????? */
function IconCommunity() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconForum() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconGallery() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="9" y1="9" x2="15" y2="9"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="12" y2="17"/>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}

/* ?????????????????????????????????????????????????????????
   寃뚯떆湲 1??
????????????????????????????????????????????????????????? */
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
        gap: 0,
      }}
    >
      <span style={{
        fontSize: 13.5,
        color: '#333',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}>
        <span style={{ color: '#555' }}>[{category}]</span>
        {' '}{title}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          marginLeft: 8,
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          background: '#f0f0f0',
          color: '#666',
          fontSize: 11,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 5px',
          flexShrink: 0,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

/* ?????????????????????????????????????????????????????????
   ?뱀뀡 ?ㅻ뜑 (?멸린湲, 異붿쿇?멸린湲 ??
????????????????????????????????????????????????????????? */
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      padding: '11px 14px 9px',
      background: '#fff',
      borderBottom: '1px solid #ddd',
      fontSize: 15,
      fontWeight: 700,
      color: '#111',
    }}>
      {title}
    </div>
  );
}

/* ?????????????????????????????????????????????????????????
   ?뱀뀡 媛??щ갚 援щ텇
????????????????????????????????????????????????????????? */
function SectionGap() {
  return <div style={{ height: 10, background: '#f0f0f0' }} />;
}

/* ?????????????????????????????????????????????????????????
   愿묎퀬 釉붾줉 (?뚯썙留곹겕)
????????????????????????????????????????????????????????? */
function AdBlock() {
  return (
    <div style={{ background: '#fff', padding: '10px 14px 12px', borderBottom: '1px solid #efefef' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>?뚯썙留곹겕</span>
        <span style={{ fontSize: 10, color: '#888', border: '1px solid #ccc', padding: '0 3px', borderRadius: 2 }}>愿묎퀬</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>愿묎퀬?좎껌</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b', marginBottom: 2 }}>
        梨꾪똿諛⑹쓣 留뚮뱾????뷀빐蹂댁꽭??
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 3 }}>chat.example.com</div>
      <div style={{ fontSize: 12, color: '#555' }}>
        ?ㅼ떆媛?梨꾪똿?쇰줈 鍮좊Ⅴ寃??뚰넻?섏꽭??
      </div>
    </div>
  );
}

/* ?????????????????????????????????????????????????????????
   留⑥쐞濡?踰꾪듉
????????????????????????????????????????????????????????? */
function ScrollToTopBtn({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        bottom: 22,
        right: 16,
        background: '#555',
        color: '#fff',
        fontSize: 12,
        padding: '7px 14px',
        borderRadius: 20,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        userSelect: 'none',
        zIndex: 200,
      }}
    >
      ??留⑥쐞濡?
    </div>
  );
}

/* ?????????????????????????????????????????????????????????
   硫붿씤 ?섏씠吏
????????????????????????????????????????????????????????? */
export default function ChatPage() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const rooms = useChatStore((s) => s.rooms);
  const setRooms = useChatStore((s) => s.setRooms);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showModal, setShowModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  useEffect(() => {
    if (accessToken) {
      api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
    }
  }, [accessToken, setRooms]);

  function handleCreated(room: Room) {
    setRooms([room, ...rooms]);
    setSelectedRoom(room);
  }

  function handleLogout() {
    clear();
    router.replace('/login');
  }

  if (!accessToken) return null;

  /* ?? ?뱀뀡 ?곗씠???? */
  const groupRooms = rooms.filter((r) => r.isGroup);
  const dmRooms    = rooms.filter((r) => !r.isGroup);

  const popular = [...groupRooms]
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 5);

  const recommended = [...rooms]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const latestByMsg = [...rooms].sort((a, b) => {
    const aT = a.messages?.[a.messages.length - 1]?.createdAt ?? a.createdAt;
    const bT = b.messages?.[b.messages.length - 1]?.createdAt ?? b.createdAt;
    return new Date(bT).getTime() - new Date(aT).getTime();
  }).slice(0, 8);

  /* ?? category ?쇰꺼 ?? */
  function cat(r: Room) { return r.isGroup ? '洹몃９梨꾪똿' : '1:1'; }

  /* ?? ?ㅻ뜑 ?믪씠 ?? */
  const HEADER_H = 48;
  const NAV_H    = 90;

  return (
    <div style={{
      maxWidth: 430,
      margin: '0 auto',
      minHeight: '100vh',
      background: '#f0f0f0',
      fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif',
      position: 'relative',
    }}>

      {/* ?먥븧 ?ㅻ뜑 ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: HEADER_H,
        background: '#1a76c8',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
      }}>
        {/* ?쇱そ ?щ갚 */}
        <div style={{ flex: 1 }} />
        {/* 媛?대뜲 濡쒓퀬 */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontWeight: 900, fontSize: 26, fontStyle: 'italic',
          color: '#fff', letterSpacing: -1, lineHeight: 1,
        }}>
          SLR
        </div>
        {/* ?ㅻⅨ履? 濡쒓렇??濡쒓렇?꾩썐 */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {user?.username ? (
            <button
              onClick={handleLogout}
              style={{
                background: 'none', border: 'none',
                color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', letterSpacing: 0.5,
              }}
            >
              LOGOUT
            </button>
          ) : (
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>LOGIN</span>
          )}
        </div>
      </header>

      {/* ?먥븧 ?꾩씠肄??대퉬 ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */}
      <nav style={{
        position: 'sticky', top: HEADER_H, zIndex: 99,
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
      }}>
        {/* 1?? 4媛?*/}
        <div style={{ display: 'flex', borderBottom: '1px solid #f2f2f2' }}>
          {[
            { icon: <IconCommunity />, label: '而ㅻ??덊떚' },
            { icon: <IconForum />,     label: '?щ읆',     action: () => setShowModal(true) },
            { icon: <IconGallery />,   label: '媛ㅻ윭由? },
            { icon: <IconInfo />,      label: '?명룷硫붿씠?? },
          ].map(({ icon, label, action }) => (
            <button key={label} onClick={action}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 0 8px', background: 'none', border: 'none',
                cursor: action ? 'pointer' : 'default',
                fontSize: 10.5, color: '#444', gap: 4,
              }}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
        {/* 2?? 留덉폆 (?쇱そ ?뺣젹) */}
        <div style={{ display: 'flex' }}>
          <button
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '8px 0 7px', background: 'none', border: 'none',
              cursor: 'default', fontSize: 10.5, color: '#444', gap: 4,
              width: '25%',
            }}
          >
            <IconCart />
            <span>留덉폆</span>
          </button>
        </div>
      </nav>

      {/* ?먥븧 蹂몃Ц ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */}
      <div ref={scrollRef} style={{ overflowY: 'auto' }}>

        {selectedRoom ? (
          /* ?? 梨꾪똿李??? */
          <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - ${HEADER_H + NAV_H}px)` }}>
            <div style={{
              background: '#fff', borderBottom: '1px solid #e0e0e0',
              padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <button
                onClick={() => setSelectedRoom(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1a76c8', fontSize: 14, fontWeight: 700,
                  padding: '2px 8px 2px 0', display: 'flex', alignItems: 'center',
                }}
              >
                ??紐⑸줉
              </button>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{selectedRoom.name}</span>
              <span style={{ fontSize: 12, color: '#aaa', marginLeft: 2 }}>
                {selectedRoom.isGroup ? `${selectedRoom.members.length}紐? : 'DM'}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChatWindow roomId={selectedRoom.id} />
            </div>
          </div>
        ) : (
          /* ?? 寃뚯떆??紐⑸줉 ?? */
          <>
            {/* ?멸린湲 */}
            <div style={{ background: '#fff' }}>
              <SectionHeader title="?멸린湲" />
              {popular.length === 0
                ? <PostRow category="?덈궡" title="梨꾪똿諛⑹쓣 留뚮뱾?대낫?몄슂" />
                : popular.map((r) => (
                    <PostRow key={r.id} category={cat(r)} title={r.name}
                      count={r.members.length} onClick={() => setSelectedRoom(r)} />
                  ))
              }
            </div>

            <SectionGap />

            {/* 異붿쿇?멸린湲 */}
            <div style={{ background: '#fff' }}>
              <SectionHeader title="異붿쿇?멸린湲" />
              {recommended.length === 0
                ? <PostRow category="?덈궡" title="梨꾪똿諛⑹씠 ?놁뒿?덈떎" />
                : recommended.map((r) => (
                    <PostRow key={r.id} category={cat(r)} title={r.name}
                      count={r.members.length} onClick={() => setSelectedRoom(r)} />
                  ))
              }
            </div>

            {/* 愿묎퀬 */}
            <AdBlock />

            <SectionGap />

            {/* 理쒖떊湲 */}
            <div style={{ background: '#fff' }}>
              <SectionHeader title="理쒖떊湲" />
              {latestByMsg.length === 0
                ? <PostRow category="?덈궡" title="梨꾪똿諛⑹씠 ?놁뒿?덈떎" />
                : latestByMsg.map((r) => (
                    <PostRow key={r.id} category={cat(r)} title={r.name}
                      count={r.members.length} onClick={() => setSelectedRoom(r)} />
                  ))
              }
            </div>

            <SectionGap />

            {/* ?쒖옣?뺣낫 (DM) */}
            <div style={{ background: '#fff' }}>
              <SectionHeader title="?쒖옣?뺣낫" />
              {dmRooms.length === 0
                ? <PostRow category="?덈궡" title="1:1 梨꾪똿諛⑹씠 ?놁뒿?덈떎" />
                : dmRooms.map((r) => (
                    <PostRow key={r.id} category={cat(r)} title={r.name}
                      count={r.members.length} onClick={() => setSelectedRoom(r)} />
                  ))
              }
            </div>

            <SectionGap />
          </>
        )}
      </div>

      {/* 留⑥쐞濡?踰꾪듉 */}
      {!selectedRoom && <ScrollToTopBtn containerRef={scrollRef} />}

      {/* 梨꾪똿諛??앹꽦 紐⑤떖 */}
      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}
