# Design: Correções Visuais Mobile
**Data:** 2026-05-14  
**Escopo:** Dashboard (seletor de período), Clientes (filtro de etapas), Agenda (layout mobile)  
**Constraint:** App em produção — zero quebra de funcionalidade; desktop inalterado

---

## 1. Dashboard — Seletor de Período Mobile

### Problema
5 botões em `flex flex-wrap` quebram em 2 linhas no mobile (Este mês, 30 dias, 60 dias, 90 dias, Personalizado).

### Solução
Abaixo de `md`: substituir pelos 2 pills fixos mais frequentes + dropdown colapsável com os restantes.  
Acima de `md`: comportamento atual mantido (5 botões em linha).

**Layout mobile:**
```
[ Este mês ]  [ 30 dias ]  [ ▼ ]
                              └─ 60 dias
                              └─ 90 dias
                              └─ Personalizado
```

**Regras:**
- "Este mês" e "30 dias" sempre visíveis como pills
- Dropdown mostra 60 dias, 90 dias, Personalizado em lista vertical
- Se período ativo for um dos 3 do dropdown, o botão `▼` fica dourado e exibe o label ativo
- Quando "Personalizado" selecionado, exibe os date inputs abaixo (comportamento atual)
- Implementação: dois blocos condicionais `md:hidden` / `hidden md:flex` no mesmo componente

**Arquivo:** `src/pages/Dashboard.tsx`

---

## 2. Clientes — Filtro de Etapas Mobile

### Problema
9 pills primários + dropdown "Outros" em `flex flex-wrap` quebram em 3+ linhas no mobile.

### Solução
Abaixo de `md`: 2 pills fixos + botão "Mais ▼" com grade 2 colunas.  
Acima de `md`: comportamento atual mantido.

**Layout mobile:**
```
[ Todos (682) ]  [ Documentação ]  [ Mais ▼ ]
                                        └─ grid 2 colunas:
                                           Em Análise  | Aprovado
                                           Condicionado | Reprovado
                                           Agendamento  | Em Tratativa
                                           Contrato     | Outros →
```

**Regras:**
- "Todos" e "Documentação" sempre visíveis (etapa 1ª + mais usada)
- Se etapa ativa for uma das ocultas, botão "Mais ▼" fica dourado e exibe o nome ativo
- "Outros" dentro do dropdown mantém sub-dropdown com etapas secundárias
- Grade usa `grid-cols-2` dentro de um dropdown com overlay para fechar ao clicar fora

**Arquivo:** `src/pages/Clients.tsx`

---

## 3. Agenda — Layout Mobile Dedicado

### Problema
Grid semanal estilo Google Calendar (refatorado em `5721560`) é ilegível e inutilizável no mobile.

### Solução
Renderização condicional via hook `useMediaQuery` ou classe Tailwind: abaixo de `md` mostra o layout mobile; acima mantém o grid desktop intacto.

**Layout mobile:**
```
┌─────────────────────────┐
│ Agenda      [⚙] [+ Novo]│  ← header compacto; ⚙ abre filtro de tipo
│ ◄  QUINTA, 14 DE MAIO  ►│  ← navegação: setas trocam de dia
│─────────────────────────│
│ ● 10:00  Visita         │  ← card de evento (cor da borda = tipo)
│   Thays                 │
│   Rua Engenheiro...     │
│─────────────────────────│
│ ● 11:30  Reunião        │
│   Aprovada · Letícia    │
│─────────────────────────│
│  [estado vazio se nenhum evento]               │
│─────────────────────────│
│  D  S  T  Q  Q  S  S   │  ← strip 7 dias
│ 10 11 12 13(14)15 16   │    dia selecionado = círculo dourado
│                ●   ●   │    dots = tem evento naquele dia
└─────────────────────────┘
```

**Regras:**
- Strip mostra a semana atual; setas ◄ ► no header avançam a semana inteira
- Toque em qualquer dia do strip → atualiza lista de eventos exibidos
- Dots abaixo do dia indicam existência de ao menos 1 evento
- Toque em evento → mesmo modal de detalhe/edição do desktop
- Botão "+ Novo" → mesmo modal de criação do desktop
- Ícone ⚙ (funil) → dropdown inline com filtro de tipo (Todos, Visita, Reunião, Assinatura, Outro)
- Estado vazio: mensagem "Nenhum evento neste dia" + botão "+ Novo Evento"

**Arquivo:** `src/pages/Schedule.tsx`

---

## Princípios de Implementação

1. **Breakpoint único:** `md` (768px) — abaixo = mobile, acima = desktop
2. **Nenhuma funcionalidade removida** — apenas apresentação condicional
3. **Estado compartilhado** — mobile e desktop leem/escrevem os mesmos estados React
4. **Sem novos arquivos de rota** — tudo dentro dos componentes existentes
5. **Commits atômicos por área** — Dashboard, Clientes, Agenda em commits separados
