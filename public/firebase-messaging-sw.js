// Firebase Cloud Messaging Background Service Worker for InteriorX
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('push', function (event) {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.notification?.title || payload.data?.title || 'InteriorX';
    const options = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: payload.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // Fallback for non-JSON push payloads
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(targetUrl));
});
