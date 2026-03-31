# Incidente: Login bloqueado após hardening de autenticação

## Resumo executivo

Durante a migração do login para uma Edge Function (`secure-login`), o fluxo de autenticação passou a falhar em produção com `401 Unauthorized` / `Não autorizado`.

O problema afetou o acesso de usuários legítimos ao sistema. A proteção contra brute force foi mantida, mas a validação rígida de cabeçalhos no início da função gerou bloqueios indevidos no ambiente real.

---

## Contexto

### Objetivo da mudança

- Remover dependência de proteção no frontend.
- Evitar bypass por chamadas diretas ao endpoint público `POST /auth/v1/token?grant_type=password`.
- Centralizar login em `POST /functions/v1/secure-login`.
- Aplicar rate limit server-side por IP **antes** da autenticação.

### Fluxo antigo

1. Frontend chama `rate-guard`.
2. Frontend chama diretamente `supabase.auth.signInWithPassword()`.

Risco: atacante pode ignorar frontend e atacar endpoint público de login diretamente.

---

## Sintomas observados

- Mensagem no app: `Não autorizado`.
- Network: `POST /functions/v1/secure-login` retornando `401`.
- Em tentativas anteriores: `Missing authorization header` em funções pré-auth.

---

## Causa raiz

Foram identificadas duas causas principais:

1. **Validação inadequada para contexto pré-auth**
   - Funções de pré-login não podem depender de JWT obrigatório.

2. **Validação rígida de `apikey` no runtime de produção**
   - O fluxo real do navegador/runtime nem sempre preservou a expectativa da checagem rígida de header.
   - Resultado: `401` antes da autenticação, mesmo para usuários legítimos.

---

## Solução aplicada

### 1) Nova função `secure-login`

- Recebe `{ email, password }`.
- Rate limit server-side por IP usando RPC `increment_request_counter`.
- Limite atual: `10 tentativas / 60s` por IP.
- Se exceder: retorna `429` e não tenta autenticar.
- Em credencial inválida: retorna `401` genérico (`Credenciais inválidas`).
- Em sucesso: retorna payload compatível com sessão/MFA do Supabase.

### 2) Ajustes de compatibilidade

- Função configurada para uso **pré-auth** (sem exigir JWT de entrada).
- Removido bloqueio rígido por `apikey` na borda da função para evitar falso `401` em produção.

### 3) Frontend atualizado

- Login agora chama `supabase.functions.invoke('secure-login')` em vez de `signInWithPassword` direto.
- Em sucesso, define sessão via `supabase.auth.setSession({ access_token, refresh_token })`.
- Mantido fluxo de MFA já existente.

---

## Segurança após correção

### O que permanece protegido

- Brute force mitigado no backend por IP antes de autenticação.
- Resposta de erro de credenciais permanece genérica (sem enumeração de usuário).
- Controle de janela e contagem mantido por RPC no banco.

### Trade-off atual

- A checagem rígida de `apikey` em `secure-login` foi relaxada para restaurar disponibilidade.
- A defesa principal (rate limit server-side) continua ativa.

---

## Recomendações de hardening (próxima etapa)

1. Limite composto por `IP + email` (reduz abuso distribuído).
2. Bloqueio progressivo (ex.: 10/min, 50/h, cooldown).
3. CAPTCHA após N falhas.
4. Alertas automáticos quando houver pico de `429`.
5. Revisar novamente validação de origem/header com estratégia compatível com runtime real.

---

## Validação funcional pós-incidente

Checklist mínimo:

- [x] Usuário válido consegue logar.
- [x] Senha inválida retorna `401` genérico.
- [x] Excesso de tentativas retorna `429`.
- [x] Sessão e MFA seguem funcionando.

---

## Conclusão

O incidente foi causado por validação de entrada incompatível com o fluxo real de pré-autenticação em produção.

A correção restabeleceu o login e preservou a mitigação crítica de brute force no backend, eliminando a dependência exclusiva do frontend para proteção de tentativas.
