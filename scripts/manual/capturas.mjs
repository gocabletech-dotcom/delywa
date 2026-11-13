// Genera las capturas del manual (client/public/manual/img/*.jpg) y la posición de cada punto
// interactivo (client/src/manual/capturas.json), igual que el manual de FoodPOS.
//
// Usa una base D1 LOCAL aparte (.wrangler/manual) con datos de demostración
// (scripts/manual/demo.sql). Nunca toca producción ni la base local de trabajo.
//
// Uso (después de `npm run build` y de `git checkout wrangler.jsonc`):
//   npm i --no-save puppeteer-core
//   CHROME=/ruta/a/chrome node scripts/manual/capturas.mjs
// En Windows CHROME suele ser "C:\Program Files\Google\Chrome\Application\chrome.exe".
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUERTO = Number(process.env.PUERTO || 8797);
const B = `http://localhost:${PUERTO}`;
const PERSIST = path.join(RAIZ, ".wrangler", "manual");
const IMG = path.join(RAIZ, "client", "public", "manual", "img");
const SALIDA = path.join(RAIZ, "client", "src", "manual", "capturas.json");
const TESELA = fs.readFileSync(path.join(RAIZ, "scripts", "manual", "tile.png"));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- contenido del manual (TypeScript → módulo en memoria) ----------
const ts = fs.readFileSync(path.join(RAIZ, "client", "src", "manual", "guia.ts"), "utf8");
const tmp = path.join(RAIZ, ".wrangler", "guia-manual.mjs");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, transformSync(ts, { loader: "ts", format: "esm" }).code);
const { GUIA } = await import(pathToFileURL(tmp).href + `?v=${Date.now()}`);

// ---------- base de demostración y servidor local ----------
const wrangler = (args) => execSync(`npx wrangler ${args}`, { cwd: RAIZ, stdio: "pipe", env: { ...process.env, DELYWA_SIN_CLOUDFLARE: "1" } });
fs.rmSync(PERSIST, { recursive: true, force: true });
wrangler(`d1 migrations apply delywa-db --local --persist-to "${PERSIST}"`);
wrangler(`d1 execute delywa-db --local --persist-to "${PERSIST}" --file scripts/manual/demo.sql`);
const servidor = spawn("npx", ["wrangler", "dev", "--local", "--port", String(PUERTO), "--persist-to", PERSIST], {
  cwd: RAIZ, env: { ...process.env, DELYWA_SIN_CLOUDFLARE: "1" }, stdio: "ignore", shell: process.platform === "win32",
});
const apagar = () => { try { servidor.kill(); } catch { /* ya terminó */ } };
process.on("exit", apagar);
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + "/")).ok) break; } catch { /* arrancando */ } await espera(1000); }

const { default: puppeteer } = await import(process.env.PUPPETEER_CORE || "puppeteer-core");
const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--lang=es-DO", "--accept-lang=es-DO,es"],
  env: { ...process.env, LANG: "es_DO.UTF-8", LANGUAGE: "es_DO:es" },
});
fs.mkdirSync(IMG, { recursive: true });
const CAP = {};
const faltan = [];

/** Bloquea lo externo: el mapa usa una tesela de muestra y la búsqueda de direcciones responde vacío. */
async function preparar(page) {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (/tile\.openstreetmap\.org/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: TESELA });
    if (/nominatim\.openstreetmap\.org/.test(u)) return r.respond({ status: 200, contentType: "application/json", body: "[]" });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.abort();
    return r.continue();
  });
  await page.emulateTimezone("America/Santo_Domingo");
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-DO,es;q=0.9" });
}

async function nueva(movil, contexto) {
  const ctx = contexto || (await navegador.createBrowserContext());
  const page = await ctx.newPage();
  await page.setViewport(movil ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 });
  await preparar(page);
  return page;
}

