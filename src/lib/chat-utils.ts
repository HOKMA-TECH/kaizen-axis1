// src/lib/chat-utils.ts

export const CHAT_COLORS = [
  'from-blue-400 to-blue-500',
  'from-violet-400 to-violet-500',
  'from-emerald-400 to-emerald-500',
  'from-rose-400 to-rose-500',
  'from-cyan-400 to-cyan-500',
  'from-pink-400 to-pink-500',
  'from-indigo-400 to-indigo-500',
  'from-teal-400 to-teal-500',
];

export function getColor(id: string): string {
  return CHAT_COLORS[
    id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CHAT_COLORS.length
  ];
}

export function getInitials(name: string): string {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatPreview(type: string, content: string, isMe: boolean): string {
  const prefix = isMe ? 'Você: ' : '';
  if (type === 'image') return `${prefix}📷 Imagem`;
  if (type === 'video') return `${prefix}🎥 Vídeo`;
  if (type === 'audio') return `${prefix}🎤 Áudio`;
  if (type === 'document') return `${prefix}📄 Documento`;
  return `${prefix}${content || ''}`;
}
