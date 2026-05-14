# Mobile Visual Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three mobile UI regressions — Dashboard period selector, Clientes stage filter, and Agenda calendar view — without breaking any existing functionality or desktop layouts.

**Architecture:** Each fix uses Tailwind's `md` breakpoint (`768px`) to conditionally render a mobile-optimised layout alongside the existing desktop one. Below `md` the mobile version renders, above `md` the desktop version renders. All state is shared — no duplication of logic.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Vite, lucide-react, date-fns

---

## Files Modified

| File | What changes |
|------|-------------|
| `src/pages/Dashboard.tsx` | Add `mobilePeriodOpen` state; wrap period selector in mobile/desktop blocks |
| `src/pages/Clients.tsx` | Add `moreDropdownOpen` state; wrap stage filter in mobile/desktop blocks |
| `src/pages/Schedule.tsx` | Add `Filter` import; wrap entire body in mobile/desktop blocks |

---

## Task 1: Dashboard — Mobile Period Selector

**Files:**
- Modify: `src/pages/Dashboard.tsx:21-23` (add state)
- Modify: `src/pages/Dashboard.tsx:140-177` (replace period selector section)

- [ ] **Step 1: Add `mobilePeriodOpen` state**

In `src/pages/Dashboard.tsx`, after line 23 (after `const [customEndDate, setCustomEndDate] = useState('');`), add:

```tsx
const [mobilePeriodOpen, setMobilePeriodOpen] = useState(false);
```

- [ ] **Step 2: Replace the period selector section (lines 140–177)**

Find this block:

```tsx
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'este_mes', label: 'Este mês' },
            { id: '30_dias', label: '30 dias' },
            { id: '60_dias', label: '60 dias' },
            { id: '90_dias', label: '90 dias' },
            { id: 'custom', label: 'Personalizado' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id as typeof period)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${period === opt.id
                ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-full p-2.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-300 text-sm text-text-primary"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-full p-2.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-300 text-sm text-text-primary"
            />
          </div>
        )}
      </section>
```

Replace with:

