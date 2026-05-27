import { create } from 'zustand';
import type { Message, Room } from '@chat/types';

interface ChatState {
  rooms: Room[];
  activeRoomId: number | null;
  messages: Record<number, Message[]>; // roomId -> messages
  setRooms: (rooms: Room[]) => void;
  removeRoom: (roomId: number) => void;
  setActiveRoom: (roomId: number) => void;
  setRoomMuted: (roomId: number, isMuted: boolean) => void;
  addMessage: (roomId: number, message: Message) => void;
  setMessages: (roomId: number, messages: Message[]) => void;
  removeMessage: (roomId: number, messageId: number) => void;
  markRead: (roomId: number, userId: number, lastReadMessageId: number) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},

  setRooms: (rooms) => set({ rooms }),

  removeRoom: (roomId) =>
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== roomId),
      activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
    })),

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  setRoomMuted: (roomId, isMuted) =>
    set((state) => ({
      rooms: state.rooms.map((r) => r.id === roomId ? { ...r, isMuted } : r),
    })),

  addMessage: (roomId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: [...(state.messages[roomId] ?? []), message],
      },
    })),

  setMessages: (roomId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [roomId]: messages },
    })),

  markRead: (roomId, userId, lastReadMessageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: (state.messages[roomId] ?? []).map((m) =>
          m.id <= lastReadMessageId
            ? {
                ...m,
                reads: m.reads?.some((r) => r.userId === userId)
                  ? m.reads
                  : [...(m.reads ?? []), { messageId: m.id, userId, readAt: new Date().toISOString() }],
              }
            : m
        ),
      },
    })),

  removeMessage: (roomId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: (state.messages[roomId] ?? []).filter((m) => m.id !== messageId),
      },
    })),
}));
