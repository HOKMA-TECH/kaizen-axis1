# Chat Walkthrough — KAIZEN-AXIS
> Auditoria completa do sistema de mensagens e roadmap de melhorias futuras

---

## 1. Visão Geral

O Chat do KAIZEN-AXIS é um sistema de mensagens em tempo real completo, construído sobre **Supabase Realtime + Storage**, com suporte a texto, imagens, vídeo, áudio, documentos, mídia de "visualização única" e um agente IA chamado **KAI** especializado em imóveis e financiamento.

### Arquivos principais

| Arquivo | Responsabilidade | Linhas |
|---------|-----------------|--------|
| `src/pages/Chat.tsx` | Lista de conversas | 438 |
| `src/pages/ChatDetail.tsx` | Conversa individual + envio | 1.332 |
| `src/services/kaiAgent.ts` | Integração com IA (KAI) | 33 |
| `src/data/chat.ts` | Tipos e mock data | 58 |

---

## 2. Banco de Dados — Tabela `chat_messages`

```
id             UUID        PK
sender_id      UUID        FK → profiles
receiver_id    UUID        FK → profiles
conversation_id TEXT       "{id1}_{id2}" ou "kai-{userId}"
content        TEXT        Texto da mensagem
type           TEXT        'text' | 'image' | 'audio' | 'video' | 'document'
media_url      TEXT        URL pública (bucket chat-media)
file_name      TEXT        Nome original do arquivo
view_once      BOOLEAN     Visualização única habilitada
media_path     TEXT        Caminho privado (bucket chat-media-private)
is_locked      BOOLEAN     Já foi visualizada (view-once)
viewed_at      TIMESTAMP   Quando foi visualizada
created_at     TIMESTAMP   Criação
```

### Lógica do `conversation_id`
```ts
// User ↔ User: IDs ordenados alfabeticamente
const conversationId = [myId, otherId].sort().join('_');

// User ↔ KAI: não persiste no banco
const conversationId = `kai-${myId}`;
```

### Buckets Supabase Storage

| Bucket | Tipo | Uso |
|--------|------|-----|
| `chat-media` | Público | Imagens, vídeos, documentos comuns |
| `chat-media-private` | Privado | Mídia de visualização única |

---

## 3. Fluxo de Dados

### Envio de mensagem de texto
```
handleSendMessage()
  → Atualiza estado local (otimista)
  → supabase.from('chat_messages').insert(...)
  → Realtime notifica o receptor
  → Canal 'chat:{conversationId}' dispara INSERT
  → Receptor adiciona mensagem ao estado
```

### Envio de mídia
```
Usuário seleciona arquivo
  → setMediaPreview() → modal de preview
  → confirmSendMedia()
  → uploadMedia() → bucket chat-media (ou private)
  → handleSendMessage({ type, mediaUrl/mediaPath })
  → insert no banco com URL ou path
```

### Indicador de digitação (Presence)
```
handleInputChange()
  → channel.track({ isTyping: true })
  → timeout 2s: channel.track({ isTyping: false })
  → Receptor: channel.on('presence', 'sync')
  → setTypingUser(nome) → exibe "Nome está digitando..."
```

### Fluxo do KAI (IA)
```
Usuário digita mensagem
  → handleSendMessage() detecta isKAI
  → Não persiste no banco (só estado local)
  → setIsKaiTyping(true)
  → sendMessageToKai(text, history)
    → POST supabase/functions/v1/kai-agent
    → Edge Function chama OpenAI (API key no servidor)
    → Retorna { response: string }
  → setIsKaiTyping(false)
  → Adiciona resposta ao estado local (sem persistir)
```

---

## 4. Componentes internos

### `ViewOnceModal` (ChatDetail.tsx:78-192)
- Chama Edge Function `generate-view-once-url` com `message_id`
- Recebe URL assinada (expira em 30s)
- Auto-fecha em 29 segundos
- Bloqueia: right-click, download, fullscreen
- Após visualização: `is_locked = true`, `viewed_at = now()`

