// Hanout Alhouma Dakye - offline: the newest version from the internet when there is one, the saved copy when there isn't.
const CACHE="hanout-v2";
const CORE=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png","logo.png"];
self.addEventListener("install",e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch",e=>{
  const r=e.request; if(r.method!=="GET") return;
  const u=new URL(r.url);
  const lib=/cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if(u.origin!==location.origin && !lib) return;
  // our own files: always ask the server if there is something newer (no 10-minute stale copy); libraries: normal
  const net = u.origin===location.origin ? fetch(r.url,{cache:"no-cache",credentials:"same-origin"}) : fetch(r);
  e.respondWith(net.then(res=>{ if(res && (res.ok||res.type==="opaque")){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(r,copy)); } return res; })
    .catch(()=>caches.match(r).then(m=>m||(r.mode==="navigate"?caches.match("index.html"):undefined))));
});
