// @vitest-environment node
// Pruebas con D1 local en memoria, datos inventados, IA simulada y WhatsApp simulado:
// no sale ningún mensaje real, no se llama a OpenAI y nunca se toca la base real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, deliveries, pedidos, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { ia } from "../chat/adaptador";
import { firmaWebhookEvolution, http } from "../lib/whatsapp";
import { pausas, type AvisoWebhook } from "../routes/webhooks";
import worker from "../index";

let t: Awaited<ReturnType<typeof createTestApp>>;
let meta: any, evo: any;
let salientes: Array<{ url: string; body: any }> = [];
let llamadasIA = 0;
const fetchOriginal = http.fetch;
const crearOriginal = ia.crear;
const pausaOriginal = { ...pausas };

async function firmar(cuerpo: string, secreto = "secreto-app") {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cuerpo)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
let consecutivo = 0;
function avisoMeta(texto: string, from = "18095551234", id = `wamid.${++consecutivo}`) {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "PN-PRUEBA" }, contacts: [{ profile: { name: "Ana" } }], messages: [{ id, from, type: "text", text: { body: texto } }],
  } }] }] });
}
async function recibirMeta(cuerpo: string, firma?: string) {
  return t.client().raw("POST", "/api/webhook/whatsapp", cuerpo, { "Content-Type": "application/json", "x-hub-signature-256": firma ?? (await firmar(cuerpo)) });
}
const textos = () => salientes.map((s) => s.body?.text?.body ?? s.body?.text ?? "");

beforeAll(async () => {
  t = await createTestApp();
  delete t.env.COLA_WEBHOOKS;
  t.env.META_APP_SECRET = "secreto-app";
  pausas.sinCola = [0, 0];
  pausas.enCola = [0, 0];
  const horario = { horaApertura: "00:00", horaCierre: "23:59", planId: 1, costoDelivery: "50" };
  [meta] = await t.db.insert(colmados).values({ ...horario, nombre: "Colmado Meta", slug: "colmado-meta", whatsappNumero: "18093330001", direccion: "A",
    whatsappPhoneNumberId: "PN-PRUEBA", whatsappAccessToken: "token-negocio", tecnologiasHabilitadas: { meta: true } }).returning();
  [evo] = await t.db.insert(colmados).values({ ...horario, nombre: "Colmado Evo", slug: "colmado-evo", whatsappNumero: "18093330002", direccion: "B",
    whatsappProvider: "evolution", evolutionApiUrl: "https://evo.ejemplo.test", evolutionApiKey: "llave-evo", evolutionInstanceName: "tienda_evo",
    tecnologiasHabilitadas: { api_evo: true } }).returning();
  ia.crear = () => ({ chat: { completions: { create: async (args: any) => {
    llamadasIA++;
    const ultimo = String(args.messages.at(-1).content).toLowerCase();
    const datos = ultimo.includes("pan")
      ? { respuesta: "Anotado", productos: [{ nombre: "Pan", monto: 50, cantidad: 2, jergaOriginal: "pan" }], crearPedido: true }
      : { respuesta: "¿Qué deseas pedir?", productos: null, crearPedido: false };
    return { choices: [{ message: { content: JSON.stringify(datos) } }] };
  } } } }) as any;
  http.fetch = async (url, init) => {
    salientes.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
}, 60_000);
afterAll(async () => { http.fetch = fetchOriginal; ia.crear = crearOriginal; Object.assign(pausas, pausaOriginal); await t?.dispose(); });
beforeEach(() => { salientes = []; llamadasIA = 0; });

describe("webhook de Meta", () => {
  it("rechaza avisos sin la firma de la app", async () => {
    const cuerpo = avisoMeta("hola");
    expect((await recibirMeta(cuerpo, "sha256=" + "0".repeat(64))).status).toBe(403);
    expect((await recibirMeta(cuerpo, await firmar(cuerpo, "otro-secreto"))).status).toBe(403);
    expect((await t.client().raw("POST", "/api/webhook/whatsapp", cuerpo)).status).toBe(403);
    expect(llamadasIA).toBe(0);
    expect(await t.db.select().from(whatsappConversaciones)).toHaveLength(0);
  });

  it("el bot responde por WhatsApp y guarda la conversación", async () => {
    expect((await recibirMeta(avisoMeta("hola"))).status).toBe(200);
    expect(llamadasIA).toBe(1);
    expect(salientes).toHaveLength(1);
    expect(salientes[0].url).toMatch(/graph\.facebook\.com\/v24\.0\/PN-PRUEBA\/messages$/);
    expect(salientes[0].body).toMatchObject({ messaging_product: "whatsapp", to: "18095551234", type: "text" });
    const [conv] = await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, meta.id));
    expect(conv).toMatchObject({ clienteWhatsapp: "18095551234", noLeidosColmado: 1 });
    const mensajes = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id));
    expect(mensajes.map((m) => m.rol)).toEqual(["user", "assistant"]);
  });

  it("crea el pedido cuando el cliente pide, y no repite un aviso reenviado", async () => {
    const cuerpo = avisoMeta("quiero 2 pan");
    await recibirMeta(cuerpo);
    const lista = await t.db.select().from(pedidos).where(eq(pedidos.colmadoId, meta.id));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ clienteWhatsapp: "18095551234", estado: "pendiente_confirmacion" });
    expect(JSON.parse(lista[0].productos)[0]).toMatchObject({ nombre: "Pan", monto: 50 });
    expect(textos().join("\n")).toContain(`Pedido #${lista[0].id}`);

    // Meta reenvía el mismo aviso: no hay segundo pedido ni segunda respuesta.
    salientes = []; llamadasIA = 0;
    expect((await recibirMeta(cuerpo)).status).toBe(200);
    expect(llamadasIA).toBe(0);
    expect(salientes).toHaveLength(0);
    expect(await t.db.select().from(pedidos).where(eq(pedidos.colmadoId, meta.id))).toHaveLength(1);
  });

  it("ignora avisos de estado y de números que no son de ningún negocio", async () => {
    const estado = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN-PRUEBA" }, statuses: [{ id: "x", status: "read" }] } }] }] });
    expect((await recibirMeta(estado)).status).toBe(200);
    const ajeno = avisoMeta("hola").replace("PN-PRUEBA", "PN-DESCONOCIDO");
    expect((await recibirMeta(ajeno)).status).toBe(200);
    expect(llamadasIA).toBe(0);
    expect(salientes).toHaveLength(0);
  });

  it("un repartidor se activa con un comando, sin pasar por la IA", async () => {
    const [d] = await t.db.insert(deliveries).values({ colmadoId: meta.id, nombre: "Rafa", whatsappNumero: "+1 809-444-0001", estado: "en_descanso" }).returning();
    await recibirMeta(avisoMeta("activo", "18094440001"));
    expect(llamadasIA).toBe(0);
    const [despues] = await t.db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(despues.estado).toBe("activo");
    expect(despues.ultimaActivacion).toBeInstanceOf(Date);
    expect(salientes[0].body.to).toBe("18094440001");
  });
});

