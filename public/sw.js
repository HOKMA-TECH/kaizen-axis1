// ─── Kaizen Axis — Service Worker v4 ────────────────────────────────────────
// Estratégia cirúrgica:
//   • Nunca intercepta POST/PUT/DELETE/PATCH  →  uploads de arquivo seguros
//   • Nunca intercepta domínios Supabase      →  real-time e auth seguros
//   • Network-First para HTML                 →  usuário sempre recebe código novo
//   • Cache-First para assets com hash        →  JS/CSS/imagens carregam rápido
//   • Limpa caches de versões antigas         →  sem conflito entre deploys
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v8';
const CACHE_NAME = `kaizen-axis-${CACHE_VERSION}`;
const MAX_CACHE_ENTRIES = 60;
const LEGACY_HOSTS = new Set(['kaizen-axis.space', 'www.kaizen-axis.space']);
const CURRENT_ORIGIN = 'https://app.imobkaizen.com.br';

function isLegacyHost(hostname) {
  return LEGACY_HOSTS.has(hostname);
}

function rewriteLegacyUrl(url) {
  return CURRENT_ORIGIN + url.pathname + url.search + url.hash;
}

// ── Regras de bypass: requisições que NUNCA devem ser interceptadas ──────────
function shouldBypass(request) {
  // 1. Apenas GET passa pelo cache — POST/PUT/DELETE/PATCH vão direto ao servidor
  if (request.method !== 'GET') return true;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return true;
  }

  // 2. Apenas http/https — ignora chrome-extension://, data:, etc.
  if (!url.protocol.startsWith('http')) return true;

  // 3. Supabase: API, Auth, Storage, Realtime — tudo direto ao servidor
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.io') ||
    url.hostname.includes('supabase.in') ||
    url.hostname === 'api-app.imobkaizen.com.br' ||
    url.hostname === 'challenges.cloudflare.com'
  ) return true;

  // 4. Vite HMR e endpoints de dev
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__vite') ||
    url.pathname.startsWith('/node_modules')
  ) return true;

  // 5. Source maps
  if (url.pathname.endsWith('.map')) return true;

  return false;
}

// ── Detecta asset estático com hash no nome (build Vite) ────────────────────
// Ex: /assets/index-CxYdFN0d.js, /assets/index-CS_YJXj7.css
function isHashedAsset(url) {
  return (
    url.pathname.startsWith('/assets/') &&
    /\.[a-z0-9]{8,}\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  );
}

// ── Remove entradas mais antigas quando o cache fica grande ─────────────────
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (isLegacyHost(self.location.hostname)) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        await self.registration.unregister();
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(
          windowClients.map((client) => client.navigate(rewriteLegacyUrl(new URL(client.url))))
        );
        return;
      }

      // Limpa caches de versões anteriores
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('kaizen-axis-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
      // Assume controle de todas as abas abertas imediatamente
      await self.clients.claim();
    })()
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (isLegacyHost(self.location.hostname)) {
    try {
      const url = new URL(request.url);
      if (url.origin === self.location.origin) {
        event.respondWith(Response.redirect(rewriteLegacyUrl(url), 307));
      }
    } catch {
      return;
    }
    return;
  }

  if (shouldBypass(request)) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // ── Assets com hash (JS/CSS do build Vite): Cache-First ─────────────────
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
          trimCache(CACHE_NAME, MAX_CACHE_ENTRIES);
        }
        return response;
      })
    );
    return;
  }

  // ── Documentos HTML (navegação): Network-First ──────────────────────────
  if (request.destination === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
              trimCache(CACHE_NAME, MAX_CACHE_ENTRIES);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('/'))
        )
    );
    return;
  }

  // ── Outros GETs (fontes, ícones públicos): Stale-While-Revalidate ───────
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
            trimCache(CACHE_NAME, MAX_CACHE_ENTRIES);
          }
          return response;
        })
        .catch(() => null);

      return cached || networkFetch;
    })
  );
});

// ─── PUSH — recebe push do servidor e exibe notificação nativa ───────────────
self.addEventListener('push', (event) => {
  let data = { id: '', title: 'Kaizen Axis', body: 'Você tem uma nova notificação.', url: '/' };
  try { Object.assign(data, event.data?.json()); } catch {}

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasFocused = windowClients.some((c) => c.focused);
    if (hasFocused) return;

    const tag = data.id ? `kaizen-${data.id}` : `kaizen-${Date.now()}`;
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag,
      renotify: true,
      requireInteraction: false,
      data: { url: data.url },
    });
  })());
});

// ─── NOTIFICATION CLICK — abre o app na rota correta ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Se já existe uma aba aberta do app, foca e navega
        const existing = windowClients.find((c) =>
          c.url.startsWith(self.location.origin) || c.url.startsWith(CURRENT_ORIGIN)
        );
        const destination = isLegacyHost(self.location.hostname)
          ? rewriteLegacyUrl(new URL(targetUrl, CURRENT_ORIGIN))
          : targetUrl;
        if (existing) {
          existing.focus();
          return existing.navigate(destination);
        }
        // Caso contrário, abre nova aba
        return self.clients.openWindow(destination);
      })
  );
});
