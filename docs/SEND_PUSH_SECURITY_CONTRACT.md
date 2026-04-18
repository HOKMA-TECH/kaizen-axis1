# Send Push Security Contract

Data: 2026-04-17
Endpoint: `POST /functions/v1/send-push`

## Objetivo
Enviar notificacoes push para dispositivos inscritos do usuario alvo com controle de autenticacao, autorizacao por role e validacao de payload.

## Requisitos de autenticacao
- Header obrigatorio: `Authorization: Bearer <access_token>`.
- Header recomendado: `apikey: <anon_key>`.
- Token invalido, ausente, expirado ou adulterado: resposta `401 Unauthorized`.

## Requisitos de autorizacao
- Usuario autenticado precisa ter role em `public.profiles.role` dentro de:
  - `ADMIN`
  - `DIRETOR`
  - `GERENTE`
- Qualquer outra role: `403 Forbidden`.

## Rate limit
- Escopo: `send_push`.
- Chave de limitacao: `<caller_user_id>:<target_user_id>`.
- Limite: `20` requisicoes por `60` segundos.
- Excedeu limite: `429 Too many requests`.
- Falha de infraestrutura de rate-limit: `503 Rate limit unavailable` (fail-closed).

## Contrato de payload
- Content-Type: `application/json`.
- Corpo aceito: `notification` (ou `record`, para compatibilidade) com os campos abaixo.
- Campos permitidos:
  - `target_user_id` (obrigatorio, UUID valido)
  - `title` (opcional, string)
  - `message` (opcional, string)
  - `reference_route` (opcional, string)
- Campo obrigatorio ausente, UUID invalido ou chave inesperada: `422`.
- JSON malformado: `400`.

## Respostas esperadas
- `200` com envio executado:
  - `{ "sent": <number>, "failed": <number> }`
- `200` sem inscricoes:
  - `{ "sent": 0, "failed": 0, "note": "no subscriptions" }`
- `400` JSON invalido.
- `401` nao autenticado/token invalido.
- `403` role sem permissao.
- `422` payload invalido.
- `429` limite excedido.
- `500` erro interno.
- `503` rate limit indisponivel.

## Observacao operacional importante
- Para esta funcao, `Verify JWT` no gateway ficou desativado por incompatibilidade observada de algoritmo (`ES256`) no ambiente atual.
- A validacao de token e role ocorre dentro da funcao.
- Manter suite de testes de regressao no Postman para garantir comportamento esperado.

## Suite de testes recomendada (Postman)
Arquivo: `docs/postman/send-push-security-tests.postman_collection.json`

Cobertura minima:
1. Sem `Authorization` -> `401`
2. Token sem role permitida -> `403`
3. Token permitido -> `200`
4. Sem `target_user_id` -> `422`
5. Token adulterado -> `401`
6. Payload com campo inesperado -> `422`
