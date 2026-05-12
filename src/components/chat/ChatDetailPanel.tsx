// src/components/chat/ChatDetailPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useChatUnread } from '@/context/ChatUnreadContext';
import { sendMessageToKai } from '@/services/kaiAgent';
import { ChatDetailHeader } from './ChatDetailHeader';
import { ChatMessageBubble, BubbleMessage } from './ChatMessageBubble';
import { ChatInputBar } from './ChatInputBar';
import { ChatWelcome } from './ChatWelcome';

interface ChatDetailPanelProps {
  otherId: string | null;
  otherName: string;
  otherRole?: string;
  otherAvatar?: string | null;
  isKAI?: boolean;
  isOnline?: boolean;
  onClose?: () => void;
}

const PAGE_SIZE = 50;

export function ChatDetailPanel({
  otherId, otherName, otherRole, otherAvatar, isKAI, isOnline, onClose,
}: ChatDetailPanelProps) {
  const { user } = useApp();
  const { markConversationRead } = useChatUnread();
  const myId = user?.id;

  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversationId = isKAI
    ? `kai-${myId}`
    : otherId && myId
      ? [myId, otherId].sort().join('-')
      : null;

  const mapMsg = useCallback((m: any): BubbleMessage => ({
    id: m.id,
    text: m.content,
    type: m.type as BubbleMessage['type'],
    mediaUrl: m.media_url,
    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMe: m.sender_id === myId,
    isKAI: isKAI && m.sender_id !== myId,
    deliveryStatus: 'sent' as const,
    is_deleted: m.is_deleted ?? false,
  }), [myId, isKAI]);

  const loadMessages = useCallback(async () => {
    if (!conversationId || isKAI) return;
    setLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .not('deleted_for', 'cs', `{"${myId}"}`)
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    setMessages((data ?? []).map(mapMsg).reverse());
    setLoading(false);
  }, [conversationId, isKAI, myId, mapMsg]);

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    if (!conversationId || !myId || isKAI) {
      setMessages([]);
      return;
    }
    loadMessages();
    const channel = supabase
      .channel(`panel:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (p) => {
        const m = p.new as any;
        if (m.sender_id === myId || m.receiver_id === myId) {
          setMessages(prev => [...prev, mapMsg(m)]);
          markConversationRead(conversationId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, myId, isKAI, loadMessages, mapMsg, markConversationRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setMessages([]);
    if (!isKAI) loadMessages();
  }, [otherId]);

  const handleSend = async (text: string) => {
    if (!myId || !otherId) return;
    setSending(true);

    if (isKAI) {
      const tempId = `temp-${Date.now()}`;
      const userMsg: BubbleMessage = {
        id: tempId, text, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true, deliveryStatus: 'sent',
      };
      setMessages(prev => [...prev, userMsg]);
      try {
        const reply = await sendMessageToKai(text, []);
        const kaiMsg: BubbleMessage = {
          id: `kai-${Date.now()}`, text: reply, type: 'text',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: false, isKAI: true, deliveryStatus: 'sent',
        };
        setMessages(prev => [...prev, kaiMsg]);
      } catch {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: BubbleMessage = {
        id: tempId, text, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, optimistic]);
      const { error } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        receiver_id: otherId,
        conversation_id: conversationId,
        content: text,
        type: 'text',
      });
      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, deliveryStatus: 'sent' as const } : m
        ));
      }
    }
    setSending(false);
  };

  if (!otherId) return <ChatWelcome />;

  return (
    <motion.div
      key={otherId}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col h-full bg-surface-50 dark:bg-surface-900/20"
    >
      <ChatDetailHeader
        name={otherName}
        role={otherRole}
        avatarUrl={otherAvatar}
        otherId={otherId}
        isKAI={isKAI}
        isOnline={isOnline}
        onBack={onClose}
        onMore={undefined}
      />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-text-secondary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary">Nenhuma mensagem ainda. Diga olá!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <ChatMessageBubble key={msg.id} message={msg} index={i} />
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInputBar
        onSend={handleSend}
        sending={sending}
        disabled={!myId}
      />
    </motion.div>
  );
}
