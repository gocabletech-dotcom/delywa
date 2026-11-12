import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * Sala de tiempo real de un negocio (Durable Object, uno por sucursal).
 * Los paneles abiertos se conectan por WebSocket; cuando algo cambia (pedido nuevo,
 * mensaje de WhatsApp, repartidor asignado) el Worker avisa aquí y la sala reenvía
 * el aviso a todas las pantallas, que recargan solo esa parte.
 *
 * Usa la API de hibernación: mientras nadie habla, el objeto duerme y no cobra tiempo.
 * El aviso solo dice "qué cambió", nunca datos de clientes: cada pantalla vuelve a
 * pedir la información por la API normal, con sus permisos.
 */
export class SalaNegocio extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // El "ping" del navegador se contesta sin despertar al objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/conectar") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Se esperaba WebSocket", { status: 426 });
      // Tope por sala para que una pestaña con fallas no la sature.
      if (this.ctx.getWebSockets().length >= 200) return new Response("Sala llena", { status: 503 });
      const { 0: cliente, 1: servidor } = new WebSocketPair();
      this.ctx.acceptWebSocket(servidor);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (pathname === "/avisar" && request.method === "POST") {
      const aviso = (await request.text()).slice(0, 500);
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(aviso); } catch { /* conexión ya cerrada */ }
      }
      return new Response(null, { status: 204 });
    }
    return new Response("No encontrado", { status: 404 });
  }

  // Las pantallas no envían nada útil; solo el ping, que se responde solo.
  async webSocketMessage(): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "Hasta luego"); } catch { /* ya cerrada */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, "Error"); } catch { /* ya cerrada */ }
  }
}
