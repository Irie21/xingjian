/* 星笺 · PWA Service Worker
   作用：1) 满足 Chrome / Edge 的「安装到桌面」条件；2) 提供基础离线缓存 */
const CACHE = 'xingjian-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* 页面导航：网络优先，离线时回退缓存 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (r) {
          const cp = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); }).catch(function () {});
          return r;
        })
        .catch(function () {
          return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  /* 其它资源：缓存优先 */
  e.respondWith(
    caches.match(req).then(function (r) {
      return (
        r ||
        fetch(req)
          .then(function (res) {
            const cp = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, cp); }).catch(function () {});
            return res;
          })
          .catch(function () { return r; })
      );
    })
  );
});