/** Toma la captura y calcula los puntos de cada tema que la usa. */
async function capturar(page, cap) {
  await espera(900);
  // En las capturas se ve la dirección real de Delywa, no la del servidor local.
  await page.evaluate((origen) => {
    const fuera = (t) => t.split(origen).join("https://delywa.com");
    for (const i of document.querySelectorAll("input")) if (i.value.includes(origen)) i.value = fuera(i.value);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes(origen)) n.nodeValue = fuera(n.nodeValue);
  }, B);
  const archivo = `${cap}.jpg`;
  await page.screenshot({ path: path.join(IMG, archivo), type: "jpeg", quality: 74 });
  const vp = page.viewport();
  for (const [man, M] of Object.entries(GUIA)) for (const mod of M.modulos.filter((m) => m.cap === cap)) {
    const spots = [];
    for (const [sel] of mod.spots) {
      const r = await page.evaluate((sel) => {
        let els = [];
        for (const s of sel.split(",")) { try { els = els.concat([...document.querySelectorAll(s.trim())]); } catch { /* selector inválido */ } }
        const el = els.find((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; });
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
      }, sel);
      if (!r) { faltan.push(`${man}.${mod.id}: ${sel}`); spots.push(null); continue; }
      const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(vp.width, r.x + r.w), y1 = Math.min(vp.height, r.y + r.h);
      const grande = r.w > 240 || r.h > 130; // en cajas grandes el punto va arriba a la izquierda
      const px = grande ? x0 + 20 : (x0 + x1) / 2, py = grande ? y0 + 20 : (y0 + y1) / 2;
      const pc = (v, t) => Math.round((v / t) * 10000) / 100;
      spots.push({ x: pc(px, vp.width), y: pc(py, vp.height), bx: pc(x0, vp.width), by: pc(y0, vp.height), bw: pc(x1 - x0, vp.width), bh: pc(y1 - y0, vp.height) });
    }
    CAP[`${man}.${mod.id}`] = { img: archivo, w: vp.width, h: vp.height, spots };
  }
  console.log("✓", cap);
}

const ir = async (page, ruta, selector) => {
  await page.goto(B + ruta, { waitUntil: "networkidle0" });
  if (selector) await page.waitForSelector(selector, { visible: true, timeout: 20000 }).catch(() => console.log("  (no apareció)", selector));
  await espera(600);
};
const tocarTexto = (page, contenedor, texto) => page.evaluate((c, t) => {
  const b = [...document.querySelectorAll(`${c} button`)].find((x) => x.innerText.trim().includes(t));
  if (b) b.click();
  return !!b;
}, contenedor, texto);
const verAlCentro = (page, sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel);
/** Espera a que el bot responda con un botón que contenga el texto. */
async function esperarOpcion(page, texto, ms = 60000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const hay = await page.evaluate((t) => [...document.querySelectorAll('[data-testid="opciones-rapidas"] button')].some((b) => b.innerText.includes(t)), texto);
    if (hay) return true;
    await espera(800);
  }
  console.log("  (el bot no ofreció)", texto);
  return false;
}

