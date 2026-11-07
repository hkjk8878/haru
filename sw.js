/* 하루 — 서비스워커
   앱 파일을 캐시해 두어 인터넷이 없어도 열리게 합니다.
   index.html을 고친 뒤에는 아래 VERSION 숫자를 올려 주세요. */
const VERSION = 'haru-v146';
const FILES = [
  './',
  './index.html',
  './finance.js',
  './sync-core.js',
  './sync-client.js',
  './allocation.js',
  './allocation-ui.js',
  './allocation.css',
  './ui-state.js',
  './upgrade.js',
  './upgrade.css',
  './manifest.webmanifest',
  './keygen.html',
  './icon-192-v24.png',
  './icon-512-v24.png',
  './icon-maskable-v24.png',
  './apple-touch-icon-v24.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(FILES.map(url => new Request(new URL(url, self.registration.scope), {cache:'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('haru-v') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 화면 파일은 네트워크를 먼저 시도하고, 실패하면 캐시에서 꺼냅니다.
   덕분에 배포로 새 버전을 올리면 다음 접속에 바로 반영됩니다. */
self.addEventListener('fetch', e => {
  /* 다른 도메인(글꼴 CDN 등)은 서비스워커가 건드리지 않는다 */
  if (new URL(e.request.url).origin !== self.location.origin) return;
  const req = e.request;
  if (req.method !== 'GET') return;

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req, {cache:'reload'});
      if(res.ok) await cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (error) {
      const saved = await cache.match(req) || (isPage && await cache.match('./index.html'));
      if(saved) return saved;
      throw error;
    }
  })());
});

/* ── 푸시 알림 ── */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const title = d.title || '하루';
  const body = d.body || '확인할 것이 있어요';
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './icon-192-v24.png',
    badge: './icon-192-v24.png',
    tag: d.tag || ('haru-' + Date.now()),
    data: { url: './index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.indexOf(self.registration.scope) === 0) {
        await w.focus();
        return;
      }
    }
    await self.clients.openWindow('./index.html');
  })());
});
