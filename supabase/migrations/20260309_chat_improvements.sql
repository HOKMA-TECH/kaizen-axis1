-- Chat improvements: reply/quote, emoji reactions, read receipts

-- Reply/Quote: foreign key to parent message
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Emoji reactions: JSONB map of emoji -> array of user IDs
-- Example: { "👍": ["user-uuid-1", "user-uuid-2"], "❤️": ["user-uuid-3"] }
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Read receipts: timestamp when the receiver read the message
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Index for reply lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id ON chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
Você é um especialista em automação n8n e integração de APIs. Preciso que você crie um workflow completo no n8n via API, que implemente um sistema de pré-atendimento automatizado no WhatsApp com as seguintes especificações:

---

## VISÃO GERAL DO SISTEMA

Um agente de IA faz o pré-atendimento de clientes via WhatsApp. Após coletar as informações necessárias, ele para de responder, aplica uma etiqueta "pré atendimento concluído" na conversa e aguarda um atendente humano assumir. Se um humano interromper a conversa a qualquer momento, a IA para imediatamente de responder.

---

## STACK TECNOLÓGICA

- **n8n**: orquestração do workflow
- **Evolution API**: integração com WhatsApp
- **Google Gemini**: modelo de IA (gemini-1.5-flash ou gemini-1.5-pro)
- **n8n built-in storage** (variáveis estáticas ou Redis/SQLite via n8n): controle de estado das conversas

---

## ARQUITETURA DO WORKFLOW

### Workflow 1 — Recebimento de Mensagens (Webhook Trigger)

**Nó 1 - Webhook**
- Método: POST
- Path: `/whatsapp-webhook`
- Recebe eventos da Evolution API

**Nó 2 - Filtro de Eventos**
- Filtra apenas eventos do tipo: `messages.upsert`
- Ignora mensagens enviadas pelo próprio bot (fromMe: true)
- Ignora mensagens de grupos (remoteJid contendo "@g.us")

**Nó 3 - Extração de Dados**
- Extrai: `remoteJid` (ID do contato), `messageType`, `pushName`, conteúdo da mensagem
- Suporta tipos: `conversation` (texto), `audioMessage`, `imageMessage`, `documentMessage`

**Nó 4 - Verificação de Estado da Conversa**
- Consulta estado armazenado para o `remoteJid`
- Estados possíveis:
  - `active_ai`: IA está respondendo normalmente
  - `pre_attendance_done`: pré-atendimento concluído, IA parada
  - `human_takeover`: humano assumiu, IA completamente desativada
  - `new`: conversa nova, sem estado

**Nó 5 - Roteador de Estados**
- Se estado = `human_takeover` → encerra workflow (não faz nada)
- Se estado = `pre_attendance_done` → encerra workflow (não faz nada)  
- Se estado = `active_ai` ou `new` → continua para processamento da IA

**Nó 6 - Detecção de Interrupção Humana**
- Verifica se a mensagem veio de um atendente humano (não do cliente)
- Critérios para detectar humano: verificar se `fromMe: true` E não foi enviado pelo bot (checar pelo número da instância)
- Se humano detectado → atualiza estado para `human_takeover` e encerra

**Nó 7 - Processamento Multimodal**
- Switch baseado em `messageType`:
  - **Texto**: usa conteúdo diretamente
  - **Áudio**: chama Evolution API para baixar mídia, converte para base64, envia para Gemini com mimeType `audio/ogg`
  - **Imagem**: chama Evolution API para baixar mídia, converte para base64, envia para Gemini com mimeType `image/jpeg`

**Nó 8 - Recuperação do Histórico**
- Busca histórico de mensagens da conversa (armazenado em Static Data ou banco)
- Limita a últimas 20 mensagens para não exceder contexto

**Nó 9 - Chamada ao Gemini**
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
- Headers: `x-goog-api-key: {{$credentials.geminiApiKey}}`
- System prompt (ver seção abaixo)
- Inclui histórico + mensagem atual
- Para áudio/imagem: inclui parte `inlineData` com base64

**Nó 10 - Análise da Resposta da IA**
- Verifica se a IA retornou flag de conclusão (ex: `[PRE_ATENDIMENTO_CONCLUIDO]` no texto)
- Se concluído:
  - Remove a flag do texto
  - Envia resposta final ao cliente
  - Aplica etiqueta via Evolution API
  - Atualiza estado para `pre_attendance_done`
- Se não concluído:
  - Envia resposta ao cliente
  - Salva no histórico
  - Mantém estado `active_ai`

**Nó 11 - Envio de Mensagem via Evolution API**
- POST `{{evolutionApiUrl}}/message/sendText/{{instanceName}}`
- Headers: `apikey: {{evolutionApiKey}}`
- Body: `{ "number": "{{remoteJid}}", "text": "{{aiResponse}}" }`

**Nó 12 - Aplicação de Etiqueta**
- POST `{{evolutionApiUrl}}/label/handleLabel/{{instanceName}}`
- Body: `{ "number": "{{remoteJid}}", "labelId": "pre_atendimento_concluido", "action": "add" }`
- OBS: A etiqueta deve existir previamente no WhatsApp Business

---

## SYSTEM PROMPT DA IA (Gemini)