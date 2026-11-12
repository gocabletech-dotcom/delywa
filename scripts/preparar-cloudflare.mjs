// Crea en Cloudflare los recursos que el Worker necesita y que "wrangler deploy"
// no crea por sí solo: la cola de avisos de WhatsApp (Queues, incluida en
// el plan gratuito) y la clave maestra con la que se cifran las llaves que se
// guardan en Plataforma → Integraciones. Corre al final de "npm run build", que el instalador
// ejecuta justo antes de publicar. Nunca borra nada y nunca detiene la
// instalación: si no puede comprobar algo, avisa y sigue.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const COLA = "delywa-webhooks";

function wrangler(args, entrada) {
  const r = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8", timeout: 90_000, shell: process.platform === "win32", input: entrada });
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

if (process.env.DELYWA_SIN_CLOUDFLARE === "1") {
  console.log("[preparar] Omitido (DELYWA_SIN_CLOUDFLARE=1).");
  process.exit(0);
}

/**
 * Si la cola no existe ni se puede crear, se quita del wrangler.jsonc de esta
 * copia local para que la publicación no falle. Sin cola, el webhook atiende
 * cada mensaje él mismo (funciona igual, solo que sin la espera en segundo plano).
 */
function publicarSinCola(motivo) {
  const ruta = new URL("../wrangler.jsonc", import.meta.url);
  const texto = readFileSync(ruta, "utf8");
  const sin = texto.replace(/\n\s*\/\/ Cola de avisos[^\n]*\n\s*"queues": \{[\s\S]*?\n  \},/, "");
  if (sin !== texto) writeFileSync(ruta, sin);
  console.log(`[preparar] ${motivo} Se publica sin la cola; los mensajes de WhatsApp se atienden igual.`);
}

const lista = wrangler(["queues", "list"]);
if (!lista.ok) {
  publicarSinCola("No se pudo consultar Cloudflare (sin sesión o sin conexión).");
} else if (lista.salida.includes(COLA)) {
  console.log(`[preparar] La cola ${COLA} ya existe.`);
} else {
  const creada = wrangler(["queues", "create", COLA]);
  if (creada.ok) console.log(`[preparar] Cola ${COLA} creada.`);
  else publicarSinCola(`No se pudo crear la cola ${COLA}:\n${creada.salida.slice(-600)}\n`);
}

// ---------- Clave maestra ----------
// Se crea una sola vez. Nunca se reemplaza: si cambiara, las llaves guardadas en
// el panel ya no se podrían leer y habría que escribirlas de nuevo.
const CLAVE = "DELYWA_CLAVE_MAESTRA";
const secretos = wrangler(["secret", "list", "--format", "json"]);
let nombres = null;
try {
  nombres = JSON.parse(secretos.salida.slice(secretos.salida.indexOf("["), secretos.salida.lastIndexOf("]") + 1)).map((s) => s.name);
} catch {
  nombres = null;
}
if (!secretos.ok || !nombres) {
  console.log(`[preparar] No se pudo revisar la clave maestra (sin sesión o sin conexión). Se revisará en la próxima instalación.`);
} else if (nombres.includes(CLAVE)) {
  console.log("[preparar] La clave maestra ya existe.");
} else {
  const valor = randomBytes(32).toString("base64url");
  const creada = wrangler(["secret", "put", CLAVE], valor);
  if (creada.ok) console.log("[preparar] Clave maestra creada (queda guardada solo en Cloudflare).");
  else console.log(`[preparar] No se pudo crear la clave maestra:\n${creada.salida.slice(-600)}\nEl panel de Integraciones avisará hasta que se cree.`);
}
