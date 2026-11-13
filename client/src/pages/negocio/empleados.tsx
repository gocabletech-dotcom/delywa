import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Clock3, WalletCards, Plus, Pencil, UserCheck, UserX, LogIn, LogOut, Calculator, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";

type Sucursal = { id: number; nombre: string };
type Empleado = {
  id: number; nombres: string; apellidos: string | null; cedula: string | null; email: string | null;
  telefono: string | null; direccion: string | null; puesto: string | null; fechaIngreso: string | null;
  estado: string; tipoPago: string; tarifaHora: string | null; salarioFijo: string | null;
  periodoPago: string; moneda: string; notas: string | null; codigoAcceso: string | null; sucursalIds: number[];
};
type Asistencia = { id: number; empleadoId: number; sucursalId: number; entrada: string; salida: string | null; horasTrabajadas: string | null; empleadoNombre: string; sucursalNombre: string };
type NominaReglas = { horasOrdinariasDiarias: number; multiplicadorHoraExtra: number; multiplicadorFeriado: number; recargoNocturnoPorcentaje: number; retencionPorcentaje: number; retencionFija: number; feriados: string[]; horasPeriodoSalario: number; paisId?: number | null; paisCodigo?: string; origenConfiguracion?: "plantilla_pais" | "manual"; fechaConfiguracion?: string };
type PoliticaNomina = { codigo: string; nombre: string; paisId: number | null; descripcion: string; limites: { horasOrdinariasDiariasMax: number; multiplicadorHoraExtraMin: number; multiplicadorFeriadoMin: number; recargoNocturnoMax: number }; reglas: NominaReglas };
type NominaAuditoria = { id: number; actorId: string; paisId: number | null; reglasNuevas: NominaReglas; fechaCreacion: string };
type Nomina = { id: number; periodoInicio: string; periodoFin: string; estado: string; totalHoras: string; totalMonto: string; totalBruto: string; totalDescuentos: string; totalNeto: string; reglasAplicadas?: NominaReglas; detalles: Array<{ empleadoId: number; horasTrabajadas: string; horasOrdinarias: string; horasExtra: string; horasFeriado: string; bruto: string; descuentos: string; total: string }> };

const emptyForm = {
  nombres: "", apellidos: "", cedula: "", email: "", telefono: "", direccion: "", puesto: "",
  fechaIngreso: "", estado: "activo", tipoPago: "por_hora", tarifaHora: "", salarioFijo: "",
  periodoPago: "quincenal", moneda: "USD", notas: "", sucursalIds: [] as number[],
};

