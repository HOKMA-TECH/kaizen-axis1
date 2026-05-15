# Dashboard Current Month Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard commission card show only sales from the vigente month, using the real sale closing date and preserving all existing commission behavior.

**Architecture:** Extract the sale period/date logic from `SalesProgressCard` into a small pure helper that can be tested without rendering React. The component will continue using the same commission rates and role scoping, but monthly filtering will use `closed_at` first and only fall back to `updated_at` for legacy records without `closed_at`.

**Tech Stack:** React, TypeScript, Vite, existing `tsx` one-file tests, Supabase client data already loaded in `AppContext`.

---

## Root Cause

The commission card in `src/components/dashboard/SalesProgressCard.tsx` filters sales with:

```ts
return isCurrentMonth((c as any).updated_at || (c as any).closed_at || c.createdAt);
```

That is unsafe because `updated_at` changes whenever an old completed client is edited, migrated, or touched by maintenance/security routines. After recent security updates, older completed sales can have `updated_at` in May 2026, so the card includes them in "Progresso do Mes" even if the actual sale closed in an earlier month.

The safer pattern already exists in `src/pages/Dashboard.tsx`:

```ts
const getSaleReferenceDate = (client: any): string | null => client?.closed_at || client?.updated_at || null;
```

The fix should align `SalesProgressCard` with that pattern, using `closed_at` as the canonical sale date.

## File Structure

- Create: `src/lib/sales/salePeriod.ts`
  - Pure helper for sale reference date and month filtering.
  - Keeps date logic testable and reusable by Dashboard/Reports later.

- Create: `src/lib/sales/salePeriod.test.ts`
  - Regression tests for old sales touched this month.
  - Tests can run with `npm.cmd exec -- tsx src/lib/sales/salePeriod.test.ts`.

- Modify: `src/components/dashboard/SalesProgressCard.tsx`
  - Replace local `isCurrentMonth` logic with `isSaleInCurrentMonth`.
  - Use the same helper for display date, so the card shows the sale closing date, not the last edit date.

---

### Task 1: Add Failing Regression Tests

**Files:**
- Create: `src/lib/sales/salePeriod.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/lib/sales/salePeriod.test.ts`:

```ts
import assert from 'node:assert/strict';
import { getSaleReferenceDate, isSaleInCurrentMonth } from './salePeriod';

type ClientLike = {
  stage?: string;
  createdAt?: string;
  closed_at?: string | null;
  updated_at?: string | null;
};

async function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const may2026 = new Date(2026, 4, 15, 12, 0, 0, 0);

await runTest('uses closed_at before updated_at for completed sales', () => {
  const oldSaleTouchedThisMonth: ClientLike = {
    stage: 'Concluído',
    closed_at: '2026-04-10T10:00:00.000Z',
    updated_at: '2026-05-15T10:00:00.000Z',
    createdAt: '2026-03-01T10:00:00.000Z',
  };

  assert.equal(getSaleReferenceDate(oldSaleTouchedThisMonth), '2026-04-10T10:00:00.000Z');
  assert.equal(isSaleInCurrentMonth(oldSaleTouchedThisMonth, may2026), false);
});

await runTest('includes completed sales closed in the current month', () => {
  const currentSale: ClientLike = {
    stage: 'Concluído',
    closed_at: '2026-05-02T10:00:00.000Z',
    updated_at: '2026-05-15T10:00:00.000Z',
  };

  assert.equal(isSaleInCurrentMonth(currentSale, may2026), true);
});

await runTest('falls back to updated_at only when closed_at is missing', () => {
  const legacyCurrentSale: ClientLike = {
    stage: 'Concluído',
    closed_at: null,
    updated_at: '2026-05-03T10:00:00.000Z',
  };

  assert.equal(getSaleReferenceDate(legacyCurrentSale), '2026-05-03T10:00:00.000Z');
  assert.equal(isSaleInCurrentMonth(legacyCurrentSale, may2026), true);
});

await runTest('ignores non-completed clients', () => {
  const approvedClient: ClientLike = {
    stage: 'Aprovado',
    closed_at: '2026-05-03T10:00:00.000Z',
    updated_at: '2026-05-03T10:00:00.000Z',
  };

  assert.equal(isSaleInCurrentMonth(approvedClient, may2026), false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm.cmd exec -- tsx src/lib/sales/salePeriod.test.ts
```

Expected result:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... src/lib/sales/salePeriod
```

This confirms the test is red because the helper does not exist yet.

---

### Task 2: Implement Sale Period Helper

**Files:**
- Create: `src/lib/sales/salePeriod.ts`

- [ ] **Step 1: Create the helper**

Create `src/lib/sales/salePeriod.ts`:

```ts
type SaleClientLike = {
  stage?: string | null;
  createdAt?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getSaleReferenceDate(client: SaleClientLike): string | null {
  return client.closed_at || client.updated_at || null;
}

export function isSameMonth(date: Date, referenceDate: Date): boolean {
  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth()
  );
}

