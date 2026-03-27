# Kaizen Axis — Segurança Multicamadas

Esta release adiciona auditoria completa, proteção de documentos, rate limiting e visibilidade administrativa. Utilize este guia para aplicar e validar a nova camada sem interromper fluxos existentes.

## 1. Migração de Banco
1. Executar `supabase/migrations/20260327000000_security_layers.sql` (SQL Editor ou `npx supabase db push`).
2. Confirmar objetos:
   - Tabelas: `public.audit_logs`, `public.security_events`, `public.request_throttles`.
   - Funções: `is_security_admin()`, `increment_request_counter`, `detect_suspicious_activity`.
   - Trigger: `trg_detect_suspicious_activity` em `audit_logs`.
3. Validar RLS:
   ```sql
   SELECT tablename, polname FROM pg_policies WHERE tablename IN ('audit_logs','security_events','request_throttles');
   ```
   Deve listar apenas policies `security_admin_*` e `service_role_*`.

## 2. Edge Functions
Deploy na Supabase (ou `supabase functions deploy`):
- `audit-log`: recebe eventos do app, grava em `audit_logs` e aplica rate limit local.
- `rate-guard`: aplica limites 10/min (login), 60/min (consultas) e 20/min (uploads) por IP ou usuário.
- `get-doc-url`: já existente, agora limita TTL entre 30 e 600 segundos.

Configurar variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` em cada função.

## 3. Instrumentação do App
- Novo serviço `src/services/auditLogger.ts` envia eventos via `sendBeacon` (fire-and-forget).
- `AppContext` registra automaticamente: criação/edição/exclusão de clientes, uploads/downloads, alteração de perfil, login/logout.
- Páginas específicas (`Login`, `ClientDetails`, `SendEmail`, `IncomeAnalysis`, `SaveDocumentModal`) enviam ações adicionais (`client_view`, anexos, geração de PDFs etc.).
- `rateLimiter.enforce(...)` protege login, `refreshClients` e qualquer upload para `client-documents`.

## 4. Proteção de Documentos
- Todos os uploads usam o bucket privado `client-documents`; apenas o caminho é salvo em `client_documents.url`.
- Downloads e anexos usam URLs assinadas (edge function + `createSignedUrl`).
- Componentes antigos que usavam `getPublicUrl` foram atualizados.

## 5. Monitoramento e Painel
- Cada inserção em `audit_logs` passa por `detect_suspicious_activity` e pode gerar eventos `login_bruteforce`, `mass_client_access` ou `mass_document_download` na tabela `security_events`.
- Página `Admin → Painel de Segurança (/admin/security)` exibe logins recentes, falhas, downloads, eventos suspeitos e timeline filtrável.
- Policies garantem que apenas ADMIN/DIRETOR visualizem registros.

## 6. Rate Limiting
- Edge `rate-guard` mantém contadores por janela de 60s em `request_throttles`.
- Resposta 429 bloqueia a ação no frontend com mensagem amigável.
- Limites podem ser ajustados editando `LIMITS` no código da função sem tocar no app.

## 7. Testes Recomendados
1. **Migração**: executar `SELECT COUNT(*) FROM audit_logs;` para garantir acesso; inserir evento manual via `INSERT` e conferir que trigger cria `security_events` conforme esperado.
2. **Edge functions**: `supabase functions serve` e testar `POST /audit-log` com payload mínimo.
3. **Frontend**:
   - Login sucesso/falha e verificar registros na tabela / painel.
   - Criar/editar cliente, anexar documento e baixar arquivo → eventos devem aparecer em `audit_logs`.
   - Tentar 11 logins em <1 min → segundo uma mensagem de bloqueio e `request_throttles` deve registrar contador.
   - Abrir 50 fichas rapidamente → observar evento `mass_client_access` após 1 minuto.
4. **Painel de Segurança**: logar como ADMIN, acessar `/admin/security` e validar cards/listas.

## 8. Rollback Seguro
- Caso necessário, comentar o trigger `trg_detect_suspicious_activity` e desativar policies com:
  ```sql
  ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
  DROP TRIGGER IF EXISTS trg_detect_suspicious_activity ON audit_logs;
  DROP TABLE IF EXISTS security_events, request_throttles;
  ```
- Remova as chamadas de `logAuditEvent` apenas depois de confirmar que a auditoria não é mais necessária.

## 9. Operação Contínua
- Monitorar `security_events` e `audit_logs` com `supabase logs tail` ou via painel.
- Agendar backup diário (já suportado pelo Supabase) e verificar restore mensal.
- Para bloquear automaticamente algum evento, criar workflow separado lendo `security_events` (fora do escopo desta mudança).