### `AudioMessage` (ChatDetail.tsx:196-394)
- Player customizado com waveform em Canvas
- Controles: play/pause, barra de progresso, tempo
- Velocidade: 1x → 1.5x → 2x → 1x
- Waveform pseudo-aleatório baseado no seed da mensagem

### Gravação de áudio (ChatDetail.tsx:835-889)
- API: `MediaRecorder` + `AudioContext`
- Waveform em tempo real durante gravação
- Mime: `audio/mp4` (iOS) ou `audio/webm` (Android/Desktop)
- Auto-envia ao parar a gravação

### Gravação de vídeo / câmera (ChatDetail.tsx:733-832)
- Captura foto via Canvas
- Troca câmera frontal/traseira
- Gravação de vídeo com `MediaRecorder`
- Mime: `video/mp4` (iOS) ou `video/webm`

---

## 5. Estado atual — Funcionalidades

| Funcionalidade | Status | Observações |
|---|---|---|
| Mensagens de texto | ✅ Completo | Realtime via Postgres Changes |
| Imagens | ✅ Completo | Upload para chat-media |
| Vídeo | ✅ Completo | Upload + gravação câmera |
| Áudio | ✅ Completo | Gravação + player com waveform |
| Documentos (PDF) | ✅ Completo | Preview + download |
| Visualização única | ✅ Completo | Bucket privado + URL assinada 30s |
| Indicador de digitação | ✅ Completo | Supabase Presence |
| KAI (IA) | ✅ Completo | Edge Function + OpenAI |
| Markdown no KAI | ✅ Completo | react-markdown |
| Notificação de nova mensagem | ✅ Completo | Trigger no banco |
| Paginação de mensagens | ❌ Ausente | Carrega tudo de uma vez |
| Contagem de não lidos | ❌ Ausente | Sem badge de unread |
| Confirmação de leitura | ❌ Ausente | Sem "✓✓" de entregue/lido |
| Histórico do KAI persistente | ❌ Ausente | Perde ao sair da tela |
| Busca em mensagens | ❌ Ausente | Só busca conversas |
| Reações a mensagens | ❌ Ausente | — |
| Responder mensagem específica | ❌ Ausente | Sem reply/quote |
| Mensagens fixadas (pin) | ❌ Ausente | — |
| Deletar/editar mensagem | ❌ Ausente | — |
| Grupos | ❌ Ausente | Apenas 1-to-1 |

---

## 6. Problemas identificados

### 🔴 Críticos

#### 6.1 Sem paginação de mensagens
Todas as mensagens da conversa são carregadas de uma vez:
```ts
supabase.from('chat_messages').select('*').eq('conversation_id', conversationId)
```
Em conversas longas (centenas de mensagens), isso causa:
- Carregamento lento
- Alto consumo de memória
- Possível timeout na query

**Impacto:** Alta — qualquer conversa ativa há meses já sente isso.

#### 6.2 Histórico do KAI não é persistido
Mensagens com o KAI só existem no estado local do componente. Sair da tela apaga tudo. O usuário perde contexto valioso de conversas anteriores.

**Impacto:** Alta — experiência ruim, parece bug para o usuário.

---

### 🟠 Alta prioridade

#### 6.3 Sem badge de mensagens não lidas
A lista de conversas (`Chat.tsx`) não mostra quantas mensagens não foram lidas. O usuário não sabe que recebeu mensagem sem abrir cada conversa.

#### 6.4 Sem status de entrega/leitura
Não há `✓` (enviado) / `✓✓` (entregue) / `✓✓ azul` (lido) nas mensagens. O remetente não sabe se a mensagem chegou.

#### 6.5 Textarea não expande automaticamente
O campo de texto (`<input>`) tem tamanho fixo. Ao digitar mensagens longas, o texto fica cortado. Deveria ser um `<textarea>` que cresce com o conteúdo.

---

### 🟡 Média prioridade

#### 6.6 Sem "responder mensagem" (reply/quote)
Não é possível responder a uma mensagem específica com contexto visual (quote).

#### 6.7 Sem busca dentro da conversa
Existe busca de conversas na lista, mas não há como buscar uma mensagem específica dentro de uma conversa.

#### 6.8 Sem deletar/editar mensagens
Não há opções ao pressionar/segurar uma mensagem (context menu).

