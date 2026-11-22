import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Loader2, Phone } from "lucide-react";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Salud: cómo va la plataforma en una sola pantalla.

type Salud = {
  negocios: Record<string, number>;
  pedidos: { ultimas24h: number; porEstado24h: Record<string, number>; ultimos7d: number; vendido7d: number };
  masPedidos7d: Array<{ colmadoId: number; nombre: string; n: number }>;
  sinPedidos14d: Array<{ id: number; nombre: string; telefono: string | null }>;
  errores: { ultimas24h: number; porRuta: Array<{ ruta: string | null; n: number }> };
  chats24h: number;
  ia: { neuronas: number; cupo: number; llamadasTexto: number; notasDeVoz: number; sinCupo: number };
  respaldo: { dia: string; estado: string; filas: number } | null;
  avisos: string[];
};

const ESTADOS: Record<string, string> = { activo: "Activos", pendiente_revision: "En revisión", rechazado: "Rechazados", suspendido: "Suspendidos", inactivo: "Inactivos" };

function Cifra({ valor, texto, tono = "slate" }: { valor: string | number; texto: string; tono?: "slate" | "emerald" | "amber" | "red" }) {
  const fondo = { slate: "bg-slate-50 text-slate-900", emerald: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-800" }[tono];
  return <div className={`rounded-xl p-3 ${fondo}`}><p className="text-2xl font-bold">{valor}</p><p className="text-xs text-slate-600">{texto}</p></div>;
}

export function SaludSection() {
  const { data, isLoading, error } = useQuery<Salud>({ queryKey: ["/api/admin/salud"], queryFn: () => pedirJSON<Salud>("GET", "/api/admin/salud"), refetchInterval: 60_000 });
  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />;
  if (error || !data) return <p className="text-red-700">No se pudo cargar la salud de la plataforma.</p>;
  const pIa = Math.min(100, Math.round((data.ia.neuronas / Math.max(1, data.ia.cupo)) * 100));
  return (
    <div className="space-y-5" data-testid="seccion-salud">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Activity className="w-6 h-6 text-emerald-600" />Salud de la plataforma</h2>
        <p className="text-sm text-slate-500">Se actualiza sola cada minuto.</p>
      </div>

      {data.avisos.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-1">
          {data.avisos.map((a) => <p key={a} className="flex gap-2 text-amber-900 text-sm"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a}</p>)}
        </div>
      ) : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm">✅ Todo en orden.</p>}

      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-slate-800">Negocios</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(ESTADOS).filter(([k]) => data.negocios[k]).map(([k, t]) => (
            <Cifra key={k} valor={data.negocios[k]} texto={t} tono={k === "activo" ? "emerald" : k === "pendiente_revision" ? "amber" : "slate"} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-slate-800">Pedidos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Cifra valor={data.pedidos.ultimas24h} texto="últimas 24 horas" tono="emerald" />
          <Cifra valor={data.pedidos.porEstado24h.entregado ?? 0} texto="entregados (24 h)" />
          <Cifra valor={data.pedidos.ultimos7d} texto="últimos 7 días" />
          <Cifra valor={`RD$${data.pedidos.vendido7d.toLocaleString("es-DO")}`} texto="entregado en 7 días" />
        </div>
        {data.masPedidos7d.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-slate-700 mb-1">Los que más pedidos tuvieron (7 días)</p>
            <ol className="list-decimal pl-5 text-slate-600">{data.masPedidos7d.map((m) => <li key={m.colmadoId}>{m.nombre}: {m.n}</li>)}</ol>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-2">
        <h3 className="font-semibold text-slate-800">Activos sin pedidos en 14 días ({data.sinPedidos14d.length})</h3>
        <p className="text-sm text-slate-500">Negocios aprobados que no están usando Delywa. Una llamada a tiempo evita que se vayan.</p>
        {data.sinPedidos14d.length ? (
          <ul className="divide-y text-sm">
            {data.sinPedidos14d.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                <span>{s.nombre}</span>
                {s.telefono && <a className="inline-flex items-center gap-1 text-emerald-700 font-medium" href={`https://wa.me/${s.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone className="w-4 h-4" />Escribir</a>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-600">Todos los negocios activos tuvieron pedidos. 👏</p>}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-slate-800">Sistema</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Cifra valor={data.errores.ultimas24h} texto="errores (24 h)" tono={data.errores.ultimas24h >= 20 ? "red" : "slate"} />
          <Cifra valor={data.chats24h} texto="chats nuevos (24 h)" />
          <Cifra valor={`${pIa}%`} texto={`IA de hoy (${data.ia.neuronas.toLocaleString("es-DO")} de ${data.ia.cupo.toLocaleString("es-DO")})`} tono={pIa >= 80 ? "amber" : "slate"} />
          <Cifra valor={data.respaldo ? data.respaldo.dia.slice(5) : "—"} texto={data.respaldo ? `último respaldo (${data.respaldo.estado === "listo" ? "listo" : data.respaldo.estado})` : "sin respaldos"} tono={data.respaldo?.estado === "fallido" ? "red" : "slate"} />
        </div>
        {data.errores.porRuta.length > 0 && (
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-700">Dónde fallan más (24 h)</p>
            {data.errores.porRuta.map((e) => <p key={e.ruta ?? "?"} className="font-mono text-xs">{e.n} × {e.ruta ?? "—"}</p>)}
          </div>
        )}
      </section>
    </div>
  );
}