```tsx
      <section className="space-y-3">
        {/* ── Mobile period selector (below md) ──────────────────────────── */}
        <div className="flex gap-2 items-center md:hidden">
          {(['este_mes', '30_dias'] as const).map(id => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                period === id
                  ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
              }`}
            >
              {id === 'este_mes' ? 'Este mês' : '30 dias'}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setMobilePeriodOpen(o => !o)}
              className={`flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                ['60_dias', '90_dias', 'custom'].includes(period)
                  ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
              }`}
            >
              {period === '60_dias'
                ? '60 dias'
                : period === '90_dias'
                ? '90 dias'
                : period === 'custom'
                ? 'Person.'
                : 'Mais'}
              <ChevronDown size={11} className={`transition-transform ${mobilePeriodOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobilePeriodOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMobilePeriodOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-20 bg-card-bg border border-surface-200 rounded-2xl shadow-lg py-1.5 min-w-[160px]">
                  {[
                    { id: '60_dias' as const, label: '60 dias' },
                    { id: '90_dias' as const, label: '90 dias' },
                    { id: 'custom'  as const, label: 'Personalizado' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setPeriod(opt.id); setMobilePeriodOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-surface-50 ${
                        period === opt.id ? 'text-gold-600 font-bold' : 'text-text-primary'
                      }`}
                    >
                      {opt.label}
                      {period === opt.id && <span className="ml-1 text-gold-500">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Desktop period selector (md and above) ─────────────────────── */}
        <div className="hidden md:flex flex-wrap gap-2">
          {[
            { id: 'este_mes' as const, label: 'Este mês' },
            { id: '30_dias'  as const, label: '30 dias' },
            { id: '60_dias'  as const, label: '60 dias' },
            { id: '90_dias'  as const, label: '90 dias' },
            { id: 'custom'   as const, label: 'Personalizado' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                period === opt.id
                  ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                  : 'bg-card-bg text-text-secondary border-surface-200 hover:border-gold-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom date inputs (both breakpoints) */}
        {period === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-full p-2.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-300 text-sm text-text-primary"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-full p-2.5 bg-surface-50 rounded-xl border border-surface-200 focus:ring-2 focus:ring-gold-300 text-sm text-text-primary"
            />
          </div>
        )}
      </section>
```

- [ ] **Step 3: Verify `ChevronDown` is already imported**

Check line 3 of Dashboard.tsx. The existing imports are from `lucide-react`. `ChevronDown` is NOT currently imported — add it:

```tsx
import { Loader2, Users, TrendingUp, Target, Calendar, Building2, ChevronDown } from 'lucide-react';
```

- [ ] **Step 4: Build check**

```bash
cd /c/Users/hokma/OneDrive/Desktop/Projetos/KAIZEN-AXIS
npm run lint
```

Expected: no TypeScript errors.

- [ ] **Step 5: Manual verify**

Run `npm run dev`, open browser at `http://localhost:3000`, navigate to Dashboard. Resize window below 768px — confirm 3 elements in one row. Resize above 768px — confirm original 5 buttons. Test all period buttons in both breakpoints update the stats cards.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(mobile): compact period selector on Dashboard for small screens"
```

---

## Task 2: Clientes — Mobile Stage Filter

**Files:**
- Modify: `src/pages/Clients.tsx:321` (add state)
- Modify: `src/pages/Clients.tsx:487-547` (replace stage filter)

- [ ] **Step 1: Add `moreDropdownOpen` state**

In `src/pages/Clients.tsx`, after line 321 (`const [stageDropdownOpen, setStageDropdownOpen] = useState(false);`), add:

```tsx
const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
```

- [ ] **Step 2: Replace the stage filter block (lines 486–547)**

Find this block:

```tsx
          {/* Stage Filter Chips */}
          <div className="pt-2 pb-2 px-4 flex gap-1.5 flex-wrap items-center">
            {/* Chip: Todos */}
            <button
              onClick={() => setActiveStage('Todos')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeStage === 'Todos'
                ? 'bg-gold-500 text-white shadow-md'
                : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
            >
              Todos ({clients.length})
            </button>

            {/* Chips primários */}
            {PRIMARY_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeStage === stage
                  ? 'bg-gold-500 text-white shadow-md'
                  : 'bg-card-bg text-text-secondary border border-surface-200'
                  }`}
              >
                {stage}
              </button>
            ))}

            {/* Dropdown "Outros" para etapas pós-contrato */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setStageDropdownOpen(o => !o)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeIsSecondary
                    ? 'bg-gold-500 text-white shadow-md'
                    : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
              >
                {activeIsSecondary ? activeStage : 'Outros'}
                <ChevronDown size={11} className={`transition-transform ${stageDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {stageDropdownOpen && (
                <>
                  {/* Overlay para fechar */}
                  <div className="fixed inset-0 z-10" onClick={() => setStageDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-card-bg border border-surface-200 rounded-2xl shadow-lg py-1.5 min-w-[160px]">
                    {SECONDARY_STAGES.map(stage => (
                      <button
                        key={stage}
                        onClick={() => { setActiveStage(stage); setStageDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-surface-50 ${
                          activeStage === stage ? 'text-gold-600 font-bold' : 'text-text-primary'
                        }`}
                      >
                        {stage}
                        {activeStage === stage && <span className="ml-1 text-gold-500">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
```

Replace with:

```tsx
          {/* Stage Filter Chips */}

          {/* ── Mobile filter (below md): Todos + Documentação + Mais ▼ ───── */}
          <div className="md:hidden pt-2 pb-2 px-4 flex gap-1.5 items-center">
            {/* Todos */}
            <button
              onClick={() => setActiveStage('Todos')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeStage === 'Todos'
                  ? 'bg-gold-500 text-white shadow-md'
                  : 'bg-card-bg text-text-secondary border border-surface-200'
              }`}
            >
              Todos ({clients.length})
            </button>

            {/* Documentação — always visible on mobile */}
            <button
              onClick={() => setActiveStage('Documentação')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeStage === 'Documentação'
                  ? 'bg-gold-500 text-white shadow-md'
                  : 'bg-card-bg text-text-secondary border border-surface-200'
              }`}
            >
              Documentação
            </button>

            {/* Mais ▼ — opens grid with all remaining stages */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMoreDropdownOpen(o => !o)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeStage !== 'Todos' && activeStage !== 'Documentação'
                    ? 'bg-gold-500 text-white shadow-md'
                    : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
              >
                {activeStage !== 'Todos' && activeStage !== 'Documentação'
                  ? activeStage.length > 8 ? activeStage.slice(0, 8) + '…' : activeStage
                  : 'Mais'}
                <ChevronDown size={11} className={`transition-transform ${moreDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-card-bg border border-surface-200 rounded-2xl shadow-lg p-3 min-w-[220px]">
                    {/* Primary stages (excluding Documentação already pinned) */}
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {PRIMARY_STAGES.filter(s => s !== 'Documentação').map(stage => (
                        <button
                          key={stage}
                          onClick={() => { setActiveStage(stage); setMoreDropdownOpen(false); }}
                          className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-colors text-center ${
                            activeStage === stage
                              ? 'bg-gold-500 text-white'
                              : 'bg-surface-50 text-text-primary hover:bg-surface-100'
                          }`}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                    {/* Divider + secondary stages */}
                    <div className="border-t border-surface-200 pt-2">
                      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5 px-1">Outros</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {SECONDARY_STAGES.map(stage => (
                          <button
                            key={stage}
                            onClick={() => { setActiveStage(stage); setMoreDropdownOpen(false); }}
                            className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-colors text-center ${
                              activeStage === stage
                                ? 'bg-gold-500 text-white'
                                : 'bg-surface-50 text-text-primary hover:bg-surface-100'
                            }`}
                          >
                            {stage}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Desktop filter (md and above): all pills + Outros dropdown ── */}
          <div className="hidden md:flex pt-2 pb-2 px-4 gap-1.5 flex-wrap items-center">
            {/* Chip: Todos */}
            <button
              onClick={() => setActiveStage('Todos')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeStage === 'Todos'
                ? 'bg-gold-500 text-white shadow-md'
                : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
            >
              Todos ({clients.length})
            </button>

            {/* Chips primários */}
            {PRIMARY_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeStage === stage
                  ? 'bg-gold-500 text-white shadow-md'
                  : 'bg-card-bg text-text-secondary border border-surface-200'
                  }`}
              >
                {stage}
              </button>
            ))}

            {/* Dropdown "Outros" para etapas pós-contrato */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setStageDropdownOpen(o => !o)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeIsSecondary
                    ? 'bg-gold-500 text-white shadow-md'
                    : 'bg-card-bg text-text-secondary border border-surface-200'
                }`}
              >
                {activeIsSecondary ? activeStage : 'Outros'}
                <ChevronDown size={11} className={`transition-transform ${stageDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {stageDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStageDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-card-bg border border-surface-200 rounded-2xl shadow-lg py-1.5 min-w-[160px]">
                    {SECONDARY_STAGES.map(stage => (
                      <button
                        key={stage}
                        onClick={() => { setActiveStage(stage); setStageDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-surface-50 ${
                          activeStage === stage ? 'text-gold-600 font-bold' : 'text-text-primary'
                        }`}
                      >
                        {stage}
                        {activeStage === stage && <span className="ml-1 text-gold-500">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
```

- [ ] **Step 3: Build check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Open `/clients` in browser. At mobile width (<768px): confirm 3 elements on 1 line. Open "Mais ▼": confirm grid with Em Análise through Contrato + Outros section. Selecting a stage: confirm list filters correctly. Desktop width: confirm all pills visible as before.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Clients.tsx
git commit -m "fix(mobile): compact stage filter on Clientes for small screens"
```

---

## Task 3: Agenda — Mobile Day View

**Files:**
- Modify: `src/pages/Schedule.tsx:1` (add `Filter` to imports)
- Modify: `src/pages/Schedule.tsx:166-394` (wrap body in mobile/desktop blocks)

- [ ] **Step 1: Add `Filter` to lucide-react import**

Find line 2 of `src/pages/Schedule.tsx`:

```tsx
import { Calendar as CalendarIcon, MapPin, Plus, Loader2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
```

Replace with:

```tsx
import { Calendar as CalendarIcon, MapPin, Plus, Loader2, ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react';
```

- [ ] **Step 2: Replace the entire return block**

Find the `return (` at line 166. The entire JSX from `return (` to the closing `);` needs to be replaced with the version below that adds a `md:hidden` mobile block and wraps the existing desktop block in `hidden md:flex`.

Replace the return block (lines 166 to end of component, before the closing `}`) with:

```tsx
  return (
    <div className="-mx-2 sm:-mx-4 lg:-mx-6 flex flex-col bg-white"
         style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on md+)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col h-full overflow-hidden">

        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">Agenda</h1>
          <div className="flex items-center gap-2">
            {/* Type filter icon */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={`p-2 rounded-xl border transition-colors ${
                  typeFilter !== 'Todos'
                    ? 'border-blue-400 bg-blue-50 text-blue-600'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Filter size={16} />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {(['Todos', 'Visita', 'Reunião', 'Assinatura', 'Outro'] as TypeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'
                      }`}
                    >
                      {t === 'Todos' ? 'Todos os tipos' : t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* New event */}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={14} /> Novo
            </button>
          </div>
        </div>

        {/* Week nav + selected date label */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="flex-1 text-center text-sm font-bold text-gray-800 capitalize">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Events for selected day */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={26} className="animate-spin text-blue-500" />
            </div>
          ) : selectedDayEvents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center gap-3">
              <CalendarIcon size={36} className="text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">Nenhum evento para este dia</p>
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus size={13} /> Novo Evento
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents.map(evt => (
                <div
                  key={evt.id}
                  className={`p-3 rounded-2xl border-l-4 bg-white shadow-sm ${
                    evt.type === 'Visita'     ? 'border-l-emerald-400' :
                    evt.type === 'Reunião'    ? 'border-l-blue-400'    :
                    evt.type === 'Assinatura' ? 'border-l-violet-400'  :
                                               'border-l-amber-400'
                  } ${evt.completed ? 'opacity-50' : ''}`}
                >
                  {canViewAllClients && (
                    <ClientHierarchyTags
                      ownerId={evt.user_id}
                      allProfiles={allProfiles}
                      teams={teams}
                      directorates={directorates}
                      className="mb-1.5"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${evt.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {evt.title}
                      </p>
                      {evt.client_name && (
                        <p className="text-xs text-gray-500 mt-0.5">{evt.client_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400">{evt.time}</span>
                        {evt.location && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <MapPin size={10} />{evt.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${TYPE_PILL[evt.type] ?? ''}`}>
                      {evt.type}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2.5 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleOpenModal(evt)}
                      className="text-xs text-gray-500 hover:text-blue-600 font-semibold transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleComplete(evt)}
                      className="text-xs text-gray-500 hover:text-emerald-600 font-semibold transition-colors"
                    >
                      {evt.completed ? 'Reabrir' : 'Concluir'}
                    </button>
                    <button
                      onClick={() => handleDelete(evt.id)}
                      className="text-xs text-gray-500 hover:text-red-500 font-semibold transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7-day strip at bottom */}
        <div className="border-t border-gray-100 bg-white px-2 py-2.5 flex-shrink-0">
          <div className="flex justify-between">
            {weekDays.map((day, i) => {
              const dateStr   = format(day, 'yyyy-MM-dd');
              const hasEvents = (byDate[dateStr] ?? []).length > 0;
              const isSelected = isSameDay(day, selectedDate);
              const isNow      = isSameDay(day, today);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1"
                >
                  <span className="text-[10px] font-bold text-gray-400">{DAY_ABBR[i]}</span>
                  <span className={`text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isNow
                      ? 'text-blue-600'
                      : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    hasEvents
                      ? isSelected ? 'bg-white' : 'bg-blue-400'
                      : 'bg-transparent'
                  }`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below md)
          ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:overflow-hidden">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie seus compromissos e visitas</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Type filter */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                {typeFilter === 'Todos' ? 'Todos os eventos' : typeFilter}
                <ChevronDown size={14} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              </button>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                  {(['Todos', 'Visita', 'Reunião', 'Assinatura', 'Outro'] as TypeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${typeFilter === t ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'}`}
                    >
                      {t === 'Todos' ? 'Todos os eventos' : t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New event */}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={15} /> Novo Evento
            </button>
          </div>
        </div>

        {/* ── Main area: grid + sidebar ──────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Calendar grid ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">

            {/* Month + week nav */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <button onClick={prevWeek}  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><ChevronLeft  size={15} /></button>
              <span className="text-sm font-bold text-gray-800 capitalize min-w-[148px] text-center">{monthLabel}</span>
              <button onClick={nextWeek}  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><ChevronRight size={15} /></button>
              <button onClick={goToToday} className="ml-1 px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Hoje</button>
            </div>

            {/* Day column headers */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              <div className="w-14 flex-shrink-0" />
              {weekDays.map((day, i) => {
                const sel   = isSameDay(day, selectedDate);
                const isNow = isSameDay(day, today);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-[10px] font-bold text-gray-400 tracking-wider">{DAY_ABBR[i]}</span>
                    <span className={`text-base font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                      isNow && sel  ? 'bg-blue-600 text-white' :
                      isNow         ? 'text-blue-600' :
                      sel           ? 'bg-blue-100 text-blue-700' :
                                      'text-gray-800'
                    }`}>{format(day, 'd')}</span>
                  </button>
                );
              })}
            </div>

            {/* Time grid (scrollable) */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-blue-500" /></div>
              ) : (
                HOURS.map(hour => (
                  <div key={hour} className="flex border-b border-gray-50 min-h-[52px] group">
                    {/* Hour label */}
                    <div className="w-14 flex-shrink-0 px-3 pt-2 text-right">
                      <span className="text-xs text-gray-300 font-medium">{`${String(hour).padStart(2,'0')}:00`}</span>
                    </div>

                    {/* Cells */}
                    {weekDays.map((day, di) => {
                      const sel   = isSameDay(day, selectedDate);
                      const cells = getCell(day, hour);
                      return (
                        <div
                          key={di}
                          onClick={() => {
                            setSelectedDate(day);
                            handleOpenModal(undefined, format(day, 'yyyy-MM-dd'), `${String(hour).padStart(2,'0')}:00`);
                          }}
                          className={`flex-1 border-l border-gray-50 px-0.5 py-0.5 cursor-pointer transition-colors ${
                            sel ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-gray-50/70'
                          }`}
                        >
                          {cells.map(evt => (
                            <div
                              key={evt.id}
                              onClick={e => { e.stopPropagation(); setSelectedDate(day); }}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate mb-0.5 ${
                                TYPE_BLOCK[evt.type] ?? 'bg-gray-100 text-gray-700 border-l-2 border-gray-400'
                              } ${evt.completed ? 'opacity-40' : ''}`}
                            >
                              {evt.time} {evt.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Right sidebar ──────────────────────────────────────── */}
          <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden bg-white">

            {/* Selected date header */}
            <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-blue-600">
                <CalendarIcon size={15} />
                <span className="text-sm font-bold capitalize">
                  {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
            </div>

            {/* Events for selected day */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              {selectedDayEvents.length === 0 ? (
                <div className="flex flex-col items-center py-5 text-center gap-2">
                  <CalendarIcon size={30} className="text-gray-200" />
                  <p className="text-xs text-gray-400 font-medium">Nenhum evento para este dia</p>
                  <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors mt-1"
                  >
                    <Plus size={11} /> Agendar
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedDayEvents.map(evt => (
                    <div
                      key={evt.id}
                      className={`p-2.5 rounded-xl border transition-all ${evt.completed ? 'opacity-50 bg-gray-50 border-gray-100' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'}`}
                    >
                      {canViewAllClients && (
                        <ClientHierarchyTags ownerId={evt.user_id} allProfiles={allProfiles} teams={teams} directorates={directorates} className="mb-1" />
                      )}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${evt.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{evt.title}</p>
                          {evt.client_name && <p className="text-[10px] text-gray-500 truncate mt-0.5">{evt.client_name}</p>}
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-gray-400">{evt.time}</span>
                            {evt.location && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate">
                                <MapPin size={8} />{evt.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${TYPE_PILL[evt.type] ?? ''}`}>{evt.type}</span>
                      </div>
                      <div className="flex gap-2.5 mt-2 pt-1.5 border-t border-gray-50">
                        <button onClick={() => handleOpenModal(evt)} className="text-[10px] text-gray-400 hover:text-blue-600 font-semibold transition-colors">Editar</button>
                        <button onClick={() => toggleComplete(evt)} className="text-[10px] text-gray-400 hover:text-emerald-600 font-semibold transition-colors">
                          {evt.completed ? 'Reabrir' : 'Concluir'}
                        </button>
                        <button onClick={() => handleDelete(evt.id)} className="text-[10px] text-gray-400 hover:text-red-500 font-semibold transition-colors">Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming events feed */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Próximos Eventos</h3>

              {upcomingEvents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Nenhum evento próximo</p>
              ) : (
                <div className="space-y-1">
                  {upcomingEvents.map(evt => {
                    const d = parseISO(evt.date);
                    return (
                      <button
                        key={evt.id}
                        onClick={() => { setSelectedDate(d); setWeekStart(startOfWeek(d, { weekStartsOn: 0 })); }}
                        className="w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                      >
                        <div className="flex-shrink-0 text-center w-8">
                          <div className="text-[9px] font-bold text-gray-400 uppercase leading-none">{format(d, 'MMM', { locale: ptBR })}</div>
                          <div className="text-lg font-black text-gray-800 leading-tight">{format(d, 'd')}</div>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{evt.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{evt.time}{evt.client_name ? ` · ${evt.client_name}` : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── Modal (shared between mobile and desktop) ─────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Título</label>
            <input
              value={formData.title ?? ''}
              onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Ex: Visita ao Decorado"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Cliente</label>
            <input
              value={formData.client_name ?? ''}
              onChange={e => setFormData(p => ({ ...p, client_name: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Nome do cliente"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={formData.date ?? ''}
                onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Hora</label>
              <input
                type="time"
                value={formData.time ?? ''}
                onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Local</label>
            <input
              value={formData.location ?? ''}
              onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-900"
              placeholder="Endereço ou local"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {(['Visita', 'Reunião', 'Assinatura', 'Outro'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFormData(p => ({ ...p, type }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    formData.type === type
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors mt-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? 'Salvando...' : editingAppointment ? 'Salvar Alterações' : 'Criar Agendamento'}
          </button>
        </div>
      </Modal>
    </div>
  );
```

- [ ] **Step 3: Build check**

```bash
npm run lint
```

Expected: no errors. If `Filter` is not found, double-check the lucide-react import from Step 1.

- [ ] **Step 4: Manual verify — mobile**

Open `/agenda` in browser. Resize to <768px:
- Confirm compact header with filter icon + "Novo" button
- Confirm selected date label between arrows
- Click left/right arrows — confirm week changes and strip updates
- Click different days in the strip — confirm events update
- Tap an event — confirm Editar/Concluir/Excluir buttons work
- Tap "+ Novo" — confirm modal opens and saves correctly

- [ ] **Step 5: Manual verify — desktop**

Resize to >768px — confirm original Google Calendar grid is exactly unchanged. Week navigation, day selection, sidebar all working.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Schedule.tsx
git commit -m "feat(mobile): add day-view layout for Agenda on small screens"
```
