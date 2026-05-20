# MercadoPago Apuração Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir classificação de transações MercadoPago para excluir rendimentos/investimentos e incluir depósitos, TED e DOC recebidos.

**Architecture:** Três edições cirúrgicas em `api/apuracao.ts`: (1) adicionar keywords de crédito no array `MERCADO_PAGO_KEYWORDS_CREDITO_NORM`, (2) adicionar keywords de exclusão em `MERCADO_PAGO_KEYWORDS_IGNORAR_NORM`, (3) expandir o regex `pularAutoTransferMercadoPago`. Nenhuma alteração afeta outros bancos.

**Tech Stack:** TypeScript, Vercel Edge Function — sem build step para testar (validação via TypeScript `tsc --noEmit`).

---

## File Structure

| Arquivo | Ação | Localização exata |
|---|---|---|
| `api/apuracao.ts` | Modify | Linhas ~230–254 (arrays de keyword) e linha ~676–678 (regex) |

---

### Task 1: Adicionar keywords de crédito (DEPOSITO, TED, DOC)

**Files:**
- Modify: `api/apuracao.ts:230-243`

- [ ] **Step 1: Ler o array atual para confirmar localização**

Abra `api/apuracao.ts` e localize o array `MERCADO_PAGO_KEYWORDS_CREDITO_NORM` (em torno da linha 230). Deve estar assim:

```typescript
const MERCADO_PAGO_KEYWORDS_CREDITO_NORM = [
    'DINHEIRO RECEBIDO',
    'PAGAMENTO RECEBIDO',
    'PIX RECEBIDO',
    'PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA',
    'TRANSFERENCIA PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA VIA PIX',
    'RECEBIMENTO',
    'REEMBOLSO RECEBIDO',
    'ESTORNO RECEBIDO',
    'VENDA',
    'QR RECEBIDO',
].map(normalizar);
```

- [ ] **Step 2: Adicionar as 5 novas keywords de crédito**

Substitua o array completo por:

```typescript
const MERCADO_PAGO_KEYWORDS_CREDITO_NORM = [
    'DINHEIRO RECEBIDO',
    'PAGAMENTO RECEBIDO',
    'PIX RECEBIDO',
    'PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA',
    'TRANSFERENCIA PIX RECEBIDA',
    'TRANSFERENCIA RECEBIDA VIA PIX',
    'RECEBIMENTO',
    'REEMBOLSO RECEBIDO',
    'ESTORNO RECEBIDO',
    'VENDA',
    'QR RECEBIDO',
    'DEPOSITO',
    'DEPOSITO RECEBIDO',
    'TED RECEBIDA',
    'TED RECEBIDO',
    'DOC RECEBIDO',
].map(normalizar);
```

- [ ] **Step 3: Verificar TypeScript compila sem erros**

```powershell
npx tsc --noEmit --skipLibCheck
```

Expected: sem erros. Se houver erros não relacionados à sua mudança, ignore (o arquivo tem 3236 linhas e pode ter erros pré-existentes de outras áreas). Erros **na sua mudança** devem ser corrigidos.

- [ ] **Step 4: Commit**

```bash
git add api/apuracao.ts
git commit -m "feat(apuracao): add DEPOSITO, TED and DOC received to MP credit keywords"
```

---

### Task 2: Adicionar keywords de exclusão (rendimentos, investimentos)

**Files:**
- Modify: `api/apuracao.ts:245-254`

- [ ] **Step 1: Ler o array atual para confirmar localização**

Localize `MERCADO_PAGO_KEYWORDS_IGNORAR_NORM` (em torno da linha 245). Deve estar assim:

```typescript
const MERCADO_PAGO_KEYWORDS_IGNORAR_NORM = [
    'SEU DINHEIRO RENDEU',
    'RENDIMENTO',
    'RENDIMENTOS',
    'RESGATE',
    'INVESTIMENTO',
    'APLICACAO',
    'PAGAMENTO APROVADO',
    'PAGAMENTO ENVIADO',
].map(normalizar);
```

- [ ] **Step 2: Adicionar as 8 novas keywords de exclusão**

Substitua o array completo por:

