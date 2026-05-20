# MercadoPago Apuração Rules — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Patch classificação MercadoPago em `api/apuracao.ts` — sem afetar outros bancos

---

## Goal

Corrigir a classificação de transações do extrato MercadoPago para que:
- **INCLUAM** apenas: PIX recebido, depósitos, TED recebida, DOC recebido, pagamentos recebidos, vendas, QR recebidos
- **EXCLUAM** sempre: rendimentos diários, investimentos, poupança, renda fixa/variável, CDB/LCI/LCA/Tesouro, fundos

O problema atual é que rendimentos (yield diário do MercadoPago) estão sendo classificados como `credito_valido`. Nenhuma alteração afeta outros bancos.

---

## Architecture

### Approach: Targeted Keyword Patches

Três mudanças cirúrgicas em `api/apuracao.ts`, todas confinadas ao caminho MercadoPago:

1. **`MERCADO_PAGO_KEYWORDS_CREDITO_NORM`** — adicionar keywords de depósito/TED/DOC
2. **`MERCADO_PAGO_KEYWORDS_IGNORAR_NORM`** — adicionar keywords de rendimento/investimento faltantes
3. **`pularAutoTransferMercadoPago`** — expandir regex para cobrir todos os tipos de crédito válido

### Isolation Guarantee

- `MERCADO_PAGO_KEYWORDS_CREDITO_NORM` e `MERCADO_PAGO_KEYWORDS_IGNORAR_NORM` são arrays usados exclusivamente por `isMercadoPagoCredito()` e `isMercadoPagoIgnorar()`
- Essas funções são chamadas apenas no branch `bankDetected === 'mercadopago'` (linhas 639 e 663)
- `pularAutoTransferMercadoPago` tem guarda `bankDetected === 'mercadopago'` (linha 676)
- **Zero impacto** em: nubank, inter, neon, bradesco, itau_mensal, santander, pagbank, next, picpay_pix, generic

### Classification Order (unchanged)

```
1. Aposta global (KEYWORDS_APOSTAS_EXATAS) — linha 630     ← não muda
2. isMercadoPagoIgnorar(descNorm)           — linha 639     ← recebe +10 keywords
3. deveIgnorarRendimento(descNorm)          — linha 643     ← não muda
4. ehDescricaoGenericaOuRuido(descNorm)     — linha 648     ← não muda
5. ehLinhaResumoMensal(descNorm)            — linha 653     ← não muda
6. ehDebitoPorContextoDescricao(descNorm)   — linha 658     ← não muda
7. isMercadoPagoCredito(descNorm)           — linha 663     ← recebe +5 keywords
8. pularAutoTransferMercadoPago             — linha 676     ← regex expandido
9. Auto-transferência / match cliente       — linha 690+    ← não muda
10. credito_valido                          — linha 704+    ← não muda
```

O ignore check (passo 2) roda antes do credit check (passo 7) — qualquer descrição com keywords de ambas as listas será **ignorada** pelo passo 2 antes de ser aceita. Sem conflito.

---

## Changes

### 1. `MERCADO_PAGO_KEYWORDS_CREDITO_NORM` (linha ~230)

Adicionar ao array existente:

```typescript
'DEPOSITO',
'DEPOSITO RECEBIDO',
'TED RECEBIDA',
'TED RECEBIDO',
'DOC RECEBIDO',
```

### 2. `MERCADO_PAGO_KEYWORDS_IGNORAR_NORM` (linha ~245)

Adicionar ao array existente:

```typescript
'RENDEU',           // "Seu dinheiro rendeu", "Dinheiro rendeu" (yield diário)
'REMUNERACAO',      // remuneração de conta/investimento
'POUPANCA',         // poupança
'RENDA FIXA',       // investimento renda fixa
'RENDA VARIAVEL',   // investimento renda variável
'CDB',              // certificado de depósito bancário
// LCI/LCA removidos: são substrings de nomes comuns ("ALCIDES" contém "LCI")
// Cobertos pelos já existentes INVESTIMENTO + RESGATE
'FUNDO',            // fundo de investimento
'TESOURO',          // Tesouro Direto
```

### 3. `pularAutoTransferMercadoPago` (linha ~676–678)

**Antes:**
```typescript
const pularAutoTransferMercadoPago =
    bankDetected === 'mercadopago' &&
    /TRANSFERENCIA\s+PIX\s+RECEBIDA|DINHEIRO\s+RECEBIDO|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO/.test(descNorm);
```

**Depois:**
```typescript
const pularAutoTransferMercadoPago =
    bankDetected === 'mercadopago' &&
    /TRANSFERENCIA\s+PIX\s+RECEBIDA|DINHEIRO\s+RECEBIDO|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO|PIX\s+RECEBID|TRANSFERENCIA\s+RECEBIDA|DEPOSITO|TED\s+RECEBID|DOC\s+RECEBID/.test(descNorm);
```

---

## Data Flow

```
Extrato MercadoPago (PDF → texto)
  → extrairMercadoPago() — parsing (sem mudança)
    → classificar(dataRaw, descricaoRaw, valorRaw, ctx, 'mercadopago')
      → passo 2: isMercadoPagoIgnorar() — RENDEU/POUPANCA/CDB/etc → ignorar_estorno
      → passo 7: isMercadoPagoCredito() — DEPOSITO/TED/DOC → aceita
      → passo 8: pularAutoTransferMercadoPago — evita falsos negativos
      → passo 10: credito_valido
```

---

## Out of Scope

- Parsing (`extrairMercadoPago`, `extrairMercadoPagoPorBloco`, `extrairMercadoPagoUltraFallback`) — sem mudança
- Detecção do banco (`isMercadoPagoBank`) — sem mudança
- Qualquer outro banco — zero alteração
- Lógica de apostas — já coberta pelo filtro global (linhas 630–636)
- Nenhuma alteração em lógica de negócio, APIs, Supabase, roteamento ou estado

---

## Testing Approach

1. Subir servidor local: `npm run dev` ou `npx vercel dev`
2. Processar um extrato MercadoPago real via UI
3. Verificar que rendimentos diários ("Seu dinheiro rendeu", etc.) aparecem como `ignorar_estorno`
4. Verificar que PIX recebidos, TED, depósitos aparecem como `credito_valido`
5. Processar um extrato de outro banco (Nubank, Inter, etc.) e confirmar que o resultado é idêntico ao atual

---

## Success Criteria

- Rendimentos do MercadoPago classificados como `ignorar_estorno` (nunca `credito_valido`)
- PIX recebido, depósitos, TED/DOC recebidos classificados como `credito_valido`
- Todos os outros bancos: comportamento 100% idêntico ao atual
- Somente `api/apuracao.ts` modificado — exatamente 3 locais dentro do arquivo
