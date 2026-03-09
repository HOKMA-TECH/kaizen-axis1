# PWA Walkthrough — KAIZEN-AXIS
> Auditoria completa do estado atual e roadmap de melhorias futuras

---

## 1. Estado Atual (Resumo Executivo)

| Camada | Status | Observação |
|--------|--------|------------|
| `manifest.json` | ❌ Ausente | Arquivo crítico não existe |
| Service Worker | ❌ Desativado intencionalmente | Se auto-destrói ao ativar |
| Cache de assets | ❌ Nenhum | Todos os caches são deletados |
| VitePWA Plugin | ❌ Comentado | Instalado mas desabilitado |
| Meta tags básicas | ⚠️ Parcial | `theme-color`, `apple-touch-icon` presentes, mas falta `manifest` link |
| Ícones | ⚠️ SVG apenas | Sem PNG/WebP para compatibilidade |
| Push Notifications | ⚠️ Incompleto | Permissão solicitada, mas sem mecanismo de entrega |
| Notificações in-app | ✅ Completo | Real-time via Supabase Realtime |
| Suporte offline | ❌ Nenhum | App quebra sem rede |
| Prompt de instalação | ❌ Ausente | Sem "Adicionar à tela inicial" customizado |
| Code Splitting | ❌ Ausente | Bundle monolítico de ~3.5 MB |

**Diagnóstico geral:** O projeto tem a infraestrutura básica de PWA (ícones SVG, `vite-plugin-pwa` instalado, meta tags parciais) mas tudo está **intencionalmente desativado** — o `sw.js` limpa todos os caches e se auto-desregistra para evitar conflito com upload de arquivos. O resultado é que, tecnicamente, não é um PWA instalável hoje.

---

## 2. Por que foi desativado?

O arquivo `public/sw.js` contém um comentário revelador:

```js
// No fetch listener. We want the browser to handle all requests natively
// to avoid stalling file uploads (POSTs with stream bodies).
```

E o `main.tsx` força a limpeza ao iniciar:

```ts
if ('serviceWorker' in navigator) {
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) await reg.unregister();
}
if ('caches' in window) {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
}
```

**Conclusão:** O SW foi desabilitado porque o caching agressivo gerado pelo `vite-plugin-pwa` (modo Workbox padrão) interceptava POSTs com stream bodies (upload de fotos de perfil etc.) e travava a requisição. A solução utilizada foi matar tudo em vez de refinar a estratégia de cache.

---

## 3. Mapa de Melhorias (Prioridades)

### 🔴 CRÍTICO — Sem isso o app não é instalável

#### 3.1 Criar o `manifest.json`

**Arquivo:** `public/manifest.json`

```json
{
  "name": "Kaizen Axis",
  "short_name": "KZAxis",
  "description": "Gestão Inteligente Imobiliária",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#1E293B",
  "theme_color": "#1E293B",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icons/pwa-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/pwa-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "shortcuts": [
    {
      "name": "Clientes",
      "short_name": "Clientes",
      "url": "/clients",
      "icons": [{ "src": "/icons/shortcut-clients.png", "sizes": "96x96" }]
    },
    {
      "name": "Dashboard",
      "short_name": "Dashboard",
      "url": "/",
      "icons": [{ "src": "/icons/shortcut-dashboard.png", "sizes": "96x96" }]
    }
  ],
  "categories": ["business", "productivity"],
  "screenshots": [
    {
      "src": "/screenshots/desktop.png",
      "sizes": "1280x800",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard Principal"
    },
    {
      "src": "/screenshots/mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Visão Mobile"
    }
  ]
}
```

**Atualizar `index.html`** para referenciar o manifest e adicionar meta tags iOS:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kaizen Axis</title>
  <meta name="description" content="Gestão Inteligente Imobiliária" />
  <meta name="theme-color" content="#1E293B" />

  <!-- Manifest -->
  <link rel="manifest" href="/manifest.json" />

  <!-- iOS PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="KZAxis" />
  <link rel="apple-touch-icon" href="/icons/pwa-192x192.png" />

  <!-- Splash screens iOS (opcional, melhora muito a experiência) -->
  <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png"
        media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
</head>
```

---

#### 3.2 Converter ícones SVG → PNG

Os ícones atuais são SVG. Android e iOS requerem PNG para instalação correta. Ferramentas sugeridas:

- **online:** [realfavicongenerator.net](https://realfavicongenerator.net) — gera todos os tamanhos automaticamente
- **cli:** `sharp` ou `svgexport`

Tamanhos necessários para cobertura completa:

```
public/icons/
  favicon.ico         (16x16, 32x32 multi-res)
  favicon-32x32.png
  favicon-96x96.png
  pwa-192x192.png     (Android home screen)
  pwa-512x512.png     (Android splash / PWA store)
  apple-touch-icon.png (180x180, iOS)
