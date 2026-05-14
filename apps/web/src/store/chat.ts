import { create } from 'zustand';
import type { Message, Room } from '@chat/types';

interface ChatState {
  rooms: Room[];
  activeRoomId: number | null;
  messages: Record<number, Message[]>; // roomId -> messages
  setRooms: (rooms: Room[]) => void;
  setActiveRoom: (roomId: number) => void;
  addMessage: (roomId: number, message: Message) => void;
  setMessages: (roomId: number, messages: Message[]) => void;
  markRead: (roomId: number, userId: number, lastReadMessageId: number) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},

  setRooms: (rooms) => set({ rooms }),

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

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
}));
