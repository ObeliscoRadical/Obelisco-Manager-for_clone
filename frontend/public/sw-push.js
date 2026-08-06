/* eslint-disable no-restricted-globals */

// Service Worker for Push Notifications — Obelisco Radical
self.addEventListener('push', function(event) {
  let data = { title: 'Obelisco Radical', body: 'Nova notificação' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/logo192.png',
    tag: data.tag || 'obelisco-' + Date.now(),
    vibrate: data.vibrate || [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' },
    ],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Obelisco Radical', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});