```

---

### 🟠 ALTA PRIORIDADE — Impacto direto em usabilidade

#### 3.3 Service Worker com estratégia cirúrgica de cache

O problema anterior (SW travando uploads) tem solução cirúrgica: **excluir rotas POST e a API do Supabase do cache**. Criar `public/sw.js` robusto:

```js
const CACHE_NAME = 'kaizen-axis-v1';

// Assets estáticos que devem ser cacheados
const STATIC_ASSETS = ['/', '/index.html'];

// Rotas que NUNCA devem ser interceptadas (uploads, API, auth)
const BYPASS_PATTERNS = [
  /supabase\.co/,          // toda a API Supabase
  /api\//,                 // qualquer rota /api/
  /\.hot-update\./,        // Vite HMR
];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Bypassa POSTs e métodos não-GET
  if (request.method !== 'GET') return;

  // Bypassa rotas na lista negra
  if (BYPASS_PATTERNS.some(p => p.test(request.url))) return;

  // Estratégia: Network-First para HTML, Cache-First para assets
  if (request.destination === 'document') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-First para JS/CSS/imagens
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      });
    })
  );
});
```

**Registrar o SW em `main.tsx`** (substituindo o bloco de limpeza):

```ts
// Substituir o bloco atual de "unregister all" por:
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.warn('SW falhou:', err));
  });
}
```

---

#### 3.4 Prompt de instalação customizado ("Adicionar à tela inicial")

Criar um hook e um componente simples. Atualmente não existe nada:

```tsx
// src/hooks/usePWAInstall.ts
import { useState, useEffect } from 'react';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
    return outcome; // 'accepted' | 'dismissed'
  };

  return { isInstallable, install };
}
```

Usar no `Settings.tsx` ou num banner no `Dashboard.tsx`:

```tsx
const { isInstallable, install } = usePWAInstall();

{isInstallable && (
  <PremiumCard className="p-4 flex items-center justify-between bg-gradient-to-r from-gold-50 to-amber-50 border-gold-200">
    <div>
      <p className="font-bold text-text-primary text-sm">Instalar o App</p>
      <p className="text-xs text-text-secondary">Acesse mais rápido direto da sua tela inicial</p>
    </div>
    <RoundedButton size="sm" onClick={install}>Instalar</RoundedButton>
  </PremiumCard>
)}
```

---

### 🟡 MÉDIA PRIORIDADE — Qualidade e confiabilidade

#### 3.5 Página / indicador de Offline

O app não trata ausência de rede. Criar detecção simples:

```tsx
// src/hooks/useOnlineStatus.ts
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return isOnline;
}
```

Usar em `App.tsx` para mostrar um banner:

```tsx
const isOnline = useOnlineStatus();

{!isOnline && (
  <div className="fixed top-0 inset-x-0 z-[999] bg-red-500 text-white text-xs font-bold text-center py-1.5">
    Sem conexão — algumas funcionalidades podem não estar disponíveis
  </div>
)}
```

---

#### 3.6 Push Notifications reais (Browser Push API)

Atualmente o `Settings.tsx` solicita permissão mas não faz nada com ela. A stack mais simples para entregar notificações reais sem Firebase:

**Opção A — Via Supabase Edge Functions + Web Push:**

```
1. Gerar VAPID keys (web-push npm package)
2. Salvar subscription no Supabase (tabela push_subscriptions)
3. Edge Function dispara web-push quando evento ocorrer
4. SW recebe evento 'push' e chama showNotification()
```

**Handler no Service Worker:**

```js
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Kaizen Axis', {
      body: data.body,
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
```

**Opção B — Firebase Cloud Messaging (FCM):**
Mais fácil de implementar se já tiver um projeto Firebase. Requer SDK `firebase/messaging`.

---

#### 3.7 Code Splitting (Lazy Loading de rotas)

O bundle atual tem **~3.5 MB** num único arquivo. Dividir por rotas reduz o tempo de carregamento inicial drasticamente:

```tsx
// src/App.tsx — trocar imports diretos por React.lazy
import { lazy, Suspense } from 'react';

