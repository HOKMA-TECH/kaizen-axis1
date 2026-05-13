// src/components/chat/ChatDetailPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X } from 'lucide-react';
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
  isGroup?: boolean;
  isOnline?: boolean;
  onClose?: () => void;
}

const PAGE_SIZE = 50;

export function ChatDetailPanel({
  otherId, otherName, otherRole, otherAvatar, isKAI, isGroup, isOnline, onClose,
}: ChatDetailPanelProps) {
  const { user } = useApp();
  const { markConversationRead } = useChatUnread();
  const myId = user?.id;

  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const groupId = isGroup && otherId ? otherId.replace('group-', '') : null;

  const conversationId = isKAI
    ? `kai-${myId}`
    : isGroup
      ? otherId
      : otherId && myId
        ? [myId, otherId].sort().join('-')
        : null;

  const mapMsg = useCallback((m: any): BubbleMessage => ({
    id: m.id,
    text: m.content,
    type: m.type === 'kai_reply' ? 'text' : m.type as BubbleMessage['type'],
    mediaUrl: m.media_url,
    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date(m.created_at).toLocaleDateString(),
    isMe: m.sender_id === myId && m.type !== 'kai_reply',
    isKAI: isKAI && m.type === 'kai_reply',
    deliveryStatus: 'sent' as const,
    is_deleted: m.is_deleted ?? false,
    reactions: [],
  }), [myId, isKAI]);

  const loadReactions = useCallback(async (msgs: BubbleMessage[]) => {
    if (msgs.length === 0) return msgs;
    const ids = msgs.map(m => m.id);
    const { data, error } = await supabase
      .from('chat_message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', ids);

    if (error) {
      console.error('[loadReactions]', error.message);
      return msgs;
    }

    const byMsg: Record<string, { emoji: string; count: number; reacted: boolean }[]> = {};
    for (const r of (data ?? [])) {
      if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
      const existing = byMsg[r.message_id].find(x => x.emoji === r.emoji);
      if (existing) {
        existing.count++;
        if (r.user_id === myId) existing.reacted = true;
      } else {
        byMsg[r.message_id].push({ emoji: r.emoji, count: 1, reacted: r.user_id === myId });
      }
    }
    return msgs.map(m => ({ ...m, reactions: byMsg[m.id] ?? [] }));
  }, [myId]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .not('deleted_for', 'cs', `{"${myId}"}`)
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    const msgs = (data ?? []).map(mapMsg).reverse();
    const withReactions = await loadReactions(msgs);
    setMessages(withReactions);
    setLoading(false);
  }, [conversationId, myId, mapMsg, loadReactions]);

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    if (!conversationId || !myId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    loadMessages();
    if (isKAI) return; // KAI responses are added directly after send, no realtime needed
    const channel = supabase
      .channel(`panel:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (p) => {
        const m = p.new as any;
        const isFromOther = isGroup
          ? m.sender_id !== myId
          : (m.sender_id !== myId && m.receiver_id === myId);
        if (isFromOther) {
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

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleSendAudio = async (blob: Blob) => {
    if (!myId || !otherId || isKAI) return;
    setSending(true);
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const path = `${conversationId}/${Date.now()}_audio.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(path, blob, { contentType: blob.type });
    if (uploadError) { setSending(false); return; }
    const mediaUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
    const tempId = `temp-${Date.now()}`;
    const optimistic: BubbleMessage = {
      id: tempId, type: 'audio', mediaUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString(),
      isMe: true, deliveryStatus: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    const { error } = await supabase.from('chat_messages').insert({
      sender_id: myId,
      ...(isGroup ? { group_id: groupId } : { receiver_id: otherId }),
      conversation_id: conversationId,
      content: null, type: 'audio', media_url: mediaUrl,
    });
    setMessages(prev => prev.map(m =>
      m.id === tempId ? { ...m, deliveryStatus: error ? 'sending' : 'sent' as const } : m
    ));
    setSending(false);
  };

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId || !otherId || isKAI) return;
    const isVideo = file.type.startsWith('video/');
    const type = isVideo ? 'video' : 'image';
    setSending(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${conversationId}/${Date.now()}_${type}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, file);
    if (!uploadError) {
      const mediaUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      const tempId = `temp-${Date.now()}`;
      const optimistic: BubbleMessage = {
        id: tempId, type, mediaUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, optimistic]);
      const { error } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        ...(isGroup ? { group_id: groupId } : { receiver_id: otherId }),
        conversation_id: conversationId,
        content: null, type, media_url: mediaUrl,
      });
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, deliveryStatus: error ? 'sending' : 'sent' as const } : m
      ));
    }
    setSending(false);
    e.target.value = '';
  };

  const handleDocumentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId || !otherId || isKAI) return;
    setSending(true);
    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `${conversationId}/${Date.now()}_doc.${ext}`;
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
    if (!uploadError) {
      const mediaUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      const tempId = `temp-${Date.now()}`;
      const optimistic: BubbleMessage = {
        id: tempId, text: file.name, type: 'document', mediaUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, optimistic]);
      const { error } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        ...(isGroup ? { group_id: groupId } : { receiver_id: otherId }),
        conversation_id: conversationId,
        content: file.name, type: 'document', media_url: mediaUrl,
      });
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, deliveryStatus: error ? 'sending' : 'sent' as const } : m
      ));
    }
    setSending(false);
    e.target.value = '';
  };

  const openCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert('Não foi possível acessar a câmera.');
      setShowCamera(false);
    }
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !myId || !otherId || isKAI) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      closeCamera();
      setSending(true);
      const path = `${conversationId}/${Date.now()}_camera.jpg`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: 'image/jpeg' });
      if (!uploadError) {
        const mediaUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
        const tempId = `temp-${Date.now()}`;
        const optimistic: BubbleMessage = {
          id: tempId, type: 'image', mediaUrl,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toLocaleDateString(),
          isMe: true, deliveryStatus: 'sending',
        };
        setMessages(prev => [...prev, optimistic]);
        const { error } = await supabase.from('chat_messages').insert({
          sender_id: myId,
          ...(isGroup ? { group_id: groupId } : { receiver_id: otherId }),
          conversation_id: conversationId,
          content: null, type: 'image', media_url: mediaUrl,
        });
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, deliveryStatus: error ? 'sending' : 'sent' as const } : m
        ));
      }
      setSending(false);
    }, 'image/jpeg', 0.92);
  };

  const handleDeleteForMe = useCallback(async (msgId: string) => {
    if (!myId) return;
    setMessages(prev => prev.filter(m => m.id !== msgId));
    await supabase.rpc('chat_delete_for_me', { p_message_id: msgId, p_user_id: myId });
  }, [myId]);

  const handleDeleteForAll = useCallback(async (msgId: string) => {
    if (!myId) return;
    setMessages(prev => prev.map(m =>
      m.id === msgId && m.isMe
        ? { ...m, is_deleted: true, text: undefined, mediaUrl: undefined }
        : m
    ));
    await supabase
      .from('chat_messages')
      .update({ is_deleted: true, content: null, media_url: null })
      .eq('id', msgId)
      .eq('sender_id', myId);
  }, [myId]);

  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    if (!myId) return;

    // Capture state before optimistic update for potential rollback
    let isTogglingOff = false;

    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = [...(m.reactions ?? [])];
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing && existing.reacted) {
        isTogglingOff = true;
        const updated = reactions
          .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r)
          .filter(r => r.count > 0);
        return { ...m, reactions: updated };
      }
      if (existing) {
        return { ...m, reactions: reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r) };
      }
      return { ...m, reactions: [...reactions, { emoji, count: 1, reacted: true }] };
    }));

    if (isTogglingOff) {
      await supabase
        .from('chat_message_reactions')
        .delete()
        .eq('message_id', msgId)
        .eq('user_id', myId)
        .eq('emoji', emoji);
    } else {
      await supabase
        .from('chat_message_reactions')
        .upsert({ message_id: msgId, user_id: myId, emoji }, { onConflict: 'message_id,user_id' });
    }
  }, [myId]);

  const handleSend = async (text: string) => {
    if (!myId || !otherId) return;
    setSending(true);

    if (isKAI) {
      const tempId = `temp-${Date.now()}`;
      const userMsg: BubbleMessage = {
        id: tempId, text, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, userMsg]);

      // Persist user message to DB
      const { data: savedUserMsg } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        receiver_id: myId,
        conversation_id: conversationId,
        content: text,
        type: 'text',
      }).select('id').single();
      const realUserMsgId = savedUserMsg?.id ?? tempId;
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: realUserMsgId, deliveryStatus: 'sent' as const } : m
      ));

      // Get KAI reply
      const reply = await sendMessageToKai(text, []);
      const tempKaiId = `kai-temp-${Date.now()}`;
      const kaiMsg: BubbleMessage = {
        id: tempKaiId, text: reply, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        isMe: false, isKAI: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, kaiMsg]);

      // Persist KAI reply to DB
      const { data: savedKaiMsg } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        receiver_id: myId,
        conversation_id: conversationId,
        content: reply,
        type: 'kai_reply',
      }).select('id').single();
      const realKaiMsgId = savedKaiMsg?.id ?? tempKaiId;
      setMessages(prev => prev.map(m =>
        m.id === tempKaiId ? { ...m, id: realKaiMsgId, deliveryStatus: 'sent' as const } : m
      ));
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: BubbleMessage = {
        id: tempId, text, type: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        isMe: true, deliveryStatus: 'sending',
      };
      setMessages(prev => [...prev, optimistic]);
      const { error } = await supabase.from('chat_messages').insert({
        sender_id: myId,
        ...(isGroup ? { group_id: groupId } : { receiver_id: otherId }),
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
    <>
      <input
        ref={galleryInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
        onChange={handleGalleryFile}
      />
      <input
        ref={documentInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        onChange={handleDocumentFile}
      />

      {/* Camera modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4">
            <button onClick={closeCamera} className="text-white p-2 hover:opacity-70 transition-opacity">
              <X size={24} />
            </button>
            <span className="text-white font-medium">Câmera</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex justify-center p-8">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/40 hover:scale-95 active:scale-90 transition-transform"
            />
          </div>
        </div>
      )}

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
            {messages.map((msg, i) => {
              const showDateSep = i === 0 || (msg.date && messages[i - 1]?.date !== msg.date);
              const today = new Date().toLocaleDateString();
              const isToday = msg.date === today;
              const dateLabel = isToday ? 'Hoje' : (msg.date ?? 'Hoje');
              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-surface-200" />
                      <span className="text-xs text-text-secondary">— {dateLabel} —</span>
                      <div className="flex-1 h-px bg-surface-200" />
                    </div>
                  )}
                  <ChatMessageBubble
                    message={msg}
                    index={i}
                    onDeleteForMe={handleDeleteForMe}
                    onDeleteForAll={handleDeleteForAll}
                    onReact={handleReact}
                  />
                </div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInputBar
        onSend={handleSend}
        onSendAudio={handleSendAudio}
        onGallery={() => galleryInputRef.current?.click()}
        onAttach={() => documentInputRef.current?.click()}
        onCamera={openCamera}
        sending={sending}
        disabled={!myId}
      />
    </motion.div>
    </>
  );
}
