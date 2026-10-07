//使用项目专属缓存名，避免与同域下其它 PWA 的 Service Worker 缓存互相干扰
const CACHE = 'MHRSB_Cheater-v6.2.2';

const ASSETS = [
  './',
  './index.html',

  // css
  './css/bootstrap.min.css',
  './css/style.css',
  './css/dark-force.css',

  // js
  './js/bootstrap.bundle.min.js',
  './js/cache.js',
  './js/jquery.min.js',
  './js/main.js',

  // data
  './data/armor_list_chT.js',
  './data/armor_pool_cost.js',
  './data/decoration_data.js',
  './data/k_skill_add.js',
  './data/skill_data.js',

  // icons
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安装：预缓存（单个资源失败不影响整体安装）
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(
        ASSETS.map(url =>
          c.add(url).catch(err => {
            console.warn('[SW] 预缓存失败:', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 接收主线程消息：立即跳过等待，激活新版本
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 请求：网络优先，失败再走缓存
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // 只处理同源请求
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          // 视图请求兜底到 index.html
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        })
      )
  );
});