import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileKey2, Loader2, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PASOS_CERTIFICACION, PROVEEDOR_VACIO, TIPOS_CONTRIBUYENTE, type ProveedorFE } from "@shared/certificacion";

// Plataforma → Factura electrónica: datos del proveedor certificado (los copia cada negocio en
// el Portal de Certificación de la DGII) y avance de cada negocio en su certificación.

type FilaNegocio = {
  colmadoId: number; nombre: string; estadoNegocio: string; duenoCorreo: string | null;
  rnc: string | null; razonSocial: string | null; tipoContribuyente: string | null;
  certificado: { estado: string; subido: boolean; vence: string | null; diasParaVencer: number | null };
  avance: { listos: number; total: number; porcentaje: number; siguiente: string | null };
  autorizadoAt: string | null; actualizadoAt: string | null;
};

const campo = "w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm";
const CAMPOS: Array<[keyof ProveedorFE, string, string?]> = [
  ["nombre", "Nombre del proveedor"], ["rnc", "RNC del proveedor"], ["software", "Nombre del software"], ["version", "Versión del software"],
  ["urlRecepcion", "URL de Recepción", "https://"], ["urlAprobacion", "URL de Aprobación Comercial", "https://"],
  ["urlAutenticacion", "URL de Autenticación", "https://"], ["contacto", "Contacto (correo o teléfono)"],
];

export function FacturacionElectronicaSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: proveedor } = useQuery<ProveedorFE>({
    queryKey: ["fe-proveedor"],
    queryFn: async () => (await fetch("/api/admin/facturacion-electronica/proveedor", { credentials: "include" })).json(),
  });
  const { data: negocios = [], isLoading } = useQuery<FilaNegocio[]>({
    queryKey: ["fe-negocios"],
    queryFn: async () => (await fetch("/api/admin/facturacion-electronica/negocios", { credentials: "include" })).json(),
  });
  const [p, setP] = useState<ProveedorFE>(PROVEEDOR_VACIO);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (proveedor) setP(proveedor); }, [proveedor]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    const r = await fetch("/api/admin/facturacion-electronica/proveedor", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return toast({ title: "No se pudo guardar", description: j.error, variant: "destructive" });
    qc.setQueryData(["fe-proveedor"], j);
    toast({ title: "Proveedor guardado" });
  };

  const autorizados = negocios.filter((n) => n.autorizadoAt).length;
  const enProceso = negocios.filter((n) => !n.autorizadoAt && n.avance.listos > 0).length;

  return (
    <div className="space-y-6" data-testid="seccion-facturacion-electronica">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-600" /> Factura electrónica</h2>
        <p className="text-slate-600 mt-1">Certificación de cada negocio como emisor electrónico ante la DGII.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Proveedor certificado</h3>
        <p className="text-sm text-slate-600 mt-1">Cada negocio copia estos datos en el Portal de Certificación de la DGII («Crear Postulación»). Los da el proveedor de facturación electrónica que se elija.</p>
        <form onSubmit={guardar} className="mt-4 grid gap-3 sm:grid-cols-2">
          {CAMPOS.map(([k, etiqueta, ph]) => (
            <div key={k} className="space-y-1">
              <label htmlFor={`fe-prov-${k}`} className="text-sm font-medium text-slate-700">{etiqueta}</label>
              <input id={`fe-prov-${k}`} className={campo} value={p[k]} placeholder={ph} onChange={(e) => setP({ ...p, [k]: e.target.value })} data-testid={`fe-prov-${k}`} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" disabled={ocupado} className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50" data-testid="fe-prov-guardar">
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Guardar proveedor
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Negocios</h3>
          <p className="text-sm text-slate-600">{autorizados} autorizados · {enProceso} en proceso · {negocios.length - autorizados - enProceso} sin empezar</p>
        </div>
        {isLoading ? <p className="mt-4 text-slate-500">Cargando…</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Negocio</th>
                  <th className="py-2 pr-3 font-medium">RNC</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Certificado</th>
                  <th className="py-2 pr-3 font-medium">Avance</th>
                  <th className="py-2 font-medium">Siguiente paso</th>
                </tr>
              </thead>
              <tbody>
                {negocios.map((n) => (
                  <tr key={n.colmadoId} className="border-b border-slate-100 align-top" data-testid={`fe-negocio-${n.colmadoId}`}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-slate-900">{n.nombre}</p>
                      <p className="text-xs text-slate-500">{n.razonSocial || n.duenoCorreo || ""}</p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{n.rnc || "—"}</td>
                    <td className="py-2.5 pr-3">{n.tipoContribuyente ? TIPOS_CONTRIBUYENTE[n.tipoContribuyente] : "—"}</td>
                    <td className="py-2.5 pr-3">
                      {n.certificado.subido ? (
                        <span className={`inline-flex items-center gap-1 ${n.certificado.diasParaVencer !== null && n.certificado.diasParaVencer <= 30 ? "text-amber-700" : "text-green-700"}`}>
                          <FileKey2 className="w-4 h-4" /> Vence {n.certificado.vence}
                        </span>
                      ) : n.certificado.estado === "en_tramite" ? "En trámite" : n.certificado.estado === "listo" ? "Lo tiene (sin subir)" : "No tiene"}
                    </td>
                    <td className="py-2.5 pr-3 w-40">
                      {n.autorizadoAt ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-4 h-4" /> Autorizado</span> : (
                        <div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${n.avance.porcentaje}%` }} /></div>
                          <p className="text-xs text-slate-500 mt-1">{n.avance.listos} de {n.avance.total}</p>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-700">{n.avance.siguiente ? PASOS_CERTIFICACION.find((x) => x.clave === n.avance.siguiente)?.titulo : "Completo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
