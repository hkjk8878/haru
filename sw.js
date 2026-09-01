/* 하루 — 서비스워커
   앱 파일을 캐시해 두어 인터넷이 없어도 열리게 합니다.
   index.html을 고친 뒤에는 아래 VERSION 숫자를 올려 주세요. */
const VERSION = 'haru-v33';
const FILES = [
  './',
  './index.html',
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
      .then(c => c.addAll(FILES))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 화면 파일은 네트워크를 먼저 시도하고, 실패하면 캐시에서 꺼냅니다.
   덕분에 배포로 새 버전을 올리면 다음 접속에 바로 반영됩니다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    e.respondWith(
      fetch(req)
        .then(res => {
          caches.open(VERSION).then(c => c.put(req, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* 자산도 네트워크를 먼저 시도해 새 파일이 바로 반영되게 한다.
     실패(오프라인)하면 캐시에서 꺼낸다. */
  e.respondWith(
    fetch(req)
      .then(res => {
        caches.open(VERSION).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
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
