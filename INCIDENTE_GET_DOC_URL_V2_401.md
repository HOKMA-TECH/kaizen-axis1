# Incidente: `get-doc-url-v2` retornando `401` ao abrir documentos

## Resumo

Após a migração para `get-doc-url-v2`, o aplicativo passou a exibir **"Erro ao abrir documento"**.
Nos logs da Edge Function, as invocações mostravam `POST | 401` e, em alguns casos, `execution_id: null`.

---

## Sintoma observado

- Frontend: modal com mensagem **"Erro ao abrir documento"**.
- Network: `POST /functions/v1/get-doc-url-v2` com status `401`.
- Supabase Invocations:
  - `status_code: 401`
  - `execution_id: null` (indicando bloqueio antes da função executar)

---

## Causa raiz

A função estava sendo bloqueada no **gateway de Edge Functions** por configuração de autenticação.

Quando `Verify JWT` está habilitado, o gateway pode rejeitar a requisição antes de entrar no código da função (retornando `401`), mesmo com token presente no request.

---

## Solução aplicada

1. Ajuste do fluxo para chamadas seguras via `get-doc-url-v2`.
2. Atualização da função para aceitar token por header e fallback por body (`accessToken`) para maior compatibilidade em runtime.
3. **Desativação de `Verify JWT` na Settings da função `get-doc-url-v2`** para evitar bloqueio no gateway.
4. Redeploy manual da função após ajuste.
5. Refresh de sessão no frontend (`logout/login` + `Ctrl+F5`).

---

## Por que isso não reduz a segurança

A validação de autorização permanece no backend:

- A função exige token e aplica validação no acesso ao documento.
- O acesso ao documento continua sujeito ao escopo/relacionamento da tabela (`client_documents`) e regras de RLS.
- O endpoint antigo com fallback inseguro foi removido no frontend.

Ou seja, a mudança removeu um bloqueio indevido no gateway, sem remover o controle de autorização da lógica da função.

---

## Checklist de validação pós-correção

- [ ] `POST /functions/v1/get-doc-url-v2` retorna `200` para documento permitido.
- [ ] retorna `403/404` para documento sem permissão.
- [ ] `execution_id` aparece preenchido nas invocações (função realmente executando).
- [ ] abertura de documento na ficha do cliente funciona.
- [ ] envio de e-mail com anexo de documento funciona.

---

## Ações preventivas

1. Documentar padrão de configuração por função (pré-auth vs auth-required).
2. Manter monitoramento de `401` por função no painel de logs.
3. Evitar dependência de fallback legado em fluxos sensíveis.
