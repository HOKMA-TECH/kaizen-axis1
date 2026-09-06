# KAIZEN AXIS — produção viva

A partir de 2026-09, o app de produção **não está mais na Vercel nem no Supabase Cloud**.

## Destino obrigatório

| O quê | Onde |
|---|---|
| App público | `https://app.imobkaizen.com.br` (VPS Docker, porta `127.0.0.1:8400`) |
| API / Auth / Storage / Functions | `https://api-app.imobkaizen.com.br` (Supabase self-hosted na VPS) |
| Studio | `https://studio-app.imobkaizen.com.br` (Cloudflare Access) |
| Container | `imobkaizen-axis-production-app` |
| Imagem | `imobkaizen/axis-production:<commit>` via `IMOBKAIZEN-PLATFORM` |
| SSH | `hokma@mail.hokmatech.com` |

`https://kaizen-axis.space` e `www` são **só redirect 307** para `app.imobkaizen.com.br`. Não hospedam o app.

## Fazer

- Mudança de UI, API Node (`/api/apuracao`), PWA, migrations e Edge Functions: validar e publicar na **VPS**.
- Conferir o resultado em `https://app.imobkaizen.com.br`, não em `*.vercel.app` nem em `kaizen-axis.space`.
- Deploy do app: build da imagem Docker no repo `IMOBKAIZEN-PLATFORM` (`scripts/apps/build-production.sh axis-production` + compose `apps/production.compose.yml`). Não usar `npx vercel --prod` para feature nova.
- SQL/RPC: aplicar no Postgres self-hosted (`api-app`), não no dashboard `supabase.com` do projeto antigo.
- Functions: stack Axis na VPS, não `supabase functions deploy --project-ref pwvpxxrvlywlneuijmmd`.

## Não fazer

- Não publicar o app na Vercel. O projeto Vercel `kaizen-axis1` existe só para o redirect do domínio antigo.
- Não apontar `app.imobkaizen.com.br` de volta para a Vercel.
- Não religar Turnstile sem pedido explícito (login em break-glass de propósito).
- Não cancelar Vercel/Supabase Cloud sem autorização do dono (janela de rollback).
- Não tratar `DEPLOY_INSTRUCTIONS.md`, `README.md` e `documentacao/` como fonte de deploy se falarem em Vercel/`kaizen-axis.space` — estão desatualizados.

Docs de infra e cutover: `../IMOBKAIZEN-PLATFORM` (worktree `phase03-self-hosted-platform`).
