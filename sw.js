/* 星笺 · PWA Service Worker
   作用：1) 满足 Chrome / Edge 的「安装到桌面」条件；2) 基础离线缓存
   策略：缓存名称带版本号（更新图标/代码时改版本号即可强制刷新）
        页面导航 → 网络优先（离线回退缓存）；
        其它资源 → 缓存优先 + 后台静默更新（下次打开就是新版）。
          */
const CACHE = 'xingjian-v107';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
/* 更新后必须第一次打开就生效：这些是「界面本身」的文件，走网络优先。
   以前是缓存优先，上传新版后第一次打开还是旧界面，容易误以为修复没生效。 */
const SHELL = /(\/|\.html|app\.js|style\.css|sw\.js|manifest\.json)$/;

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
  /* 只缓存同源的界面资源：网易云等跨域音源直接放行
     —— 以前每首歌都会被这里再存一份进 Cache Storage，既白占一份空间，也多一层中转 */
  let sameOrigin = false;
  try { sameOrigin = (new URL(req.url).origin === self.location.origin); } catch (err) { sameOrigin = false; }
  if (!sameOrigin) return;
  /* 带 Range 的请求（音频拖进度）也别拦 */
  if (req.headers && req.headers.get && req.headers.get('range')) return;

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

  /* 界面文件（app.js / style.css / 页面本身）：网络优先，
     这样上传新版后第一次打开就是新代码；离线时才用缓存。 */
  let isShell = false;
  try { isShell = SHELL.test(new URL(req.url).pathname); } catch (err) { isShell = false; }
  if (isShell) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(function (r) {
          if (r && r.ok) caches.open(CACHE).then(function (c) { c.put(req, r.clone()).catch(function () {}); });
          return r;
        })
        .catch(function () { return caches.match(req).then(function (r) { return r || caches.match('./index.html'); }); })
    );
    return;
  }

  /* 其它资源：先给缓存（秒开），同时后台拉新版覆盖；没缓存就走网络 */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        const net = fetch(req)
          .then(function (res) {
            if (res && res.ok) c.put(req, res.clone()).catch(function () {});
            return res;
          })
          .catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});

/* 点通知 → 打开 / 聚焦星笺（安卓通知点击行为）*/
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf('index.html') >= 0 && 'focus' in c) return c.focus();
      }
      if (list.length && 'focus' in list[0]) return list[0].focus();
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
