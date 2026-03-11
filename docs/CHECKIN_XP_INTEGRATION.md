# 🎮 Integração: Check-in + Sistema de XP

## 📋 Resumo

Toda vez que um usuário fizer check-in, ele ganha **50 XP** automaticamente, integrado ao sistema de gamificação do Kaizen Axis.

---

## 🔄 Fluxo Completo

### 1. **Usuário Faz Check-in**
- Via QR Code escaneado OU
- Manualmente na tela de Check-in
- Validações aplicadas:
  - ✅ Localização (dentro de 50m da imobiliária)
  - ✅ Horário (08:00 - 14:00 BRT)
  - ✅ Apenas 1 check-in por dia

### 2. **Sistema Processa**
Edge Function: `checkin-geo`
- Valida GPS e autenticação
- Chama RPC `fazer_checkin()`

Função PostgreSQL: `fazer_checkin()`
```sql
-- 1. Verifica duplicação (1 check-in/dia)
-- 2. Calcula posição na fila
-- 3. Insere em daily_checkins
-- 4. Marca presença no profile
-- 5. NOVO: Concede 50 XP
-- 6. Registra evento no sistema
-- 7. Verifica achievements
```

### 3. **XP É Concedido**
```sql
INSERT INTO user_points (user_id, points, source, reference_id)
VALUES (p_user_id, 50, 'checkin', NULL);
```

### 4. **Atualização em Tempo Real**
- Hook `useGamification` detecta novo XP via Realtime
- Leaderboard atualiza automaticamente
- Perfil do usuário mostra XP total atualizado
- Badge de "+50 XP" aparece na tela de check-in

---

## 📊 Tabelas Envolvidas

### **daily_checkins**
Registra check-ins diários
```typescript
{
  id: UUID,
  user_id: UUID,
  checkin_date: DATE,
  checkin_time: TIMESTAMPTZ,
  position_in_queue: INTEGER,
  latitude: FLOAT8,
  longitude: FLOAT8
}
```

### **user_points**
Centraliza todo XP do sistema
```typescript
{
  id: UUID,
  user_id: UUID,
  points: INTEGER,           // 50 para check-in
  source: TEXT,              // 'checkin'
  reference_id: UUID | NULL, // NULL para check-in
  created_at: TIMESTAMPTZ
}
```

### **system_events**
Feed de atividades do sistema
```typescript
{
  id: UUID,
  type: TEXT,               // 'checkin_completed'
  user_id: UUID,
  payload: JSONB,           // { position, date, xp_earned: 50 }
  created_at: TIMESTAMPTZ
}
```

---

## 🎨 Interface do Usuário

### **Antes do Check-in**
```
┌─────────────────────────────┐
│      [Botão Check-in]       │
│   Fazer Check-in            │
└─────────────────────────────┘
```

### **Após Check-in (Sucesso)**
```
┌─────────────────────────────┐
│          #3                 │
│   na fila de distribuição   │
│                             │
│ Check-in realizado!         │
│ 📍 45m da imobiliária       │
│                             │
│   ✨ +50 XP                 │
└─────────────────────────────┘
```

### **Componente React**
```tsx
{result?.xp_earned && alreadyDone && (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: 0.2 }}
    className="mt-3 flex items-center justify-center gap-2
               bg-gold-400/20 rounded-full px-4 py-2"
  >
    <Sparkles size={14} className="text-gold-600" />
    <span className="text-xs font-bold text-gold-700">
      +{result.xp_earned} XP
    </span>
  </motion.div>
)}
```

---

## 🛡️ Anti-Duplicação

### **Nível 1: Constraint de DB**
```sql
CONSTRAINT unique_user_daily UNIQUE (user_id, checkin_date)
```
- Garante apenas 1 linha em `daily_checkins` por dia

### **Nível 2: Verificação de XP**
```sql
SELECT EXISTS(
  SELECT 1 FROM user_points
  WHERE user_id = p_user_id
    AND source = 'checkin'
    AND DATE(created_at) = v_date
) INTO v_already_processed;
```
- Mesmo se houver retry na Edge Function
- XP não é concedido duas vezes

### **Nível 3: Lock de Transação**
```sql
PERFORM pg_advisory_xact_lock(hashtext('fazer_checkin_' || v_date::TEXT));
```
- Garante que check-ins simultâneos não causem race condition

---

## 📈 Integração com Leaderboard

### **View: leaderboard**
Agrega XP de todas as fontes:
```sql
SELECT
  user_id,
  SUM(points) as total_xp,
  ...
FROM user_points
GROUP BY user_id
```

**Fontes de XP:**
- `checkin`: 50 XP (novo!)
- `sale`: 500 XP
- `Meta`: 300 XP
- `Missão`: 500 XP
- `training_completed`: 100 XP
- Custom achievements: variável

### **Realtime Update**
```typescript
// Hook useGamification detecta novos pontos
supabase
  .channel('gamification:user_points')
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'user_points',
    filter: `user_id=eq.${user.id}`
  }, () => {
    fetchGamificationData(); // Atualiza leaderboard
  })
```

---

## 🏆 Achievements Desbloqueáveis

### **Exemplos de Conquistas Relacionadas**

#### **Pontual** 🌅
- Descrição: "Faça check-in por 7 dias seguidos"
- XP: 200
- Trigger: Streak de 7 check-ins consecutivos

#### **Maratonista** 🏃
- Descrição: "Faça check-in por 30 dias seguidos"
- XP: 1000
- Trigger: Streak de 30 check-ins consecutivos

