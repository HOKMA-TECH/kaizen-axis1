import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';

type UnreadMap = Record<string, number>;

interface ChatUnreadContextValue {
  unreadByConversation: UnreadMap;
  totalUnread: number;
  refreshUnread: () => Promise<void>;
  markConversationRead: (conversationId: string) => void;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue | undefined>(undefined);

function getLastRead(userId: string, conversationId: string): number {
  try {
    return parseInt(localStorage.getItem(`last-read-${userId}-${conversationId}`) ?? '0', 10);
  } catch {
    return 0;
  }
}

function isConversationHidden(userId: string, conversationId: string): boolean {
  try {
    return !!localStorage.getItem(`hidden-conv-${userId}-${conversationId}`);
  } catch {
    return false;
  }
}

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const myId = user?.id;
  const [unreadByConversation, setUnreadByConversation] = useState<UnreadMap>({});

  const refreshUnread = useCallback(async () => {
    if (!myId) {
      setUnreadByConversation({});
      return;
    }

    const { data } = await supabase
      .from('chat_messages')
      .select('conversation_id, created_at, sender_id, receiver_id')
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    const counts: UnreadMap = {};
    for (const msg of (data ?? [])) {
      const conversationId = msg.conversation_id;
      if (!conversationId) continue;
      if (isConversationHidden(myId, conversationId)) continue;
      if (msg.sender_id === myId) continue;

      const lastRead = getLastRead(myId, conversationId);
      const createdAt = new Date(msg.created_at).getTime();
      if (createdAt > lastRead) {
        counts[conversationId] = (counts[conversationId] ?? 0) + 1;
      }
    }

    setUnreadByConversation(counts);
  }, [myId]);

  const markConversationRead = useCallback((conversationId: string) => {
    if (!myId) return;
    try {
      localStorage.setItem(`last-read-${myId}-${conversationId}`, String(Date.now()));
    } catch {}

    setUnreadByConversation((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, [myId]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel(`chat-unread-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id === myId || msg.receiver_id === myId) {
          refreshUnread();
        }
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [myId, refreshUnread]);

  const totalUnread = useMemo(
    () => Object.values(unreadByConversation).reduce((acc, value) => acc + value, 0),
    [unreadByConversation],
  );

  return (
    <ChatUnreadContext.Provider value={{ unreadByConversation, totalUnread, refreshUnread, markConversationRead }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) throw new Error('useChatUnread must be used within ChatUnreadProvider');
  return ctx;
}
