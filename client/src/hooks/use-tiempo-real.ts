import { useEffect } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";

// Tiempo real del panel del negocio: una conexión WebSocket con la sala del negocio
// (Durable Object). Cuando el servidor avisa "cambiaron los pedidos", se recargan solo
// las consultas de pedidos, sin esperar a la siguiente recarga automática.
// Si la conexión falla, el panel sigue funcionando con su recarga periódica de siempre.

type Tema = "pedidos" | "conversaciones" | "deliveries" | "todo";

const PATRONES: Record<Exclude<Tema, "todo">, RegExp> = {
  pedidos: /pedido|venta|cocina|cuadre|vuelto/,
  conversaciones: /conversacion|mensaje|unread|cliente/,
  deliveries: /deliver|repartidor|ruta|saldo|pago/,
};

export function consultaAfectada(query: Pick<Query, "queryKey">, temas: Tema[]): boolean {
  const clave = JSON.stringify(query.queryKey).toLowerCase();
  if (temas.includes("todo")) return Object.values(PATRONES).some((p) => p.test(clave));
  return temas.some((t) => t !== "todo" && PATRONES[t].test(clave));
}

export function useTiempoReal(colmadoId: number | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!colmadoId || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let reintento: ReturnType<typeof setTimeout> | undefined;
    let espera = 2_000;
    let cerrado = false;
    let fallosSeguidos = 0;

    const recargar = (temas: Tema[]) => queryClient.invalidateQueries({ predicate: (q) => consultaAfectada(q, temas) });

    const conectar = () => {
      const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocolo}//${window.location.host}/api/tiempo-real?colmadoId=${colmadoId}`);
      let abierto = false;
      ws.onopen = () => {
        abierto = true;
        fallosSeguidos = 0;
        espera = 2_000;
        // Pudo haber cambios mientras no había conexión.
        recargar(["todo"]);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 30_000);
      };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const aviso = JSON.parse(String(e.data));
          if (aviso?.tipo === "cambio" && Array.isArray(aviso.temas)) recargar(aviso.temas);
        } catch { /* aviso desconocido */ }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (cerrado) return;
        if (!abierto) fallosSeguidos += 1;
        // Tras varios fallos seguidos (servidor sin tiempo real) se deja de insistir; queda la recarga periódica.
        if (fallosSeguidos >= 6) return;
        reintento = setTimeout(conectar, espera);
        espera = Math.min(espera * 2, 60_000);
      };
    };

    conectar();
    return () => {
      cerrado = true;
      clearInterval(ping);
      clearTimeout(reintento);
      ws?.close(1000);
    };
  }, [colmadoId, queryClient]);
}