#### 6.9 Upload sem validação de tamanho
Não há limite de tamanho de arquivo antes do upload. Um arquivo de 500 MB seria enviado inteiro (e provavelmente falharia no Supabase Storage).

---

## 7. Melhorias sugeridas — Roadmap

### Sprint 1 — Confiabilidade (2-3 dias)

#### 7.1 Paginação de mensagens
Carregar as últimas 50 mensagens e paginar ao rolar para cima (infinite scroll reverso):

```ts
// Primeiro carregamento
const { data } = await supabase
  .from('chat_messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: false })
  .limit(50);
setMessages(data.reverse());

// Carregar mais (ao rolar para o topo)
const { data: older } = await supabase
  .from('chat_messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: false })
  .lt('created_at', messages[0].timestamp) // antes da msg mais antiga
  .limit(50);
setMessages(prev => [...older.reverse(), ...prev]);
```

#### 7.2 Persistir histórico do KAI
Salvar mensagens do KAI na tabela `chat_messages` com `receiver_id = 'kai-agent'` (ou um UUID fixo). Isso permite retomar a conversa ao voltar.

Alternativa leve: salvar no `localStorage` com chave `kai-history-{userId}`.

---

### Sprint 2 — UX essencial (3-4 dias)

#### 7.3 Badge de não lidos + campo `read_at`
Adicionar coluna `read_at TIMESTAMP` em `chat_messages`. Atualizar ao abrir a conversa:

```ts
// Ao abrir ChatDetail: marcar todas como lidas
await supabase
  .from('chat_messages')
  .update({ read_at: new Date().toISOString() })
  .eq('conversation_id', conversationId)
  .eq('receiver_id', myId)
  .is('read_at', null);

// Na lista Chat.tsx: contar não lidas
const unread = messages.filter(m => m.receiver_id === myId && !m.read_at).length;
```

Badge na lista de conversas:
```tsx
{unread > 0 && (
  <span className="w-5 h-5 rounded-full bg-gold-500 text-white text-[10px] font-bold flex items-center justify-center">
    {unread > 99 ? '99+' : unread}
  </span>
)}
```

#### 7.4 Status de entrega/leitura (✓✓)
Usar o campo `read_at` para exibir indicadores visuais:

```tsx
// Na mensagem enviada (isMe = true):
{msg.isMe && (
  <span className="text-[10px] ml-1">
    {msg.readAt ? '✓✓' : '✓'}  // ✓✓ azul se lido
  </span>
)}
```

#### 7.5 Textarea expansível
Substituir o `<input type="text">` por `<textarea>` com altura automática:

```tsx
<textarea
  ref={textareaRef}
  value={inputValue}
  onChange={handleInputChange}
  onInput={(e) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }}
  rows={1}
  className="resize-none overflow-hidden ..."
  placeholder="Mensagem..."
/>
```

#### 7.6 Validação de tamanho de arquivo
```ts
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

if (file.size > MAX_FILE_SIZE) {
  alert('Arquivo muito grande. O limite é 50 MB.');
  return;
}
```

---

### Sprint 3 — Features de qualidade (4-5 dias)

#### 7.7 Responder mensagem (Reply/Quote)
Estado extra:
```ts
const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
```

Salvar no banco com coluna `reply_to_id UUID`:
```ts
await supabase.from('chat_messages').insert({
  ...messageData,
  reply_to_id: replyTo?.id ?? null,
});
```

UI: ao pressionar/segurar uma mensagem → menu com opção "Responder". Exibir quote acima da mensagem.

#### 7.8 Context menu na mensagem (press/hold)
Ao segurar uma mensagem, mostrar menu com:
- **Responder**
- **Copiar texto**
- **Apagar** (só as próprias, com `DELETE` no banco)
- **Encaminhar** (futuro)

```tsx
<div
  onContextMenu={(e) => { e.preventDefault(); setContextMenu(msg); }}
  onTouchStart={() => longPressTimer = setTimeout(() => setContextMenu(msg), 600)}
>
  {/* mensagem */}
</div>
```