```typescript
const MERCADO_PAGO_KEYWORDS_IGNORAR_NORM = [
    'SEU DINHEIRO RENDEU',
    'RENDIMENTO',
    'RENDIMENTOS',
    'RESGATE',
    'INVESTIMENTO',
    'APLICACAO',
    'PAGAMENTO APROVADO',
    'PAGAMENTO ENVIADO',
    // Yield diário e instrumentos de investimento
    'RENDEU',        // "Dinheiro rendeu", variação sem "Seu"
    'REMUNERACAO',   // remuneração de conta
    'POUPANCA',      // poupança
    'RENDA FIXA',    // investimento renda fixa
    'RENDA VARIAVEL',// investimento renda variável
    'CDB',           // certificado de depósito bancário
    'FUNDO',         // fundo de investimento
    'TESOURO',       // Tesouro Direto
].map(normalizar);
```

> **Nota:** LCI e LCA foram intencionalmente omitidos — são substrings de nomes comuns (ex: "ALCIDES" contém "LCI"), o que causaria falsos positivos em PIX recebidos. Já são cobertos pelos existentes INVESTIMENTO e RESGATE.

- [ ] **Step 3: Verificar TypeScript compila sem erros**

```powershell
npx tsc --noEmit --skipLibCheck
```

Expected: sem erros na região editada.

- [ ] **Step 4: Commit**

```bash
git add api/apuracao.ts
git commit -m "feat(apuracao): add rendimento/investimento keywords to MP ignore list"
```

---

### Task 3: Expandir regex pularAutoTransferMercadoPago

**Files:**
- Modify: `api/apuracao.ts:676-678`

- [ ] **Step 1: Localizar o regex atual**

Procure por `pularAutoTransferMercadoPago` no arquivo (em torno da linha 676). Deve estar assim:

```typescript
const pularAutoTransferMercadoPago =
    bankDetected === 'mercadopago' &&
    /TRANSFERENCIA\s+PIX\s+RECEBIDA|DINHEIRO\s+RECEBIDO|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO/.test(descNorm);
```

**Contexto:** Este regex controla quais transações pulam a verificação de auto-transferência (que checa se o nome do cliente aparece na descrição). Se um PIX recebido ou TED recebido não estiver no regex, o sistema pode erroneamente classificar como auto-transferência quando o nome do cliente coincidir com o pagador.

- [ ] **Step 2: Expandir o regex para cobrir todos os tipos de crédito válido**

Substitua as 3 linhas por:

```typescript
const pularAutoTransferMercadoPago =
    bankDetected === 'mercadopago' &&
    /TRANSFERENCIA\s+PIX\s+RECEBIDA|DINHEIRO\s+RECEBIDO|PAGAMENTO\s+RECEBIDO|QR\s+RECEBIDO|PIX\s+RECEBID|TRANSFERENCIA\s+RECEBIDA|DEPOSITO|TED\s+RECEBID|DOC\s+RECEBID/.test(descNorm);
```

> **Por que `PIX\s+RECEBID` (sem A/O)?** Cobre tanto "PIX RECEBIDO" quanto "PIX RECEBIDA" com um único padrão.
> **Por que `TED\s+RECEBID`?** Cobre "TED RECEBIDA" e "TED RECEBIDO".
> **Por que `DOC\s+RECEBID`?** Idem para DOC.

- [ ] **Step 3: Verificar TypeScript compila sem erros**

```powershell
npx tsc --noEmit --skipLibCheck
```

Expected: sem erros na região editada.

- [ ] **Step 4: Commit**

```bash
git add api/apuracao.ts
git commit -m "feat(apuracao): expand MP auto-transfer skip regex to include all credit types"
```

---

### Task 4: Verificação final e push

- [ ] **Step 1: Confirmar exatamente 3 locais modificados**

```bash
git diff HEAD~3 -- api/apuracao.ts | grep "^+" | grep -v "^+++"
```

Expected: linhas adicionadas apenas nas 3 regiões: `MERCADO_PAGO_KEYWORDS_CREDITO_NORM`, `MERCADO_PAGO_KEYWORDS_IGNORAR_NORM`, e `pularAutoTransferMercadoPago`.

- [ ] **Step 2: Confirmar que outros bancos não foram afetados**

```bash
git diff HEAD~3 -- api/apuracao.ts | grep -E "nubank|inter|neon|bradesco|itau|santander|pagbank|next|picpay"
```

Expected: **nenhuma linha** deve aparecer — nenhuma linha com esses nomes foi alterada.

- [ ] **Step 3: Push para Vercel deployar**

```bash
git push
```

Expected: push aceito, Vercel inicia deploy automático.
