// Delywa: avisos del navegador (Web Push). No guarda nada en caché: la app siempre se carga nueva.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Delywa", body: e.data ? e.data.text() : "" }; }
  const titulo = d.title || "Delywa";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || "",
    icon: "/delywa-logo.png",
    badge: "/delywa-logo.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    requireInteraction: titulo.startsWith("🛒"),
    vibrate: [200, 100, 200, 100, 300],
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of abiertas) {
      if (new URL(v.url).origin === self.location.origin && "focus" in v) {
        await v.focus();
        if ("navigate" in v) await v.navigate(destino).catch(() => undefined);
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