#### 7.9 Busca dentro da conversa
Botão de lupa no header do `ChatDetail`. Mostra campo de busca e filtra mensagens que contenham o texto:

```ts
const filtered = messages.filter(m =>
  m.text?.toLowerCase().includes(searchQuery.toLowerCase())
);
```

Highlight do texto encontrado com `<mark>`.

---

### Sprint 4 — Avançado (opcional)

#### 7.10 Reações a mensagens (Emoji Reactions)
Nova tabela `message_reactions`:
```
id              UUID PK
message_id      UUID FK
user_id         UUID FK
emoji           TEXT ('👍', '❤️', '😂', '😮', '😢', '🔥')
created_at      TIMESTAMP
```

Exibir abaixo da mensagem: `👍 3  ❤️ 1`

#### 7.11 Grupos de chat
Novo modelo:
- Tabela `chat_rooms` (id, name, type='group'|'direct', created_by)
- Tabela `chat_room_members` (room_id, user_id, role='admin'|'member')
- Adaptar `chat_messages` para ter `room_id` em vez de `receiver_id`

#### 7.12 Notificações Push para novas mensagens
Aproveitar a infra do PWA (SW + VAPID) já implementada:
```js
// No Service Worker, ao receber push:
self.addEventListener('push', (e) => {
  const { senderName, preview } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(`Nova mensagem de ${senderName}`, {
      body: preview,
      icon: '/pwa-192x192.svg',
      badge: '/pwa-192x192.svg',
    })
  );
});
```

Disparar da Edge Function que já cria a notificação no banco (trigger `trigger_notify_new_chat_message`).

#### 7.13 KAI com contexto de cliente
Passar para o KAI o contexto do cliente sendo analisado:

```ts
// Em ClientDetails.tsx, antes de abrir chat com KAI:
await sendMessageToKai(
  `[CONTEXTO DO CLIENTE]\nNome: ${client.name}\nRenda: ${client.income}\n...`,
  []
);
```

Isso permite o KAI fazer análises de financiamento personalizadas.

---

## 8. Sequência de implementação sugerida

```
Sprint 1 — Base sólida (prioritário)
  ✅ Paginação de mensagens (50 por vez)
  ✅ Persistir histórico do KAI (localStorage ou banco)
  ✅ Validação de tamanho de arquivo (50 MB max)

Sprint 2 — UX essencial
  ✅ Textarea expansível
  ✅ Coluna read_at + badge de não lidos
  ✅ Indicador ✓✓ de leitura nas mensagens enviadas

Sprint 3 — Features de qualidade
  ✅ Context menu ao segurar mensagem (copiar, apagar, responder)
  ✅ Reply/Quote de mensagem específica
  ✅ Busca dentro da conversa

Sprint 4 — Avançado (opcional)
  ✅ Reações com emoji
  ✅ Push notification para novas mensagens (PWA)
  ✅ KAI com contexto do cliente ativo
```

---

## 9. Arquivos a modificar por sprint

### Sprint 1
| Arquivo | Mudança |
|---------|---------|
| `src/pages/ChatDetail.tsx` | Paginação (loadMessages + scroll infinito) |
| `src/pages/ChatDetail.tsx` | Validação de tamanho de arquivo |
| `src/services/kaiAgent.ts` | Ler/salvar histórico no localStorage |

### Sprint 2
| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/` | Adicionar coluna `read_at` em `chat_messages` |
| `src/pages/ChatDetail.tsx` | Marcar mensagens como lidas no mount |
| `src/pages/ChatDetail.tsx` | Substituir input por textarea expansível |
| `src/pages/Chat.tsx` | Contar e exibir badge de não lidos |
| `src/pages/ChatDetail.tsx` | Exibir ✓ / ✓✓ nas mensagens enviadas |

### Sprint 3
| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/` | Adicionar coluna `reply_to_id` em `chat_messages` |
| `src/pages/ChatDetail.tsx` | Estado `replyTo` + UI de quote |
| `src/pages/ChatDetail.tsx` | Context menu (long press) |
| `src/pages/ChatDetail.tsx` | Busca dentro da conversa |

---

*Gerado em 2026-03-09 — baseado em análise estática do código-fonte.*
