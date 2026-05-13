---
sketch: 001
name: agenda-layout
question: "Qual estrutura geral de layout funciona melhor para a Agenda minimalista?"
winner: null
tags: [layout, agenda, calendar, linear, notion]
---

# Sketch 001: Agenda Layout

## Design Question
Qual estrutura geral organiza melhor navegação + lista de eventos no estilo Linear/Notion minimalista?

## How to View
Abrir no browser: `.planning/sketches/001-agenda-layout/index.html`

## Variants
- **A: Sidebar Linear** — Sidebar fixa com mini-calendário, filtros de tipo, e feed de eventos principal. Estilo Linear/Jira.
- **B: Header Compacto** — Header com week strip horizontal + cards de evento por dia. Mais próximo do estado atual, porém refatorado e mais clean.
- **C: Split Calendário** — Painel esquerdo com calendário mensal + mini-lista de próximos; painel direito com feed agrupado por dia. Estilo Fantastical/Cron.

## What to Look For
- Quão fácil é ver "o que tenho hoje" vs "o que tenho nos próximos dias"?
- O calendário precisa estar visível todo o tempo (C/A) ou basta o week strip (B)?
- A sidebar esquerda (A/C) cabe bem na navegação geral do app (que provavelmente já tem sidebar)?
- Os cards de eventos: preferência por linha simples (A), card com borda colorida (B), ou linha com timeline (C)?
