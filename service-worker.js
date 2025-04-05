// service-worker.js
const CACHE_NAME = 'rei-kikuchi-music-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/ReiKikuchi.html',
  '/favicon.ico',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
];

// Service Workerのインストール時にリソースをキャッシュ
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中...');
  
  // キャッシュの準備が完了するまでインストールフェーズを延長
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュを開きました');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('Service Worker: すべてのリソースをキャッシュしました');
        return self.skipWaiting(); // 待機中のService Workerをアクティブにする
      })
  );
});

// 新しいService Workerがアクティブになったときに古いキャッシュを削除
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティブ化中...');
  
  // アクティベーションが完了するまで延長
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除します', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: アクティブになりました');
      return self.clients.claim(); // このService Workerがすべてのクライアントを制御
    })
  );
});

// ネットワークリクエストの傍受
self.addEventListener('fetch', event => {
  // YouTube APIリクエストはキャッシュしない
  if (event.request.url.includes('googleapis.com/youtube')) {
    return;
  }
  
  // 音楽ファイルのリクエストを特別に処理
  if (event.request.url.match(/\.(mp3|wav|ogg)$/)) {
    event.respondWith(cacheFirstForMedia(event.request));
    return;
  }
  
  // その他のリクエストはキャッシュファーストで処理
  event.respondWith(
    cacheFirst(event.request)
  );
});

// キャッシュファースト戦略（一般的なリソース用）
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    console.log('Service Worker: キャッシュからリソースを返します', request.url);
    return cachedResponse;
  }
  
  try {
    console.log('Service Worker: ネットワークからリソースを取得します', request.url);
    const networkResponse = await fetch(request);
    
    // レスポンスが有効な場合のみキャッシュに追加
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: ネットワークリクエストに失敗しました', error);
    
    // オフラインフォールバックページがあればそれを返す
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('/offline.html') || new Response('オフラインです。インターネット接続を確認してください。', {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    return new Response('ネットワークエラーが発生しました', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// メディアファイル用のキャッシュファースト戦略（より積極的にキャッシュ）
async function cacheFirstForMedia(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    console.log('Service Worker: キャッシュから音楽ファイルを返します', request.url);
    return cachedResponse;
  }
  
  try {
    console.log('Service Worker: ネットワークから音楽ファイルを取得します', request.url);
    const networkResponse = await fetch(request);
    
    // 音楽ファイルは常にキャッシュに追加
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: 音楽ファイルの取得に失敗しました', error);
    return new Response('音楽ファイルの取得に失敗しました', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// メッセージハンドラー（メインスレッドからの通信用）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_MUSIC') {
    // 特定の音楽ファイルをキャッシュするリクエスト
    const musicUrl = event.data.url;
    if (musicUrl) {
      console.log('Service Worker: 音楽ファイルをキャッシュします', musicUrl);
      caches.open(CACHE_NAME).then(cache => {
        return fetch(musicUrl).then(response => {
          return cache.put(musicUrl, response);
        }).catch(error => {
          console.error('Service Worker: 音楽ファイルのキャッシュに失敗しました', error);
        });
      });
    }
  }
});
