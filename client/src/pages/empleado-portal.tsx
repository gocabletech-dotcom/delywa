import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Clock3, LogIn, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Session = { authenticated: boolean; employee?: { nombres: string; apellidos: string | null; puesto: string | null }; sucursalId?: number; asistencia?: { entrada: string; horasTrabajadas: string | null } | null };

export default function EmpleadoPortalPage() {
  const { codigo } = useParams<{ codigo?: string }>();
  const { toast } = useToast();
  const [code, setCode] = useState((codigo || "").toUpperCase());
  const [branchOptions, setBranchOptions] = useState<Array<{ id: number; nombre: string }>>([]);
  const [branchId, setBranchId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadSession = async () => {
    const response = await fetch("/api/empleado/portal/session");
    const data = await response.json();
    setSession(data.authenticated ? data : null);
    setLoading(false);
  };
  useEffect(() => { loadSession(); }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/empleado/portal/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigoAcceso: code, sucursalId: branchId || undefined }) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) {
      if (data.sucursales) setBranchOptions(data.sucursales);
      toast({ title: "No se pudo iniciar sesión", description: data.error, variant: "destructive" });
      return;
    }
    setBranchOptions([]); await loadSession();
  };
  const mark = async (action: "entrada" | "salida") => {
    setBusy(true);
    const response = await fetch(`/api/empleado/portal/${action}`, { method: "POST" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) toast({ title: "No se pudo registrar", description: data.error, variant: "destructive" });
    else await loadSession();
  };
  const logout = async () => { await fetch("/api/empleado/portal/logout", { method: "POST" }); setSession(null); setCode(""); };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="text-center mb-6"><div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-primary flex items-center justify-center text-white"><Clock3 /></div><h1 className="text-2xl font-bold">Control de asistencia</h1><p className="text-sm text-gray-500">Acceso privado para empleados</p></div>
      {!session ? <div className="bg-white rounded-2xl shadow-sm p-6"><form onSubmit={login} className="space-y-4"><div><Label htmlFor="employee-code">Código de acceso</Label><Input id="employee-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej. A7K2PM" maxLength={6} className="mt-1 text-center tracking-[0.3em] uppercase" required /></div>{branchOptions.length > 0 && <div><Label>Sucursal de trabajo</Label><select className="w-full h-10 rounded-md border px-3 text-sm mt-1" value={branchId} onChange={(e) => setBranchId(e.target.value)} required><option value="">Selecciona una sucursal</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></div>}<Button className="w-full" disabled={busy}>{busy ? "Validando..." : "Entrar"}</Button></form><p className="text-xs text-gray-400 text-center mt-4 flex items-center justify-center gap-1"><ShieldCheck className="w-3 h-3" />No compartas tu código de acceso</p></div>
        : <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5"><div><h2 className="text-xl font-semibold">{session.employee?.nombres} {session.employee?.apellidos}</h2><p className="text-sm text-gray-500">{session.employee?.puesto || "Empleado"}</p></div>{session.asistencia ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-4"><p className="font-medium text-amber-900">Jornada abierta</p><p className="text-sm text-amber-700 mt-1">Entrada: {new Date(session.asistencia.entrada).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</p><Button className="w-full mt-4" onClick={() => mark("salida")} disabled={busy}><LogOut className="w-4 h-4 mr-2" />Marcar salida</Button></div> : <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4"><p className="font-medium text-emerald-900">No tienes una jornada abierta</p><Button className="w-full mt-4" onClick={() => mark("entrada")} disabled={busy}><LogIn className="w-4 h-4 mr-2" />Marcar entrada</Button></div>}<Button variant="ghost" className="w-full" onClick={logout}>Cerrar sesión</Button></div>}
    </div>
  </div>;
}