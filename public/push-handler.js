/**
 * Push-Handler des Service Workers.
 *
 * Wird vom generierten Workbox-Service-Worker per importScripts eingebunden
 * (siehe vite.config.ts). Bewusst als eigene, einfache Datei: So bleibt die
 * Caching-Strategie der PWA unangetastet und diese Datei enthält nur das
 * Nötigste für Benachrichtigungen.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Malerprofis Uderstadt';
  const icon = new URL('icon-192x192.png', self.registration.scope).href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon,
      badge: icon,
      // Gleiche tag-Werte ersetzen einander, statt sich zu stapeln.
      tag: payload.tag || 'malerprofis',
      data: { url: payload.url || self.registration.scope },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Ist die App schon offen, diese in den Vordergrund holen.
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