describe("cola de avisos", () => {
  it("el webhook encola y responde enseguida; el bot atiende desde la cola", async () => {
    const encolados: AvisoWebhook[] = [];
    t.env.COLA_WEBHOOKS = { send: async (m: AvisoWebhook) => { encolados.push(m); } } as any;
    try {
      expect((await recibirMeta(avisoMeta("hola", "18095557777"))).status).toBe(200);
      expect(encolados).toHaveLength(1);
      expect(llamadasIA).toBe(0);
      expect(salientes).toHaveLength(0);

      let confirmados = 0;
      await worker.queue!({ messages: encolados.map((body) => ({ body, ack: () => { confirmados++; } })) } as any, t.env, {} as any);
      expect(confirmados).toBe(1);
      expect(llamadasIA).toBe(1);
      expect(salientes[0].body.to).toBe("18095557777");
    } finally {
      delete t.env.COLA_WEBHOOKS;
    }
  });
});

describe("webhook de Evolution", () => {
  const aviso = (texto: string, id: string, fromMe = false) => JSON.stringify({ event: "messages.upsert", data: { key: { remoteJid: "18095558888@s.whatsapp.net", fromMe, id }, message: { conversation: texto } } });
  const recibir = async (cuerpo: string, firma?: string, instancia = "tienda_evo") =>
    t.client().raw("POST", `/api/webhook/evolution/${instancia}?firma=${firma ?? (await firmaWebhookEvolution({ apiKey: "llave-evo", instancia: "tienda_evo" }))}`, cuerpo, { "Content-Type": "application/json" });

  it("solo acepta avisos con la firma de la instancia del negocio", async () => {
    expect((await recibir(aviso("hola", "A1"), "firma-falsa")).status).toBe(403);
    expect((await recibir(aviso("hola", "A1"), undefined, "instancia_inexistente")).status).toBe(404);
    expect(llamadasIA).toBe(0);
  });

  it("atiende el mensaje una vez y responde por Evolution", async () => {
    expect((await recibir(aviso("hola", "B1"))).status).toBe(200);
    expect(llamadasIA).toBe(1);
    expect(salientes[0].url).toBe("https://evo.ejemplo.test/message/sendText/tienda_evo");
    expect(salientes[0].body.number).toBe("18095558888");
    // Aviso repetido y mensajes propios: no hacen nada.
    await recibir(aviso("hola", "B1"));
    await recibir(aviso("mensaje del negocio", "B2", true));
    expect(llamadasIA).toBe(1);
    expect(await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, evo.id))).toHaveLength(1);
  });
});
