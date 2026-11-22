// Avisos del navegador (Web Push). En iPhone solo funcionan con Delywa agregado a la pantalla de inicio.

export const pushSoportado = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const esIphoneSinInstalar = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone);

const aBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
};

async function registro() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Ya hay avisos activos en este aparato. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!pushSoportado()) return null;
  const r = await navigator.serviceWorker.getRegistration("/");
  return (await r?.pushManager.getSubscription()) ?? null;
}

/** Pide permiso (tiene que ser después de un toque) y devuelve la suscripción para el servidor. */
export async function activarPush(): Promise<PushSubscriptionJSON> {
  if (!pushSoportado()) throw new Error("Este navegador no permite avisos.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.");
  const r = await registro();
  await navigator.serviceWorker.ready;
  const { publica } = await (await fetch("/api/push/clave")).json();
  if (!publica) throw new Error("Los avisos no están listos todavía.");
  const actual = await r.pushManager.getSubscription();
  const s = actual ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publica) });
  return s.toJSON();
}

export async function apagarPush() {
  const s = await suscripcionActual();
  if (!s) return;
  await fetch("/api/push/quitar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => undefined);
  await s.unsubscribe().catch(() => undefined);
}

/** Sonido corto en la página (cuando el panel está abierto), sin archivos. */
export function sonarAviso() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new Ctx();
    [0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.17);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* sin audio */ }
}
