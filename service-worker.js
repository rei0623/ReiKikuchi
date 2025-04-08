// service-worker.js

// キャッシュの名前（バージョン管理に役立つ）
const CACHE_NAME = 'rei-kikuchi-player-cache-v1';
// 最初にキャッシュするファイル（Precache）
// アプリケーションの基本的な骨格となるファイルを指定します。
const PRECACHE_URLS = [
  './', // ルート（通常は index.html や test.html）
  './test.html', // HTMLファイル自体
  // './style.css', // もし外部CSSファイルがあれば追加
  // './app.js',    // もし外部JSファイルがあれば追加
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLDz8Z1xlFd2JQEk.woff2', // Poppinsフォント (例)
  'https://ka-f.fontawesome.com/releases/v6.0.0/webfonts/fa-solid-900.woff2' // FontAwesome (例)
  // アプリに必要な他の重要な静的リソースを追加
];
// 動的にキャッシュする対象のキャッシュ名（サムネイルなど）
const RUNTIME_CACHE_NAME = 'runtime-cache';

// install イベント: Service Worker がインストールされるときに発生
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Precaching App Shell');
        // PRECACHE_URLS に含まれるリソースを一括でキャッシュ
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('Service Worker: Install completed, skipping waiting.');
        // インストール後すぐにアクティブ化する（推奨）
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Precache failed:', error);
      })
  );
});

// activate イベント: Service Worker がアクティブ化されるときに発生
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  // 古いキャッシュを削除する処理
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Claiming clients.');
        // アクティブ化後すぐにクライアント（ページ）を制御下に置く（推奨）
        return self.clients.claim();
    })
  );
});

// fetch イベント: ページからのリクエスト（画像、APIなど）が発生するたびに発生
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Google Fonts や CDN リソース、自分のオリジンのリクエストをキャッシュ対象とする戦略（例）
  if (requestUrl.origin === location.origin ||
      requestUrl.origin === 'https://fonts.googleapis.com' ||
      requestUrl.origin === 'https://fonts.gstatic.com' ||
      requestUrl.origin === 'https://cdn.jsdelivr.net' ||
      requestUrl.origin === 'https://ka-f.fontawesome.com') {

      // Cache First 戦略（キャッシュがあればキャッシュから、なければネットワークから取得しキャッシュ）
      event.respondWith(
          caches.match(event.request).then(cachedResponse => {
              if (cachedResponse) {
                  // console.log('SW Fetch: Returning from Cache:', event.request.url);
                  return cachedResponse;
              }

              // console.log('SW Fetch: Requesting from Network & Caching:', event.request.url);
              return caches.open(RUNTIME_CACHE_NAME).then(cache => {
                  return fetch(event.request).then(response => {
                      // レスポンスが有効で、キャッシュ可能なタイプ（GETリクエストなど）の場合のみキャッシュ
                      if (response && response.status === 200 && response.type === 'basic' || response.type === 'cors') {
                         // レスポンスをクローンしてキャッシュに保存（レスポンスは一度しか読み取れないため）
                         return cache.put(event.request, response.clone()).then(() => {
                            return response; // 元のレスポンスをブラウザに返す
                         });
                      }
                      return response; // キャッシュしない場合はそのまま返す
                  }).catch(error => {
                     console.error('SW Fetch: Network request failed:', error, event.request.url);
                     // ここでオフライン用のフォールバックレスポンスを返すことも可能
                     // return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' }});
                  });
              });
          }).catch(error => {
              console.error('SW Fetch: Cache match failed:', error);
              // エラー発生時もネットワークリクエストを試みるなどフォールバックが可能
              return fetch(event.request);
          })
      );
  }
  // 上記以外のリクエスト（例えばYouTube APIなど）はService Workerは関与せず、通常通り処理される
});

// message イベント: クライアント（ページ）からメッセージを受け取ったときに発生
self.addEventListener('message', event => {
    console.log('Service Worker: Message received:', event.data);

    if (event.data && event.data.type === 'CACHE_URLS') {
        // クライアントから指定されたURLをランタイムキャッシュに追加
        const urlsToCache = event.data.urls;
        event.waitUntil(
            caches.open(RUNTIME_CACHE_NAME)
                .then(cache => {
                    console.log('Service Worker: Caching URLs from client:', urlsToCache.length);
                    let promises = urlsToCache.map(url => {
                        // 既にキャッシュにないか確認してからfetch & cache
                        return caches.match(url).then(cachedResponse => {
                            if (!cachedResponse) {
                                return fetch(url).then(response => {
                                     if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
                                        return cache.put(url, response);
                                     }
                                }).catch(error => console.error(`SW Cache URL Error (${url}):`, error));
                            }
                            return Promise.resolve(); // Already cached
                        });
                    });
                    return Promise.all(promises);
                })
                .then(() => {
                    console.log('Service Worker: Client URL caching finished.');
                    // クライアントに完了を通知（オプション）
                    event.ports[0].postMessage({ type: 'CACHE_COMPLETE', count: urlsToCache.length });
                })
                .catch(error => {
                    console.error('Service Worker: Client URL caching failed:', error);
                     event.ports[0].postMessage({ type: 'CACHE_ERROR', message: error.message });
                })
        );
    } else if (event.data && event.data.type === 'CLEAR_CACHE') {
         // ランタイムキャッシュのみをクリア
         event.waitUntil(
             caches.delete(RUNTIME_CACHE_NAME)
                .then(success => {
                     console.log('Service Worker: Runtime cache deleted:', success);
                     event.ports[0].postMessage({ type: 'CLEAR_COMPLETE' });
                })
                .catch(error => {
                    console.error('Service Worker: Failed to delete runtime cache:', error);
                     event.ports[0].postMessage({ type: 'CLEAR_ERROR', message: error.message });
                })
         );
    }
    // 他のメッセージタイプがあればここに追加
});