export default function EmpleadosPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"empleados" | "asistencia" | "nomina">("empleados");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Empleado | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [periodoInicio, setPeriodoInicio] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [periodoFin, setPeriodoFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceEmployee, setAttendanceEmployee] = useState("");
  const [attendanceBranch, setAttendanceBranch] = useState("");
  const [payrollRules, setPayrollRules] = useState<NominaReglas>({ horasOrdinariasDiarias: 8, multiplicadorHoraExtra: 1.5, multiplicadorFeriado: 2, recargoNocturnoPorcentaje: 0, retencionPorcentaje: 0, retencionFija: 0, feriados: [], horasPeriodoSalario: 160 });
  const [selectedPolicy, setSelectedPolicy] = useState("");

  const { data: branchesData } = useQuery<{ sucursales: Sucursal[] }>({
    queryKey: ["sucursales"], queryFn: async () => (await fetch("/api/negocio/sucursales")).json(), enabled: isAuthenticated,
  });
  const branches = branchesData?.sucursales || [];
  const { data: employees = [] } = useQuery<Empleado[]>({
    queryKey: ["empleados"], queryFn: async () => (await fetch("/api/negocio/empleados")).json(), enabled: isAuthenticated,
  });
  const { data: attendance = [] } = useQuery<Asistencia[]>({
    queryKey: ["asistencias"], queryFn: async () => (await fetch("/api/negocio/asistencias")).json(), enabled: isAuthenticated, refetchInterval: 30000,
  });
  const { data: payrolls = [] } = useQuery<Nomina[]>({
    queryKey: ["nominas"], queryFn: async () => (await fetch("/api/negocio/nominas")).json(), enabled: isAuthenticated,
  });
  const { data: savedRules } = useQuery<NominaReglas & { politica?: PoliticaNomina | null }>({
    queryKey: ["nomina-configuracion"], queryFn: async () => (await fetch("/api/negocio/nominas/configuracion")).json(), enabled: isAuthenticated,
  });
  const { data: policyData } = useQuery<{ paisId: number | null; politicas: PoliticaNomina[] }>({
    queryKey: ["nomina-politicas"], queryFn: async () => (await fetch("/api/negocio/nominas/politicas")).json(), enabled: isAuthenticated,
  });
  const { data: payrollAudit = [] } = useQuery<NominaAuditoria[]>({
    queryKey: ["nomina-configuracion-auditoria"], queryFn: async () => (await fetch("/api/negocio/nominas/configuracion/auditoria")).json(), enabled: isAuthenticated,
  });
  const savePayrollRules = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/negocio/nominas/configuracion", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payrollRules, paisId: payrollRules.paisId || undefined, origenConfiguracion: payrollRules.origenConfiguracion || "manual" }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo guardar"); return data;
    },
    onSuccess: (data) => { setPayrollRules(data); queryClient.invalidateQueries({ queryKey: ["nomina-configuracion"] }); queryClient.invalidateQueries({ queryKey: ["nomina-configuracion-auditoria"] }); toast({ title: "Reglas de nómina guardadas" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveEmployee = useMutation({
    mutationFn: async () => {
      const url = editing ? `/api/negocio/empleados/${editing.id}` : "/api/negocio/empleados";
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo guardar el empleado"); return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["empleados"] }); setFormOpen(false); setEditing(null); setForm(emptyForm); toast({ title: editing ? "Empleado actualizado" : "Empleado creado" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const attendanceMutation = useMutation({
    mutationFn: async ({ employeeId, branchId, action, attendanceId }: { employeeId?: number; branchId?: number; action: "entrada" | "salida"; attendanceId?: number }) => {
      const url = action === "entrada" ? "/api/negocio/asistencias/entrada" : `/api/negocio/asistencias/${attendanceId}/salida`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: action === "entrada" ? JSON.stringify({ empleadoId: employeeId, sucursalId: branchId }) : "{}" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo registrar"); return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asistencias"] }); toast({ title: "Asistencia actualizada" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const correctionMutation = useMutation({
    mutationFn: async ({ id, entrada, salida }: { id: number; entrada: string; salida: string | null }) => {
      const res = await fetch(`/api/negocio/asistencias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entrada, salida }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo corregir"); return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asistencias"] }); toast({ title: "Asistencia corregida" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const payrollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/negocio/nominas/calcular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodoInicio, periodoFin }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo calcular"); return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["nominas"] }); toast({ title: "Nómina calculada" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const payrollStatusMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: "cerrada" | "pagada" }) => {
      const res = await fetch(`/api/negocio/nominas/${id}/estado`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo actualizar"); return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nominas"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, sucursalIds: branches[0] ? [branches[0].id] : [] }); setFormOpen(true); };
  const openEdit = (employee: Empleado) => {
    setEditing(employee);
    setForm({ nombres: employee.nombres, apellidos: employee.apellidos || "", cedula: employee.cedula || "", email: employee.email || "", telefono: employee.telefono || "", direccion: employee.direccion || "", puesto: employee.puesto || "", fechaIngreso: employee.fechaIngreso || "", estado: employee.estado, tipoPago: employee.tipoPago, tarifaHora: employee.tarifaHora || "", salarioFijo: employee.salarioFijo || "", periodoPago: employee.periodoPago, moneda: employee.moneda, notas: employee.notas || "", sucursalIds: employee.sucursalIds });
    setFormOpen(true);
  };
  const update = (key: keyof typeof form, value: string | number[]) => setForm((current) => ({ ...current, [key]: value }));
  const updateRule = (key: keyof NominaReglas, value: number | string[]) => setPayrollRules((current) => ({ ...current, [key]: value }));
  useEffect(() => { if (savedRules) { setPayrollRules(savedRules); setSelectedPolicy(savedRules.paisCodigo || ""); } }, [savedRules]);
  const applyPolicy = (codigo: string) => {
    const policy = policyData?.politicas.find((item) => item.codigo === codigo);
    if (!policy) return;
    setSelectedPolicy(codigo);
    setPayrollRules({ ...policy.reglas, paisId: policy.paisId, paisCodigo: codigo, origenConfiguracion: "plantilla_pais" });
  };
  const openAttendance = attendance.filter((row) => !row.salida);
  const tabs = [
    { value: "empleados" as const, Icon: Users, label: "Empleados" },
    { value: "asistencia" as const, Icon: Clock3, label: "Asistencia" },
    { value: "nomina" as const, Icon: WalletCards, label: "Nómina" },
  ];

  return (
    <NegocioLayout title="Empleados" activeNav="empleados">
      <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Personal, asistencia y nómina en un solo lugar.</p>
            {tab === "empleados" && <Button onClick={openCreate} data-testid="button-nuevo-empleado"><Plus className="w-4 h-4 mr-2" />Nuevo empleado</Button>}
          </div>
          <div className="grid grid-cols-3 gap-2" data-testid="tabs-empleados">
            {tabs.map(({ value, Icon, label }) => (
              <button key={value} onClick={() => setTab(value)} data-testid={`tab-empleados-${value}`} className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-3 text-sm font-medium ${tab === value ? "border-primary bg-primary/10 text-primary" : "bg-white text-gray-600"}`}><Icon className="w-4 h-4" />{label}</button>
            ))}
          </div>

          {tab === "empleados" && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {employees.length === 0 ? <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-gray-500">Todavía no hay empleados registrados.</CardContent></Card> : employees.map((employee) => (
              <Card key={employee.id} data-testid={`empleado-${employee.id}`}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{employee.nombres} {employee.apellidos}</CardTitle><Badge variant={employee.estado === "activo" ? "default" : "secondary"}>{employee.estado === "activo" ? "Activo" : "Inactivo"}</Badge></div><p className="text-sm text-gray-500">{employee.puesto || "Sin puesto"}</p></CardHeader>
                <CardContent className="space-y-2 text-sm"><p>{employee.email || employee.telefono || "Sin contacto"}</p><p className="font-medium">{employee.tipoPago === "por_hora" ? `${employee.moneda} ${employee.tarifaHora || "0"} / hora` : `${employee.moneda} ${employee.salarioFijo || "0"} / ${employee.periodoPago}`}</p><p className="text-xs text-gray-500">{employee.sucursalIds.map((id) => branches.find((branch) => branch.id === id)?.nombre).filter(Boolean).join(", ") || "Sin sucursal"}</p>{employee.codigoAcceso && <p className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">Código de acceso: <strong className="tracking-widest">{employee.codigoAcceso}</strong></p>}<Button variant="outline" size="sm" onClick={() => openEdit(employee)}><Pencil className="w-3 h-3 mr-1" />Editar</Button></CardContent>
              </Card>
            ))}
          </div>}

          {tab === "asistencia" && <div className="space-y-4">
            <Card><CardHeader><CardTitle className="text-base">Registrar entrada o salida</CardTitle></CardHeader><CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><Label>Empleado</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={attendanceEmployee} onChange={(e) => setAttendanceEmployee(e.target.value)}><option value="">Selecciona</option>{employees.filter((e) => e.estado === "activo").map((e) => <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>)}</select></div><div><Label>Sucursal</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={attendanceBranch} onChange={(e) => setAttendanceBranch(e.target.value)}><option value="">Selecciona</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></div><div className="flex items-end"><Button className="w-full" disabled={!attendanceEmployee || !attendanceBranch || attendanceMutation.isPending} onClick={() => attendanceMutation.mutate({ employeeId: Number(attendanceEmployee), branchId: Number(attendanceBranch), action: "entrada" })}><LogIn className="w-4 h-4 mr-2" />Marcar entrada</Button></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Jornadas abiertas</CardTitle></CardHeader><CardContent className="space-y-2">{openAttendance.length === 0 ? <p className="text-sm text-gray-500">No hay jornadas abiertas.</p> : openAttendance.map((row) => <div key={row.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-lg p-3"><div><p className="font-medium">{row.empleadoNombre}</p><p className="text-xs text-gray-500">{row.sucursalNombre} · Entrada {new Date(row.entrada).toLocaleString("es-DO")}</p></div><Button size="sm" variant="outline" onClick={() => attendanceMutation.mutate({ action: "salida", attendanceId: row.id })}><LogOut className="w-4 h-4 mr-1" />Marcar salida</Button></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Historial reciente</CardTitle></CardHeader><CardContent className="space-y-2">{attendance.slice(0, 30).map((row) => <div key={row.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b py-2 text-sm"><span>{row.empleadoNombre}<span className="block text-xs text-gray-500">{new Date(row.entrada).toLocaleDateString("es-DO")}</span></span><span className="flex items-center justify-between gap-2"><span>{row.salida ? `${row.horasTrabajadas} h` : <Badge variant="outline">Abierta</Badge>}</span><Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { const entrada = window.prompt("Entrada (fecha y hora ISO)", row.entrada); if (entrada) correctionMutation.mutate({ id: row.id, entrada, salida: row.salida }); }}>Corregir</Button></span></div>)}</CardContent></Card>
          </div>}

           {tab === "nomina" && <div className="space-y-4">
             <Card><CardHeader><CardTitle className="text-base">Reglas de nómina</CardTitle><p className="text-sm text-gray-500">Se guardan como una fotografía en cada nómina al calcularla.</p></CardHeader><CardContent className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                 <div><Label>País de referencia</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={selectedPolicy} onChange={(e) => applyPolicy(e.target.value)}><option value="">Selecciona un país</option>{policyData?.politicas.map((policy) => <option key={policy.codigo} value={policy.codigo}>{policy.nombre}</option>)}</select></div>
                 <div className="sm:col-span-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900"><div className="flex gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0" /><span>{policyData?.politicas.find((policy) => policy.codigo === selectedPolicy)?.descripcion || "Selecciona un país para recibir valores sugeridos y sus límites legales de referencia."}</span></div></div>
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([["horasOrdinariasDiarias", "Horas ordinarias/día"], ["multiplicadorHoraExtra", "Multiplicador extra"], ["multiplicadorFeriado", "Multiplicador feriado"], ["recargoNocturnoPorcentaje", "Recargo (%)"], ["retencionPorcentaje", "Retención (%)"], ["retencionFija", "Retención fija"], ["horasPeriodoSalario", "Horas período salario"]] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input type="number" min="0" step="0.01" value={payrollRules[key]} onChange={(e) => updateRule(key, Number(e.target.value))} /></div>)}
              <div className="col-span-2 sm:col-span-1"><Label>Feriados</Label><Input type="text" placeholder="2026-01-01, 2026-08-16" value={payrollRules.feriados.join(", ")} onChange={(e) => updateRule("feriados", e.target.value.split(",").map((date) => date.trim()).filter(Boolean))} /></div>
               </div>
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-gray-500">{payrollRules.origenConfiguracion === "plantilla_pais" ? "Valores sugeridos por plantilla de país." : "Configuración manual: los cambios quedan registrados como personalizados."}{payrollRules.fechaConfiguracion && ` Última actualización: ${new Date(payrollRules.fechaConfiguracion).toLocaleString("es-DO")}`}</p><Button onClick={() => savePayrollRules.mutate()} disabled={savePayrollRules.isPending}>{savePayrollRules.isPending ? "Guardando..." : "Guardar reglas"}</Button></div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Historial de cambios</CardTitle></CardHeader><CardContent className="space-y-2">{payrollAudit.length === 0 ? <p className="text-sm text-gray-500">Aún no hay cambios de configuración registrados.</p> : payrollAudit.slice(0, 5).map((entry) => <div key={entry.id} className="border-b pb-2 text-sm"><p className="font-medium">{entry.reglasNuevas.origenConfiguracion === "plantilla_pais" ? "Plantilla de país aplicada" : "Configuración manual guardada"}</p><p className="text-xs text-gray-500">{entry.reglasNuevas.paisCodigo || "País de referencia"} · {new Date(entry.fechaCreacion).toLocaleString("es-DO")}</p></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="w-5 h-5" />Calcular nómina</CardTitle></CardHeader><CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><Label>Desde</Label><Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} /></div><div><Label>Hasta</Label><Input type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} /></div><div className="flex items-end"><Button className="w-full" onClick={() => payrollMutation.mutate()} disabled={payrollMutation.isPending}><Calculator className="w-4 h-4 mr-2" />{payrollMutation.isPending ? "Calculando..." : "Calcular período"}</Button></div></CardContent></Card>
            {payrolls.map((payroll) => <Card key={payroll.id}><CardContent className="p-4 space-y-3"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-semibold">{payroll.periodoInicio} — {payroll.periodoFin}</p><p className="text-sm text-gray-500">{payroll.totalHoras} horas · Bruto {payroll.totalBruto} · Descuentos {payroll.totalDescuentos} · Neto {payroll.totalNeto}</p></div><div className="flex items-center gap-2"><Badge variant={payroll.estado === "pagada" ? "default" : "outline"}>{payroll.estado}</Badge>{payroll.estado === "borrador" && <Button size="sm" variant="outline" onClick={() => payrollStatusMutation.mutate({ id: payroll.id, estado: "cerrada" })}><CheckCircle2 className="w-4 h-4 mr-1" />Cerrar</Button>}{payroll.estado === "cerrada" && <Button size="sm" onClick={() => payrollStatusMutation.mutate({ id: payroll.id, estado: "pagada" })}>Marcar pagada</Button>}</div></div><div className="space-y-1 text-sm">{payroll.detalles.map((detail) => <div key={detail.empleadoId} className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2"><span>{employees.find((employee) => employee.id === detail.empleadoId)?.nombres || "Empleado"}: {detail.horasOrdinarias}h normales + {detail.horasExtra}h extra + {detail.horasFeriado}h feriado</span><span>Bruto {detail.bruto} · Descuentos {detail.descuentos} · Neto {detail.total}</span></div>)}</div></CardContent></Card>)}
          </div>}
        </div>
      </main>
      <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Editar empleado" : "Nuevo empleado"}</DialogTitle></DialogHeader><form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); saveEmployee.mutate(); }}>
        {([["nombres", "Nombres", "text"], ["apellidos", "Apellidos", "text"], ["cedula", "Cédula", "text"], ["email", "Correo", "email"], ["telefono", "Teléfono", "tel"], ["direccion", "Dirección", "text"], ["puesto", "Puesto", "text"], ["fechaIngreso", "Fecha de ingreso", "date"], ["tarifaHora", "Tarifa por hora", "number"], ["salarioFijo", "Salario fijo", "number"], ["notas", "Notas", "text"]] as const).map(([key, label, type]) => <div key={key} className={key === "direccion" || key === "notas" ? "sm:col-span-2" : ""}><Label>{label}{key === "nombres" ? " *" : ""}</Label><Input type={type} value={form[key] as string} onChange={(e) => update(key, e.target.value)} required={key === "nombres"} /></div>)}
        <div><Label>Tipo de pago</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={form.tipoPago} onChange={(e) => update("tipoPago", e.target.value)}><option value="por_hora">Por hora</option><option value="salario">Salario fijo</option></select></div><div><Label>Frecuencia</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={form.periodoPago} onChange={(e) => update("periodoPago", e.target.value)}><option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option></select></div>
        <div><Label>Estado</Label><select className="w-full h-10 rounded-md border px-3 text-sm" value={form.estado} onChange={(e) => update("estado", e.target.value)}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div><div><Label>Moneda</Label><Input value={form.moneda} onChange={(e) => update("moneda", e.target.value.toUpperCase())} maxLength={3} /></div>
        <div className="sm:col-span-2"><Label>Sucursales asignadas</Label><div className="flex flex-wrap gap-2 mt-2">{branches.map((branch) => <label key={branch.id} className="border rounded-md px-2 py-1.5 text-sm"><input type="checkbox" className="mr-2" checked={form.sucursalIds.includes(branch.id)} onChange={(e) => update("sucursalIds", e.target.checked ? [...form.sucursalIds, branch.id] : form.sucursalIds.filter((id) => id !== branch.id))} />{branch.nombre}</label>)}</div></div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={saveEmployee.isPending || form.sucursalIds.length === 0}>{saveEmployee.isPending ? "Guardando..." : "Guardar empleado"}</Button></div>
      </form></DialogContent></Dialog>
    </NegocioLayout>
  );
}