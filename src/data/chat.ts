export interface User {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  fileName?: string;
  timestamp: string;
  isMe: boolean;
}

export interface ChatConversation {
  id: string;
  userId: string;
  unread: number;
  lastMessage: string;
  lastMessageTime: string;
}

export const MOCK_USERS: User[] = [
  { id: 'kai-agent', name: 'KAI (IA)', avatar: 'https://ui-avatars.com/api/?name=KAI&background=D4AF37&color=fff&bold=true', status: 'online' },
  { id: '1', name: 'Carlos Eduardo', avatar: 'https://picsum.photos/seed/1/200', status: 'online' },
  { id: '2', name: 'Fernanda Lima', avatar: 'https://picsum.photos/seed/2/200', status: 'offline' },
  { id: '3', name: 'João Pedro', avatar: 'https://picsum.photos/seed/3/200', status: 'online' },
  { id: '4', name: 'Suporte Técnico', avatar: 'https://picsum.photos/seed/4/200', status: 'online' },
  { id: '5', name: 'Ana Clara', avatar: 'https://picsum.photos/seed/5/200', status: 'offline' },
  { id: '6', name: 'Roberto Diretor', avatar: 'https://picsum.photos/seed/6/200', status: 'offline' },
];

export const MOCK_CONVERSATIONS: ChatConversation[] = [
  { id: 'kai', userId: 'kai-agent', unread: 1, lastMessage: 'Olá! Sou o KAI, seu especialista em crédito e estratégia. Como posso ajudar hoje?', lastMessageTime: 'Agora' },
  { id: '1', userId: '1', unread: 2, lastMessage: 'Podemos agendar a visita para amanhã?', lastMessageTime: '10:30' },
  { id: '2', userId: '2', unread: 0, lastMessage: 'Enviei os documentos por email.', lastMessageTime: '09:15' },
  { id: '3', userId: '3', unread: 0, lastMessage: 'Obrigado pelo atendimento!', lastMessageTime: 'Ontem' },
  { id: '4', userId: '4', unread: 0, lastMessage: 'Seu chamado foi resolvido.', lastMessageTime: 'Ontem' },
];

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'kai-agent': [
    { id: 'k1', senderId: 'kai-agent', text: 'Olá! Sou o KAI, seu especialista em crédito e estratégia. Como posso ajudar hoje?', type: 'text', timestamp: 'Agora', isMe: false },
  ],
  '1': [
    { id: 'm1', senderId: 'me', text: 'Bom dia, Carlos! Tudo bem?', type: 'text', timestamp: '10:00', isMe: true },
    { id: 'm2', senderId: '1', text: 'Bom dia! Tudo ótimo.', type: 'text', timestamp: '10:05', isMe: false },
    { id: 'm3', senderId: '1', text: 'Podemos agendar a visita para amanhã?', type: 'text', timestamp: '10:30', isMe: false },
  ],
  '2': [
    { id: 'm1', senderId: '2', text: 'Enviei os documentos por email.', type: 'text', timestamp: '09:15', isMe: false },
  ]
};
