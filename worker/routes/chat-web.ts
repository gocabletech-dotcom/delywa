import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { getPais } from "../storage/colmados";
import { getColmadoByCodigo } from "./menu-grafico";

// Datos públicos del negocio (nombre, logo, color, formato de dirección) para la
// página de la sucursal y la entrada del portal del repartidor. El chat del
// cliente vive en routes/chat-colmado.ts con el bot propio (worker/bot).
// El chat web con IA anterior se quitó en v2.33.0.
export const chatWebRoutes = new Hono<AppEnv>();

// ---------- Datos del negocio para la página ----------

chatWebRoutes.get("/api/chat-web/colmado/:codigo", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const pais = colmado.paisId ? await getPais(db, colmado.paisId) : undefined;
  return c.json({
    id: colmado.id, nombre: colmado.nombre, logo: colmado.logo, colorPrimario: colmado.colorPrimario,
    whatsappNumero: colmado.whatsappNumero, direccion: colmado.direccion, tipoNegocio: colmado.tipoNegocio,
    etiquetaEstado: pais?.etiquetaEstado ?? "Provincia",
    etiquetaCodigoPostal: pais?.etiquetaCodigoPostal ?? null,
    requiereCodigoPostal: pais?.requiereCodigoPostal ?? false,
    ejemploDireccion: pais?.ejemploDireccion ?? "Calle Principal #123",
    ejemploCiudad: pais?.ejemploCiudad ?? "Santo Domingo",
    ejemploEstado: pais?.ejemploEstado ?? "Distrito Nacional",
    ejemploCodigoPostal: pais?.ejemploCodigoPostal ?? null,
    patronCodigoPostal: pais?.patronCodigoPostal ?? null,
    codigoPais: pais?.codigo ?? "DO",
  });
});