try {
  // ===================== CLIENTE (celular) =====================
  const cli = await nueva(true);
  await cli.browserContext().overridePermissions(B, ["geolocation"]);
  await cli.setGeolocation({ latitude: 18.4855, longitude: -69.8721 });
  await ir(cli, "/pedir/colmado-el-sol", '[data-testid="input-nombre-chat"]');
  await capturar(cli, "c-entrar");
  await cli.type('[data-testid="input-nombre-chat"]', "Laura Gómez");
  await cli.type('[data-testid="input-telefono-chat"]', "8095557788");
  await cli.click('[data-testid="button-entrar-chat"]');
  await cli.waitForSelector('[data-testid="input-mensaje"]', { visible: true });
  await espera(3500);
  await cli.type('[data-testid="input-mensaje"]', "2 libras de arroz, un aceite y 10 pesos de ajo");
  await cli.click('[data-testid="button-enviar"]');
  await esperarOpcion(cli, "Eso es todo");
  await capturar(cli, "c-pedir");
  await tocarTexto(cli, '[data-testid="opciones-rapidas"]', "Eso es todo");
  await esperarOpcion(cli, "ubicación");
  await capturar(cli, "c-ubicacion");
  await tocarTexto(cli, '[data-testid="opciones-rapidas"]', "ubicación");
  await esperarOpcion(cli, "Efectivo");
  await capturar(cli, "c-pagar");
  await tocarTexto(cli, '[data-testid="opciones-rapidas"]', "Efectivo");
  await esperarOpcion(cli, "1000");
  await tocarTexto(cli, '[data-testid="opciones-rapidas"]', "1000");
  await cli.waitForSelector('[data-testid="estado-pedido"]', { visible: true, timeout: 60000 }).catch(() => {});
  await espera(12000);
  await capturar(cli, "c-seguimiento");

  // ===================== NEGOCIO, parte 1 (computadora) =====================
  const neg = await nueva(false);
  await ir(neg, "/login", '[data-testid="input-username"]');
  await neg.type('[data-testid="input-username"]', "demo@delywa.test");
  await neg.type('[data-testid="input-password"]', "clave-demo-12345");
  await neg.click('[data-testid="button-submit-login"]');
  await neg.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
  await ir(neg, "/negocio/dashboard", '[data-testid="stat-pendientes"]');
  await capturar(neg, "inicio");
  await ir(neg, "/negocio/pedidos", '[data-testid="columna-confirmar"]');
  await capturar(neg, "pedidos");
  await verAlCentro(neg, '[data-testid="retorno-abierto-6"]');
  await capturar(neg, "retorno");
  await verAlCentro(neg, '[data-testid="transferencia-10"]');
  await capturar(neg, "transferencia");
  await ir(neg, "/negocio/pedidos", '[data-testid="principal-1"]');
  await neg.click('[data-testid="principal-1"]');
  await neg.waitForSelector('[role="dialog"]', { visible: true, timeout: 8000 }).catch(() => {});
  const precios = await neg.$$('[role="dialog"] input[step="0.01"]');
  for (const [k, v] of [[0, "45"], [1, "280"]]) if (precios[k]) { await precios[k].click({ clickCount: 3 }); await precios[k].type(v); }
  await neg.evaluate(() => document.activeElement?.blur());
  await capturar(neg, "confirmar");
  await ir(neg, "/negocio/pedidos", '[data-testid="principal-4"]');
  await neg.click('[data-testid="principal-4"]');
  await neg.waitForSelector('[role="dialog"]', { visible: true, timeout: 8000 }).catch(() => {});
  await capturar(neg, "asignar");
  await neg.click('[data-testid="select-delivery-1"]');
  await neg.waitForSelector('[data-testid^="asignar-input-vuelto"]', { visible: true, timeout: 10000 }).catch(() => {});
  const vuelto = await neg.$('[data-testid^="asignar-input-vuelto"]');
  if (vuelto) { await vuelto.click({ clickCount: 3 }); await vuelto.type("420"); }
  await capturar(neg, "devuelta");
  await neg.keyboard.press("Escape");
  await ir(neg, "/negocio/pedidos", '[data-testid="columna-confirmar"]');
  await neg.evaluate(() => [...document.querySelectorAll('button, [role="tab"]')].find((b) => b.innerText.trim().startsWith("Historial"))?.click());
  await neg.waitForSelector('[data-testid="lista-historial"]', { visible: true, timeout: 8000 }).catch(() => {});
  await capturar(neg, "historial");
  await ir(neg, "/negocio/conversaciones", '[data-testid^="conversacion-"]');
  await capturar(neg, "chats");
  await neg.click('[data-testid^="conversacion-"]');
  await espera(1500);
  await capturar(neg, "chat-abierto");
  // ===================== REPARTIDOR (celular) =====================
  const rep0 = await nueva(true);
  await ir(rep0, "/repartidor/colmado-el-sol", '[data-testid="input-whatsapp-login"]');
  await capturar(rep0, "r-entrar");
  const rep = await nueva(true);
  await ir(rep, "/repartidor/colmado-el-sol?tel=18095559999&c=AB3X7K", '[data-testid^="pedido-card-"]');
  await capturar(rep, "r-entregas");
  await verAlCentro(rep, '[data-testid^="btn-entregado-"], [data-testid^="button-entregado-"]');
  await capturar(rep, "r-entregar");
  await verAlCentro(rep, '[data-testid="transferencia-sin-aprobar-10"]');
  await capturar(rep, "r-transferencia");
  await rep.evaluate(() => window.scrollTo(0, 0));
  await rep.evaluate(() => (document.querySelector('[data-testid^="btn-retorno-"], [data-testid^="button-retorno-"]'))?.click());
  await rep.waitForSelector('[data-testid="retorno-modal"]', { visible: true, timeout: 8000 }).catch(() => {});
  await capturar(rep, "r-noentregado");
  await rep.evaluate(() => document.querySelector('[data-testid="button-close-retorno-modal"]')?.click());
  await espera(500);
  await verAlCentro(rep, '[data-testid="devolver-6"]');
  await capturar(rep, "r-devolver");
  await rep.evaluate(() => window.scrollTo(0, 0));
  await rep.click('[data-testid="tab-rutas"]');
  await espera(800);
  await rep.evaluate(() => document.querySelector('[data-testid="button-optimizar-ruta"]')?.click());
  await rep.waitForSelector('[data-testid="mapa-ruta"]', { visible: true, timeout: 15000 }).catch(() => {});
  await espera(2500);
  await capturar(rep, "r-ruta");
  await rep.click('[data-testid="tab-cuadre"]');
  await espera(800);
  await rep.evaluate(() => document.querySelector('[data-testid="button-cuadrar"]')?.click());
  await rep.waitForSelector('[data-testid="cuadre-modal"]', { visible: true, timeout: 8000 }).catch(() => {});
  await capturar(rep, "r-cuadre");
  await rep.evaluate(() => document.querySelector('[data-testid="button-confirmar-cuadre"]')?.click());
  await espera(1500);
  await rep.click('[data-testid="tab-historial"]');
  await espera(800);
  await rep.evaluate(() => document.querySelector('[data-testid="historial-abrir-7"]')?.click());
  await espera(800);
  await capturar(rep, "r-historial");

  // ===================== NEGOCIO, parte 2: cuadres y ajustes =====================
  for (const [cap, ruta, sel] of [
    ["repartidores", "/negocio/deliveries", '[data-testid^="delivery-card-"]'],
    ["cuadres", "/negocio/cuadres", '[data-testid="filter-cuadre-pendiente"]'],
    ["ventas", "/negocio/ventas", '[data-testid="ventas-hoy-total"]'],
    ["reportes", "/negocio/reportes", "main table"],
    ["clientes", "/negocio/clientes", '[data-testid^="cliente-"]'],
    ["empleados", "/negocio/empleados", "main"],
    ["whatsapp", "/negocio/whatsapp-config", "main"],
    ["sucursales", "/negocio/sucursales", '[data-testid="form-sucursal"]'],
    ["usuarios", "/negocio/usuarios", '[data-testid="descripcion-rol"]'],
    ["configuracion", "/negocio/settings", '[data-testid="seccion-datos"]'],
  ]) {
    await ir(neg, ruta, sel);
    await capturar(neg, cap);
    if (cap === "cuadres") {
      await neg.evaluate(() => document.querySelector('[data-testid^="ver-cuadre-"]')?.click());
      await neg.waitForSelector('[data-testid^="input-monto-recibido-"]', { visible: true, timeout: 8000 }).catch(() => {});
      await capturar(neg, "cuadre-ver");
      await neg.keyboard.press("Escape");
    }
  }
  await neg.click('[data-testid="seccion-chat"]');
  await espera(800);
  await capturar(neg, "chat-pagina");
} finally {
  await navegador.close();
  apagar();
}

const sinCaptura = Object.entries(GUIA).flatMap(([man, M]) => M.modulos.filter((m) => m.cap && !CAP[`${man}.${m.id}`]).map((m) => `${man}.${m.id} (${m.cap})`));
fs.writeFileSync(SALIDA, JSON.stringify(CAP, null, 1) + "\n");
console.log(`\nListo: ${Object.keys(CAP).length} temas con captura.`);
if (sinCaptura.length) console.log("Temas sin captura:\n  " + sinCaptura.join("\n  "));
if (faltan.length) console.log("Puntos que no se encontraron en la captura (no se muestran):\n  " + faltan.join("\n  "));
process.exit(0);
