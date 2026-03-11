# 🚀 Instruções de Deploy - Sistema de XP no Check-in

## 📋 Opções de Deploy

### **OPÇÃO 1: Dashboard do Supabase (Mais Rápido)** ⭐ RECOMENDADO

#### **Passo 1: Abrir SQL Editor**
1. Acesse o [Dashboard do Supabase](https://supabase.com/dashboard)
2. Selecione seu projeto **Kaizen Axis**
3. No menu lateral, clique em **SQL Editor**

#### **Passo 2: Criar Nova Query**
1. Clique em **"New query"**
2. Cole o conteúdo do arquivo:
   📁 `kaizen-axis1/supabase/migrations/20260311_checkin_xp_reward.sql`

#### **Passo 3: Executar**
1. Clique em **"Run"** (ou pressione Ctrl+Enter)
2. Aguarde a mensagem de sucesso
3. Verificar saída: Deve mostrar `CREATE OR REPLACE FUNCTION` bem-sucedido

#### **Passo 4: Verificar**
Execute esta query para confirmar:
```sql
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'fazer_checkin'
  AND routine_schema = 'public';
```

Se retornar a função com o código atualizado (incluindo `INSERT INTO user_points`), está OK! ✅

---

### **OPÇÃO 2: Supabase CLI (Mais Profissional)**

#### **Passo 1: Instalar Supabase CLI** (se ainda não tem)
```bash
npm install -g supabase
```

#### **Passo 2: Login**
```bash
supabase login
```
- Abrirá o browser para autenticar
- Copie o access token

#### **Passo 3: Link do Projeto**
```bash
cd c:/Users/hokma/Desktop/KAIZEN-AXIS/kaizen-axis1
supabase link --project-ref <seu-project-ref>
```

**Como encontrar o `project-ref`:**
- Dashboard do Supabase → Settings → General
- Ou na URL: `https://supabase.com/dashboard/project/[PROJECT-REF]`

#### **Passo 4: Push da Migration**
```bash
supabase db push
```

Isso aplicará automaticamente a migration `20260311_checkin_xp_reward.sql`.

---

### **OPÇÃO 3: Copiar e Colar (Manual)**

Se preferir, você pode:

1. Abrir o arquivo:
   📁 `C:\Users\hokma\Desktop\KAIZEN-AXIS\kaizen-axis1\supabase\migrations\20260311_checkin_xp_reward.sql`

2. Copiar **TODO** o conteúdo

3. Colar no SQL Editor do Supabase Dashboard

4. Executar (Run)

---

## ✅ Verificação Pós-Deploy

### **1. Testar a Função**
```sql
-- Simular um check-in (substitua pelo seu user_id)
SELECT fazer_checkin(
  p_user_id := '00000000-0000-0000-0000-000000000000'::uuid,
  p_latitude := -23.5505,
  p_longitude := -46.6333
);
```

**Resultado esperado:**
```json
{
  "success": true,
  "position": 1,
  "name": "Seu Nome",
  "date": "2026-03-11",
  "xp_earned": 50
}
```

### **2. Verificar XP Concedido**
```sql
SELECT *
FROM user_points
WHERE source = 'checkin'
ORDER BY created_at DESC
LIMIT 5;
```

Deve aparecer uma linha com:
- `points`: 50
- `source`: 'checkin'

### **3. Verificar Evento**
```sql
SELECT *
FROM system_events
WHERE type = 'checkin_completed'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🎨 Deploy do Frontend

### **Passo 1: Build**
```bash
cd c:/Users/hokma/Desktop/KAIZEN-AXIS/kaizen-axis1
npm run build
```

### **Passo 2: Deploy no Vercel**

Se já tem projeto no Vercel:
```bash
npx vercel --prod
```

Se é novo projeto:
```bash
npx vercel
# Siga os prompts:
# - Set up and deploy? Yes
# - Which scope? [sua conta]
# - Link to existing project? No
# - Project name? kaizen-axis
# - Directory? ./
# - Override settings? No
```

Depois:
```bash
npx vercel --prod
```

---

## 🧪 Teste Completo (Após Deploy)

### **1. Abrir App**
Acesse a URL do Vercel (ex: `https://kaizen-axis.vercel.app`)

### **2. Fazer Login**
Entre com suas credenciais

### **3. Ir para Check-in**
Menu → Check-in

### **4. Fazer Check-in**
- Se estiver dentro do raio: Clique no botão
- Se não: Use QR Code ou teste em staging

### **5. Verificar Badge**
Após sucesso, deve aparecer:
```
✨ +50 XP
```

### **6. Verificar Leaderboard**
Menu → Perfil ou Leaderboard
- Seu XP total deve ter aumentado em 50

### **7. Verificar Realtime**
- Abra em outra aba/dispositivo
- Faça check-in
- Leaderboard deve atualizar automaticamente (sem reload)

---

## 🐛 Troubleshooting

### **Erro: "Function fazer_checkin does not exist"**
➡️ Migration não foi aplicada. Volte ao Passo 1 (SQL Editor).

### **Erro: "Column xp_earned does not exist"**
➡️ Isso é OK! O backend retorna `xp_earned` no JSON, não é coluna de tabela.

### **XP não aparece no frontend**
➡️ Verifique:
1. Build foi feito após modificar `CheckIn.tsx`?
2. Deploy foi feito com a versão atualizada?
3. Cache do browser (Ctrl+Shift+R para hard reload)

### **Badge "+50 XP" não aparece**
➡️ Verifique no console do browser:
```javascript
console.log(result.xp_earned); // Deve ser 50
```

Se for `undefined`, o backend não está retornando. Verifique a migration.

---

## 📊 Monitoramento Pós-Deploy

### **Query: Check-ins com XP (Últimas 24h)**
```sql
SELECT
  p.name,
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
WHERE dc.checkin_time >= NOW() - INTERVAL '24 hours'
ORDER BY dc.checkin_time DESC;
```

### **Query: Estatísticas de XP**
```sql
SELECT
  COUNT(DISTINCT user_id) as usuarios_com_checkin,
  SUM(points) as xp_total_concedido,
  AVG(points) as xp_medio_por_checkin,
  COUNT(*) as total_checkins_com_xp
FROM user_points
WHERE source = 'checkin';
```

---

## ✅ Checklist Final

- [ ] Migration aplicada no Supabase (via SQL Editor ou CLI)
- [ ] Função `fazer_checkin()` atualizada (verificar com SELECT)
- [ ] Teste manual da função (simular check-in)
- [ ] XP aparece em `user_points`
- [ ] Evento aparece em `system_events`
- [ ] Frontend buildado (`npm run build`)
- [ ] Deploy no Vercel (`vercel --prod`)
- [ ] Teste E2E (fazer check-in real no app)
- [ ] Badge "+50 XP" aparece na UI
- [ ] Leaderboard atualiza em tempo real
- [ ] Monitoramento configurado (queries salvas)

---

## 🎯 Resultado Final Esperado

**Quando tudo estiver OK:**

1. ✅ Usuário faz check-in
2. ✅ Backend concede 50 XP automaticamente
3. ✅ UI mostra badge "+50 XP" com animação
4. ✅ Leaderboard atualiza em tempo real
5. ✅ Perfil mostra XP total correto
6. ✅ Nenhum erro nos logs
7. ✅ Anti-duplicação funciona (não permite XP duplicado)

---

## 📞 Próximos Passos (Futuro)

Após confirmar que está funcionando:

1. **Criar achievements** de check-in (Pontual, Maratonista, etc.)
2. **Adicionar bônus** (1º da fila, streak de dias)
3. **Dashboard** de check-ins (gráficos, heatmap)
4. **Notificações push** quando ganhar XP

---

**Criado em:** 2026-03-11
**Pronto para:** Deploy em produção
**Tempo estimado:** 10-15 minutos