export function isSaleInCurrentMonth(client: SaleClientLike, now = new Date()): boolean {
  if (client.stage !== 'Concluído') return false;

  const saleDate = parseDate(getSaleReferenceDate(client));
  if (!saleDate) return false;

  return isSameMonth(saleDate, now);
}
```

- [ ] **Step 2: Run the helper test**

Run:

```bash
npm.cmd exec -- tsx src/lib/sales/salePeriod.test.ts
```

Expected result:

```text
ok - uses closed_at before updated_at for completed sales
ok - includes completed sales closed in the current month
ok - falls back to updated_at only when closed_at is missing
ok - ignores non-completed clients
```

---

### Task 3: Update SalesProgressCard Filtering

**Files:**
- Modify: `src/components/dashboard/SalesProgressCard.tsx`

- [ ] **Step 1: Import the helper**

Near the existing imports, add:

```ts
import { getSaleReferenceDate, isSaleInCurrentMonth } from '@/lib/sales/salePeriod';
```

- [ ] **Step 2: Remove the local month helper**

Delete the local function:

```ts
function isCurrentMonth(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
```

- [ ] **Step 3: Replace the monthly sales filter**

Replace the current monthly filter:

```ts
const monthlySales = clients
  .filter(c => {
    if (c.stage !== 'Concluído') return false;
    if (role === 'DIRETOR' && directorateId && (c as any).directorate_id !== directorateId) return false;
    return isCurrentMonth((c as any).updated_at || (c as any).closed_at || c.createdAt);
  })
  .slice(0, 100);
```

With:

```ts
const monthlySales = clients
  .filter(c => {
    if (role === 'DIRETOR' && directorateId && (c as any).directorate_id !== directorateId) return false;
    return isSaleInCurrentMonth(c);
  })
  .slice(0, 100);
```

- [ ] **Step 4: Replace the displayed date source**

Replace:

```ts
const rawDate = (c as any).updated_at || (c as any).closed_at || c.createdAt;
```

With:

```ts
const rawDate = getSaleReferenceDate(c);
```

This makes the row display the sale date, not the last edit date.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm.cmd exec -- tsx src/lib/sales/salePeriod.test.ts
```

Expected result: all helper tests pass.

---

### Task 4: Production Safety Verification

**Files:**
- No source changes unless verification finds a regression.

- [ ] **Step 1: Run production build**

Run:

```bash
npm.cmd run build
```

Expected result:

```text
✓ built
```

Warnings about chunk size are acceptable if they match current project behavior.

- [ ] **Step 2: Manual QA with controlled records**

In a safe production-like account or local seeded data, verify these cases:

```text
Case A:
- Client stage: Concluído
- closed_at: 2026-04-10
- updated_at: 2026-05-15
- Expected in May 2026 card: NOT visible

Case B:
- Client stage: Concluído
- closed_at: 2026-05-10
- updated_at: 2026-05-15
- Expected in May 2026 card: visible

Case C:
- Client stage: Concluído
- closed_at: null
- updated_at: 2026-05-10
- Expected in May 2026 card: visible as legacy fallback

Case D:
- Client stage: Aprovado
- closed_at: 2026-05-10
- updated_at: 2026-05-10
- Expected in May 2026 card: NOT visible
```

- [ ] **Step 3: Verify role behavior did not change**

Check the card as:

```text
CORRETOR:
- only own visible clients from RLS/app context
- own commission rate unchanged

COORDENADOR / GERENTE:
- own/team split unchanged
- only current-month sale records appear

DIRETOR:
- directorate filter remains active
- only current-month sale records from own directorate appear
```

- [ ] **Step 4: Commit only these files**

Run:

```bash
git add -- src/lib/sales/salePeriod.ts src/lib/sales/salePeriod.test.ts src/components/dashboard/SalesProgressCard.tsx
git commit -m "Fix dashboard commissions current month filter"
```

Do not include unrelated workspace files such as security reports, Supabase temp files, or editor settings.

---

## Rollout Notes

- This is a frontend-only logic correction; no database migration is required.
- The change is low blast radius because it touches only the commission card and a pure helper.
- Existing Dashboard cards already calculate period sales with `closed_at || updated_at`; this plan aligns the commission card with that safer behavior.
- The fallback to `updated_at` remains only for legacy sales missing `closed_at`, preserving old data visibility without reintroducing the bug.

## Self-Review

- Spec coverage: The plan fixes the commission board to show only the vigente month, keeps existing commissions, and preserves role scoping.
- Placeholder scan: No placeholders or TBD steps remain.
- Type consistency: `getSaleReferenceDate`, `isSaleInCurrentMonth`, and `SaleClientLike` are consistently named across tests and implementation.
