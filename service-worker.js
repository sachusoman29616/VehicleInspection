// UniInspect Service Worker
// Caches app for offline use

const CACHE_NAME = "uninspect-v1";
const URLS_TO_CACHE = [
  "/VehicleInspection/",
  "/VehicleInspection/index.html",
  "/VehicleInspection/app.js",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
];

// Install — cache all files
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        URLS_TO_CACHE.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.log("Could not cache:", url, e);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — serve from cache, fallback to network
self.addEventListener("fetch", function(event) {
  // Skip non-GET and external API calls
  if(event.request.method !== "GET") return;
  var url = event.request.url;
  if(url.includes("worldtimeapi.org") ||
     url.includes("timeapi.io") ||
     url.includes("nominatim.openstreetmap.org") ||
     url.includes("oauth2.googleapis.com") ||
     url.includes("gmail.googleapis.com") ||
     url.includes("chart.googleapis.com")) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if(cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful responses
        if(response&&response.status===200&&response.type!=="opaque") {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        return caches.match("/VehicleInspection/index.html");
      });
    })
  );
});
