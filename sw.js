const CACHE = 'app-v6.1';

const ASSETS = [
  './',
  './index.html',

  // css
  './css/bootstrap.min.css',

  // js
  './js/bootstrap.bundle.min.js',
  './js/cache.js',
  './js/jquery.min.js',
  './js/main.js',

  // data
  './data/A_Arm_Name_MR.js',
  './data/armor_list_chT.js',
  './data/armor_pool_cost.js',
  './data/decoration_data.js',
  './data/Decorations_Name.js',
  './data/Decorations_Name2.js',
  './data/k_skill_add.js',
  './data/PlayerSkill_Detail.js',
  './data/PlayerSkill_Detail2.js',
  './data/PlayerSkill_Explain.js',
  './data/PlayerSkill_Explain2.js',
  './data/PlayerSkill_Name.js',
  './data/skill_data.js',

  // fonts
  './fonts/glyphicons-halflings-regular.eot',
  './fonts/glyphicons-halflings-regular.svg',
  './fonts/glyphicons-halflings-regular.ttf',
  './fonts/glyphicons-halflings-regular.woff',
  './fonts/glyphicons-halflings-regular.woff2',

  // icons
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安装：预缓存
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
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

// 请求：缓存优先，失败再走网络
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