#### **Primeiro do Dia** 🥇
- Descrição: "Seja o primeiro na fila 10 vezes"
- XP: 300
- Trigger: `position_in_queue = 1` em 10 dias diferentes

#### **Dedicado** 💪
- Descrição: "Faça check-in 100 vezes"
- XP: 500
- Trigger: COUNT(checkin) >= 100

### **Implementação Futura**
```sql
-- Função para verificar achievement de streak
CREATE OR REPLACE FUNCTION check_checkin_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_streak INTEGER;
BEGIN
  -- Calcular streak atual
  SELECT COUNT(DISTINCT checkin_date)
  INTO v_streak
  FROM daily_checkins
  WHERE user_id = p_user_id
    AND checkin_date >= (
      SELECT MAX(checkin_date) - INTERVAL '30 days'
      FROM daily_checkins
      WHERE user_id = p_user_id
    )
  ORDER BY checkin_date DESC;

  -- Desbloquear achievement se atingir meta
  IF v_streak >= 7 THEN
    PERFORM unlock_achievement(p_user_id, 'pontual');
  END IF;

  IF v_streak >= 30 THEN
    PERFORM unlock_achievement(p_user_id, 'maratonista');
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 🧪 Teste Manual

### **1. Primeiro Check-in do Dia**
```bash
# Fazer check-in
curl -X POST https://[sua-url]/functions/v1/checkin-geo \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": -23.5505,
    "longitude": -46.6333,
    "accuracy": 10
  }'

# Resposta esperada:
{
  "ok": true,
  "position": 1,
  "name": "João Silva",
  "message": "Check-in realizado com sucesso!",
  "distance": 5,
  "xp_earned": 50  ← NOVO!
}
```

### **2. Verificar XP no Banco**
```sql
SELECT *
FROM user_points
WHERE user_id = '[user-id]'
  AND source = 'checkin'
  AND DATE(created_at) = CURRENT_DATE;

-- Resultado esperado:
-- points: 50
-- source: 'checkin'
```

### **3. Verificar Leaderboard**
```sql
SELECT *
FROM leaderboard
WHERE user_id = '[user-id]';

-- total_xp deve ter aumentado em 50
```

### **4. Verificar UI**
1. Abrir app
2. Fazer check-in
3. Observar badge "+50 XP" aparecer
4. Abrir perfil/leaderboard
5. Ver XP atualizado em tempo real

---

## 📝 Arquivos Modificados

### **Migração SQL**
- `supabase/migrations/20260311_checkin_xp_reward.sql`
  - Atualiza função `fazer_checkin()`
  - Adiciona lógica de XP
  - Documenta integração

### **Frontend**
- `src/pages/CheckIn.tsx`
  - Adiciona `xp_earned` ao tipo `CheckinResult`
  - Exibe badge "+50 XP" após sucesso
  - Animação com Framer Motion

### **Backend**
- Nenhuma mudança na Edge Function
- Lógica fica toda no PostgreSQL

---

## 🚀 Deploy

### **1. Aplicar Migration**
```bash
cd kaizen-axis1
npx supabase db push
```

### **2. Verificar Função**
```sql
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'fazer_checkin';
```

### **3. Build Frontend**
```bash
npm run build
npx vercel --prod
```

---

## 📊 Monitoramento

### **Query: XP por Check-in (Hoje)**
```sql
SELECT
  p.name,
  p.email,
  dc.position_in_queue,
  dc.checkin_time,
  up.points as xp_earned,
  up.created_at as xp_awarded_at
FROM daily_checkins dc
JOIN profiles p ON p.id = dc.user_id
LEFT JOIN user_points up ON
  up.user_id = dc.user_id
  AND up.source = 'checkin'
  AND DATE(up.created_at) = dc.checkin_date
WHERE dc.checkin_date = CURRENT_DATE
ORDER BY dc.position_in_queue;
```

### **Query: Total XP de Check-ins (Por Usuário)**
```sql
SELECT
  p.name,
  COUNT(*) as total_checkins,
  SUM(up.points) as total_xp_from_checkins
FROM user_points up
JOIN profiles p ON p.id = up.user_id
WHERE up.source = 'checkin'
GROUP BY p.id, p.name
ORDER BY total_checkins DESC;
```

---

## ✅ Checklist de Implementação

- [x] Criar migration SQL com lógica de XP
- [x] Atualizar função `fazer_checkin()`
- [x] Adicionar anti-duplicação de XP
- [x] Integrar com `user_points` e `system_events`
- [x] Atualizar tipo TypeScript `CheckinResult`
- [x] Adicionar badge visual "+50 XP"
- [x] Documentar integração
- [ ] Aplicar migration no Supabase
- [ ] Testar manualmente
- [ ] Deploy frontend
- [ ] Monitorar logs
- [ ] Criar achievements relacionados (futuro)

---

## 🎯 Próximos Passos (Futuro)

1. **Achievements de Check-in**
   - Pontual (7 dias seguidos)
   - Maratonista (30 dias seguidos)
   - Primeiro do Dia (10x posição #1)

2. **Bonificações Variáveis**
   - 1º da fila: +10 XP extra
   - Check-in antes das 08:30: +5 XP (bônus pontualidade)
   - Streak de 7 dias: 2x XP (100 XP em vez de 50)

3. **Notificações Push**
   - "Você ganhou 50 XP! Continue assim! 🎯"
   - "Streak de 7 dias! +200 XP de bônus! 🔥"

4. **Dashboard de Check-ins**
   - Gráfico de check-ins por dia
   - Heatmap de presença
   - Ranking de pontualidade

---

**Implementado em:** 2026-03-11
**Versão:** 1.0.0
**Status:** ✅ Pronto para deploy