const Dashboard     = lazy(() => import('@/pages/Dashboard'));
const AdminPanel    = lazy(() => import('@/pages/admin/AdminPanel'));
const Clients       = lazy(() => import('@/pages/Clients'));
const Schedule      = lazy(() => import('@/pages/Schedule'));
const Settings      = lazy(() => import('@/pages/Settings'));
const PresenceReport = lazy(() => import('@/pages/admin/PresenceReport'));

// Envolver routes num Suspense:
<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-gold-500" size={32} /></div>}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/admin" element={<AdminPanel />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**Ganho esperado:** Bundle inicial de ~3.5 MB → ~400-600 KB (só o chunk necessário para a rota atual).

---

### 🟢 BAIXA PRIORIDADE — Polimento e SEO

#### 3.8 Background Sync (envio offline de formulários)

Para suportar criação de clientes/vendas sem rede, usando a Background Sync API:

```js
// No SW:
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-pending-sales') {
    e.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  const db = await openDB('kaizen-offline', 1);
  const pending = await db.getAll('pending-sales');
  for (const item of pending) {
    await fetch('/api/sales', { method: 'POST', body: JSON.stringify(item) });
    await db.delete('pending-sales', item.id);
  }
}
```

Requer `idb` (wrapper IndexedDB) e lógica de fila no app.

---

#### 3.9 Splash screens para iOS

iOS não gera splash screen automaticamente para PWAs. Necessário criar imagens estáticas para cada tamanho de tela e registrá-las no `<head>`:

```html
<!-- iPhone 14 Pro Max -->
<link rel="apple-touch-startup-image"
  href="/splash/splash-1290x2796.png"
  media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"/>

<!-- iPhone SE -->
<link rel="apple-touch-startup-image"
  href="/splash/splash-750x1334.png"
  media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"/>
```

Ferramenta para gerar: `pwa-asset-generator` (npm package).

---

#### 3.10 `robots.txt` e SEO básico

```
# public/robots.txt
User-agent: *
Disallow: /admin
Disallow: /settings
Allow: /
Sitemap: https://seudominio.com/sitemap.xml
```

---

## 4. Sequência de Implementação Sugerida

```
Sprint 1 — Instalabilidade (1-2 dias)
  ✅ Criar manifest.json
  ✅ Converter ícones para PNG
  ✅ Adicionar meta tags no index.html
  ✅ Substituir SW destrutivo por SW cirúrgico (bypass Supabase/POSTs)
  ✅ Registrar SW no main.tsx

Sprint 2 — UX offline + Install (2-3 dias)
  ✅ Hook usePWAInstall + banner de instalação no Dashboard
  ✅ Hook useOnlineStatus + banner de offline no App.tsx

Sprint 3 — Performance (1-2 dias)
  ✅ Code splitting com React.lazy nas rotas do App.tsx
  ✅ Verificar bundle com `npx vite-bundle-visualizer`

Sprint 4 — Push Notifications reais (3-5 dias)
  ✅ Gerar VAPID keys
  ✅ Criar tabela push_subscriptions no Supabase
  ✅ Implementar subscription no Settings.tsx
  ✅ Criar Edge Function de disparo
  ✅ Adicionar push handler no SW

Sprint 5 — Polimento (opcional)
  ✅ Splash screens iOS
  ✅ Background Sync para formulários offline
  ✅ robots.txt
```

---

## 5. Ferramentas de Auditoria

Para medir o progresso após cada sprint:

- **Lighthouse** (Chrome DevTools → aba Lighthouse → categoria PWA)
  - Score atual estimado: ~30/100
  - Score alvo após Sprint 1-2: ~80/100

- **PWA Builder** (pwabuilder.com) — diagnóstico online + gerador de pacotes para stores

- **Chrome DevTools → Application tab:**
  - Manifest: ver se está sendo lido corretamente
  - Service Workers: ver estado do SW
  - Storage: ver o que está em cache

---

## 6. Arquivos-chave para editar

| Arquivo | Ação |
|---------|------|
| `public/manifest.json` | **Criar** |
| `index.html` | Adicionar `<link rel="manifest">` e meta tags iOS |
| `public/sw.js` | Reescrever com estratégia de cache cirúrgica |
| `src/main.tsx` | Substituir bloco de limpeza por registro do SW |
| `src/App.tsx` | Adicionar React.lazy + Suspense |
| `src/hooks/usePWAInstall.ts` | **Criar** |
| `src/hooks/useOnlineStatus.ts` | **Criar** |
| `public/icons/` | **Criar** — converter SVGs para PNG em múltiplos tamanhos |

---

*Gerado em 2026-03-09 — baseado em auditoria estática do código-fonte.*
