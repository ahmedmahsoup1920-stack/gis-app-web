/* ================================================================
   Service Worker — لتحويل التطبيق إلى PWA قابل للتثبيت والعمل أوفلاين
   المؤلف: أ / أحمد محسوب
   Strategy: Network-First  (الشبكة أولاً ثم الكاش)
   — يضمن أن التطبيق يعمل بأحدث نسخة دائماً عند وجود إنترنت،
      ويعمل بدون إنترنت عند انقطاعه.
   ================================================================ */

const VERSION = 'gis-water-v1';
const CACHE = VERSION + '-cache';

/* ملفات التطبيق الأساسية (نخزّنها عند التثبيت) */
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

/* ---------- التثبيت: تخزين الملفات الأساسية ---------- */
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function (cache) {
                // addAll يفشل كلياً إن فشل ملف واحد، لذا نخزّن كل ملف على حدة
                return Promise.all(CORE_ASSETS.map(function (url) {
                    return cache.add(new Request(url, { cache: 'reload' }))
                        .catch(function (err) {
                            console.warn('[SW] تعذّر تخزين:', url, err);
                        });
                }));
            })
            .then(function () { return self.skipWaiting(); })
    );
});

/* ---------- التفعيل: حذف الكاش القديم ---------- */
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== CACHE) { return caches.delete(k); }
                return null;
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

/* ---------- الطلبات: الشبكة أولاً ثم الكاش ---------- */
self.addEventListener('fetch', function (event) {
    const req = event.request;

    // نتجاهل أي شيء ليس GET
    if (req.method !== 'GET') { return; }

    // نتجاهل موارد Leaflet التفاعلية (نقاط، صور) لأنها مؤقتة
    const url = new URL(req.url);
    if (url.pathname.indexOf('/media/') !== -1) { return; }

    event.respondWith(
        fetch(req)
            .then(function (res) {
                // نخزّن نسخة من كل استجابة ناجحة
                if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors' || res.type === 'default')) {
                    const copy = res.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(req, copy).catch(function () { /* تجاهل */ });
                    });
                }
                return res;
            })
            .catch(function () {
                // لا يوجد إنترنت — نرجع من الكاش
                return caches.match(req).then(function (cached) {
                    if (cached) { return cached; }
                    //في حالة导航 نرجع الصفحة الرئيسية
                    if (req.mode === 'navigate') {
                        return caches.match('./index.html').then(function (page) {
                            return page || new Response(
                                '<!doctype html><meta charset="utf-8">' +
                                '<body style="font-family:sans-serif;text-align:center;padding:40px;" dir="rtl">' +
                                '<h2>لا يوجد اتصال بالإنترنت</h2>' +
                                '<p>افتح التطبيق مرة واحدة وحينها سيعمل بدون إنترنت.</p>' +
                                '</body>',
                                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                            );
                        });
                    }
                    return new Response('', { status: 504, statusText: 'Offline' });
                });
            })
    );
});

/* ---------- رسالة من الصفحة: تفعيل التحديث فوراً ---------- */
self.addEventListener('message', function (event) {
    if (event.data === 'SKIP_WAITING') { self.skipWaiting(); }
});
