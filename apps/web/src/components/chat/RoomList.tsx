'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import type { Room, User } from '@chat/types';
import { clsx } from 'clsx';

/* ── 아이콘 ─────────────────────────────────────── */
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const HashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
    <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
  </svg>
);
const DmIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const MutedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
  </svg>
);

/* ── 채팅방 생성 모달 ─────────────────────────────── */
export function CreateRoomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (room: Room) => void }) {
  const me = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: User[] }>('/users').then((res) => {
      setUsers(res.data.data.filter((u) => u.id !== me?.id));
    }).catch(() => {});
  }, [me?.id]);

  function toggleUser(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || selectedIds.length === 0) {
      setError('이름과 대화 상대를 선택해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ data: Room }>('/rooms', {
        name: name.trim(), isGroup, memberIds: selectedIds,
      });
      onCreated(res.data.data);
      onClose();
    } catch {
      setError('생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: '#2b2d31', color: 'var(--text-primary)' }}>
        <h2 className="mb-1 text-xl font-bold">새 대화</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>이름과 대화 상대를 선택하세요.</p>

        {error && <p className="mb-3 rounded-lg p-2 text-sm" style={{ background: '#ed4245', color: '#fff' }}>{error}</p>}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full rounded-md px-3 py-2.5 text-sm outline-none"
              style={{ background: '#1e1f22', color: 'var(--text-primary)', border: '1px solid #1e1f22' }}
            />
          </div>

          <div className="flex items-center gap-3">
            <div
              onClick={() => setIsGroup(!isGroup)}
              className="relative w-10 h-6 rounded-full cursor-pointer transition-colors"
              style={{ background: isGroup ? 'var(--accent)' : '#4e5058' }}
            >
              <div className={clsx('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', isGroup ? 'left-5' : 'left-1')} />
            </div>
            <span className="text-sm">그룹 채팅</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>대화 상대 선택</label>
            {users.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: 'var(--text-muted)' }}>등록된 사용자가 없습니다</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto rounded-md divide-y" style={{ background: '#1e1f22', borderColor: '#1e1f22' }}>
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:opacity-80"
                      style={{ color: selectedIds.includes(u.id) ? '#fff' : 'var(--text-muted)' }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ background: 'var(--accent)' }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.username}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                      </div>
                      {selectedIds.includes(u.id) && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: '#4e5058', color: '#fff' }}>
              취소
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-md py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {loading ? '생성 중...' : '만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 메인 RoomList ──────────────────────────────── */
export function RoomList() {
  const rooms = useChatStore((s) => s.rooms);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const setRooms = useChatStore((s) => s.setRooms);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [showModal, setShowModal] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<{ data: Room[] }>('/rooms').then((res) => setRooms(res.data.data));
  }, [setRooms]);

  function handleCreated(room: Room) {
    setRooms([room, ...rooms]);
    setActiveRoom(room.id);
  }

  const groups = rooms.filter((r) => r.isGroup);
  const dms = rooms.filter((r) => !r.isGroup);

  return (
    <div className="flex flex-col h-full select-none">
      {/* 서버명 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b font-bold text-sm shadow-md"
        style={{ borderColor: '#1e1f22', color: 'var(--sidebar-text-active)', background: 'var(--sidebar-bg)' }}>
        <span>MJ Chat</span>
        <button onClick={() => setShowModal(true)}
          className="rounded-md p-1.5 transition-colors hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#fff' }}
          title="새 채팅방">
          <PlusIcon />
        </button>
      </div>

      {/* 채널 목록 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4"
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={() => { lockTimerRef.current = setTimeout(() => { setShowModal(false); window.dispatchEvent(new CustomEvent('mj:lock')); }, 2000); }}
        onTouchEnd={() => { if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null; } }}
        onTouchMove={() => { if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null; } }}
      >
        {/* 그룹 채팅 */}
        {groups.length > 0 && (
          <div>
            <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              대화방
            </p>
            {groups.map((room) => (
              <RoomItem key={room.id} room={room} isActive={room.id === activeRoomId} onClick={() => setActiveRoom(room.id)}
                icon={<HashIcon />} />
            ))}
          </div>
        )}

        {/* DM */}
        {dms.length > 0 && (
          <div>
            <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              DM
            </p>
            {dms.map((room) => (
              <RoomItem key={room.id} room={room} isActive={room.id === activeRoomId} onClick={() => setActiveRoom(room.id)}
                icon={<DmIcon />} />
            ))}
          </div>
        )}

        {rooms.length === 0 && (
          <div className="px-2 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            + 버튼으로 시작해보세요
          </div>
        )}

        {/* 빈 공간 – 길게 누르면 잠금 트리거 */}
        {/* 테스트용 잠금 트리거 영역 - 2초 길게 누르기 */}
        <div className="min-h-24 rounded-lg flex-1 flex items-center justify-center" style={{ background: '#57f287', border: '3px solid #2d8f52' }}>
          <span style={{ color: '#1a1f24', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.4, padding: '0 8px' }}>
            🔒 여기 2초 길게 누르기{'\n'}(잠금 트리거)
          </span>
        </div>
      </div>

      {/* 하단 내 프로필 */}
      <div className="flex items-center gap-2 px-3 py-3 border-t" style={{ borderColor: '#1e1f22', background: '#232428' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {user?.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--sidebar-text-active)' }}>{user?.username}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>온라인</p>
        </div>
        <button onClick={() => { clear(); window.location.href = '/login'; }}
          title="로그아웃"
          className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {showModal && <CreateRoomModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

function RoomItem({ room, isActive, onClick, icon }: { room: Room; isActive: boolean; onClick: () => void; icon: React.ReactNode }) {
  const showUnreadAlarm = (room.unreadCount ?? 0) > 0 && !room.isMuted;
  const lastMessage = !room.isGroup ? (room.messages?.[0] ?? null) : null;
  const lastMessageText = lastMessage?.content
    ? (lastMessage.content.length > 30 ? lastMessage.content.slice(0, 30) + '…' : lastMessage.content)
    : null;
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors"
      style={{
        background: isActive ? 'var(--sidebar-active)' : 'transparent',
        color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
      }}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = '#dcddde'; }}
      onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)'; } }}
      title={room.isMuted ? `${room.name} · 알림 꺼짐` : room.name}
    >
      <span style={{ color: isActive ? '#fff' : 'var(--text-muted)' }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{room.name}</span>
        {lastMessageText && (
          <span className="block text-xs truncate" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
            {lastMessageText}
          </span>
        )}
      </span>
      {room.isMuted ? (
        <span className="inline-flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-label="알림 꺼짐">
          <MutedIcon />
        </span>
      ) : showUnreadAlarm ? (
        <span className="inline-flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#ed4245', color: '#fff', padding: '0 5px' }}>
          {(room.unreadCount ?? 0) > 99 ? '99+' : room.unreadCount}
        </span>
      ) : null}
    </button>
  );
}
