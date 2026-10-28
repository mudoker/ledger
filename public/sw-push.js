// Service Worker for Ledger Web Push Notifications

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Ledger Notification', body: event.data.text() };
    }
  }

  const title = data.title || 'Ledger';
  const options = {
    body: data.body || 'You have a new update in Ledger.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'ledger-push',
    data: data.data || (data.url ? { url: data.url } : {}),
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus open window if already on target URL
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
