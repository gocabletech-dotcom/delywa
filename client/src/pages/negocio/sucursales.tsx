import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, MapPin, Phone, Plus, Save, CheckCircle2, XCircle, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import NegocioLayout from "@/components/negocio/NegocioLayout";

type Sucursal = {
  id: number;
  nombre: string;
  slug: string | null;
  whatsappNumero: string;
  direccion: string;
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  estado: string;
  negocioPrincipalId: number | null;
  paisCodigo?: string | null;
};

type Usuario = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  role: string;
  colmadoId: number | null;
  sucursalIds: number[];
};

const emptyForm = { nombre: "", whatsappNumero: "", direccion: "", ciudad: "", provincia: "", codigoPostal: "" };

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

export default function SucursalesPage() {
  const [location] = useLocation();
  const soloUsuarios = location === "/negocio/usuarios";
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ firstName: "", lastName: "", email: "", password: "", role: "admin_pedidos", sucursalIds: [] as number[] });
  const [editingUser, setEditingUser] = useState<(Usuario & { password: string }) | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) window.location.href = "/login";
  }, [authLoading, isAuthenticated]);

  const { data, isLoading } = useQuery<{ sucursales: Sucursal[]; sucursalActivaId: number }>({
    queryKey: ["sucursales"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/sucursales");
      if (!res.ok) throw new Error("No se pudieron cargar las sucursales");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/colmados/${editingId}` : "/api/negocio/sucursales";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo guardar la sucursal");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sucursales"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
      setForm(emptyForm);
      setEditingId(null);
      toast({ title: editingId ? "Sucursal actualizada" : "Sucursal creada" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/colmados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error("No se pudo cambiar el estado");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sucursales"] }),
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const selectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/negocio/sucursales/${id}/seleccionar`, { method: "POST" });
      if (!res.ok) throw new Error("No se pudo seleccionar la sucursal");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucursal seleccionada", description: "El panel ahora mostrará la operación de esta sucursal." });
      window.location.href = "/negocio/dashboard";
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const { data: permisosData } = useQuery<{
    usuarios: Usuario[];
    sucursales: Sucursal[];
  }>({
    queryKey: ["usuarios-sucursales"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/usuarios-sucursales");
      if (!res.ok) throw new Error("No se pudieron cargar los permisos");
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const permisosMutation = useMutation({
    mutationFn: async ({ userId, sucursalIds }: { userId: string; sucursalIds: number[] }) => {
      const res = await fetch(`/api/negocio/usuarios-sucursales/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudieron guardar los permisos");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios-sucursales"] });
      toast({ title: "Permisos actualizados" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: Usuario & { password: string }) => {
      const res = await fetch(`/api/negocio/usuarios/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo modificar el usuario");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios-sucursales"] });
      setEditingUser(null);
      toast({ title: "Usuario actualizado" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: typeof userForm) => {
      const res = await fetch("/api/negocio/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          sucursalIds: payload.sucursalIds.length
            ? payload.sucursalIds
            : [data?.sucursalActivaId || sucursales[0]?.id].filter(Boolean),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo crear el usuario");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios-sucursales"] });
      setUserForm({ firstName: "", lastName: "", email: "", password: "", role: "admin_pedidos", sucursalIds: [] });
      toast({ title: "Usuario creado", description: "Ya puede iniciar sesión con el correo y contraseña asignados." });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const sucursales = data?.sucursales || [];
  const sucursalActiva = sucursales.find((sucursal) => sucursal.id === data?.sucursalActivaId) || sucursales[0];
  const esEstadosUnidos = sucursalActiva?.paisCodigo === "US";
  useEffect(() => {
    if (sucursales.length > 0 && userForm.sucursalIds.length === 0) {
      const sucursalInicial = data?.sucursalActivaId || sucursales[0].id;
      setUserForm((prev) => ({ ...prev, sucursalIds: [sucursalInicial] }));
    }
  }, [data?.sucursalActivaId, sucursales.length]);

  const startEdit = (sucursal: Sucursal) => {
    setEditingId(sucursal.id);
    setForm({
      nombre: sucursal.nombre,
      whatsappNumero: sucursal.whatsappNumero,
      direccion: sucursal.direccion,
      ciudad: sucursal.ciudad || "",
      provincia: sucursal.provincia || "",
      codigoPostal: sucursal.codigoPostal || "",
    });
  };

  if (authLoading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const submitUserForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    createUserMutation.mutate({
      firstName: String(values.get("firstName") || "").trim(),
      lastName: String(values.get("lastName") || "").trim(),
      email: String(values.get("email") || "").trim(),
      password: String(values.get("password") || ""),
      role: String(values.get("role") || "admin_pedidos"),
      sucursalIds: userForm.sucursalIds,
    });
  };

  return (
    <NegocioLayout title={soloUsuarios ? "Usuarios y permisos" : "Sucursales"} activeNav={soloUsuarios ? "usuarios" : "sucursales"}>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {!soloUsuarios && <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><Building2 size={22} /> Mis sucursales</h2>
            <p className="text-sm text-gray-500 mt-1">Cada sucursal tiene su propia tienda, dirección, pedidos y conversaciones.</p>
          </div>}

          {!soloUsuarios && <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">{editingId ? "Editar sucursal" : "Agregar sucursal"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["nombre", "Nombre de la sucursal", "Ej. Sucursal Centro"],
                  ["whatsappNumero", "WhatsApp de la sucursal", "+1 809 000 0000"],
                ].map(([key, label, placeholder]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      value={form[key as keyof typeof form]}
                      placeholder={placeholder}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                {esEstadosUnidos ? (
                  <>
                    <div>
                      <Label htmlFor="direccion-sucursal">Street Address</Label>
                      <Input
                        id="direccion-sucursal"
                        value={form.direccion}
                        placeholder="123 Main Street, Apt 4B"
                        onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
                        data-testid="input-sucursal-direccion-us"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ciudad-sucursal">City</Label>
                      <Input
                        id="ciudad-sucursal"
                        value={form.ciudad}
                        placeholder="New York"
                        onChange={(e) => setForm((prev) => ({ ...prev, ciudad: e.target.value }))}
                        data-testid="input-sucursal-ciudad-us"
                      />
                    </div>
                    <div>
                      <Label htmlFor="provincia-sucursal">State</Label>
                      <select
                        id="provincia-sucursal"
                        value={form.provincia}
                        onChange={(e) => setForm((prev) => ({ ...prev, provincia: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        data-testid="select-sucursal-estado-us"
                      >
                        <option value="">Select a state...</option>
                        {US_STATES.map(([code, name]) => (
                          <option key={code} value={code}>{name} ({code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="codigo-postal-sucursal">ZIP Code</Label>
                      <Input
                        id="codigo-postal-sucursal"
                        value={form.codigoPostal}
                        placeholder="10001 or 10001-1234"
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => setForm((prev) => ({ ...prev, codigoPostal: e.target.value }))}
                        data-testid="input-sucursal-zip-us"
                      />
                    </div>
                  </>
                ) : (
                  [
                    ["direccion", "Dirección", "Calle y número"],
                    ["ciudad", "Ciudad", "Ciudad"],
                    ["provincia", "Estado / Provincia", "Provincia o State"],
                    ["codigoPostal", "Código postal", "Opcional"],
                  ].map(([key, label, placeholder]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <Input
                        value={form[key as keyof typeof form]}
                        placeholder={placeholder}
                        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-2">
                  {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancelar</Button>}
                  <Button className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    {editingId ? <Save size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
                    {saveMutation.isPending ? "Guardando..." : editingId ? "Guardar cambios" : "Crear sucursal"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {sucursales.map((sucursal) => {
                const activa = data?.sucursalActivaId === sucursal.id;
                const habilitada = sucursal.estado === "activo";
                return (
                  <Card key={sucursal.id} className={activa ? "border-primary ring-1 ring-primary/20" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{sucursal.nombre}</h3>
                            {activa && <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5">Activa en panel</span>}
                          </div>
                          <p className="text-sm text-gray-600 flex items-center gap-1 mt-2"><MapPin size={14} /> {sucursal.direccion}, {sucursal.ciudad || "—"}</p>
                          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Phone size={14} /> {sucursal.whatsappNumero}</p>
                          <p className="text-xs text-gray-400 mt-2">Link: /sucursal/{sucursal.slug || sucursal.id}</p>
                        </div>
                        {habilitada ? <CheckCircle2 className="text-green-600 shrink-0" size={19} /> : <XCircle className="text-gray-400 shrink-0" size={19} />}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {!activa && habilitada && <Button size="sm" onClick={() => selectMutation.mutate(sucursal.id)}>Usar esta sucursal</Button>}
                        <Button size="sm" variant="outline" onClick={() => startEdit(sucursal)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: sucursal.id, estado: habilitada ? "inactivo" : "activo" })}>
                          {habilitada ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>}

          {soloUsuarios && permisosData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Users size={18} /> Usuarios del negocio</CardTitle>
                <p className="text-sm text-gray-500">El administrador general puede revisar y modificar todos los usuarios de su negocio.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {permisosData.usuarios.length === 0 && <p className="text-sm text-gray-500">Todavía no hay usuarios adicionales.</p>}
                {permisosData.usuarios.map((usuario) => {
                  const selected = usuario.sucursalIds.length ? usuario.sucursalIds : (usuario.colmadoId ? [usuario.colmadoId] : []);
                  const editing = editingUser?.id === usuario.id;
                  return (
                    <div key={usuario.id} className="rounded-lg border p-3">
                      {!editing ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">
                                {[usuario.firstName, usuario.lastName].filter(Boolean).join(" ") || "Usuario"}
                                <span className="text-xs text-gray-500 ml-1">({usuario.role === "colmado_owner" ? "Administrador general" : usuario.role === "delivery" ? "Repartidor" : usuario.role === "admin_pedidos" ? "Administrador de pedidos" : "Operador de sucursal"})</span>
                              </div>
                              <p className="text-sm text-gray-500">{usuario.email || "Sin correo"}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setEditingUser({ ...usuario, password: "" })}>Editar</Button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {sucursales.filter((sucursal) => selected.includes(sucursal.id)).map((sucursal) => (
                              <span key={sucursal.id} className="text-xs rounded-md px-2 py-1 bg-primary/10 text-primary">{sucursal.nombre}</span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div><Label>Nombre *</Label><Input value={editingUser.firstName || ""} onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })} /></div>
                            <div><Label>Apellido</Label><Input value={editingUser.lastName || ""} onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })} /></div>
                            <div><Label>Correo *</Label><Input type="email" value={editingUser.email || ""} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} /></div>
                            <div><Label>Nueva contraseña (opcional)</Label><Input type="password" minLength={6} placeholder="Dejar vacía para conservarla" value={editingUser.password} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} /></div>
                            <div><Label>Rol</Label><select disabled={editingUser.role === "colmado_owner"} className="w-full h-10 rounded-md border px-3 text-sm disabled:bg-gray-100" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}><option value="colmado_owner">Administrador general</option><option value="admin_pedidos">Administrador de pedidos</option><option value="operador_sucursal">Operador de sucursal</option><option value="delivery">Repartidor</option></select></div>
                          </div>
                          <div>
                            <Label>Sucursales asignadas</Label>
                            <div className="flex flex-wrap gap-2 mt-2">{sucursales.map((sucursal) => {
                              const checked = editingUser.sucursalIds.includes(sucursal.id);
                              return <label key={sucursal.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer"><input type="checkbox" checked={checked} onChange={(event) => setEditingUser({ ...editingUser, sucursalIds: event.target.checked ? [...editingUser.sucursalIds, sucursal.id] : editingUser.sucursalIds.filter((id) => id !== sucursal.id) })} />{sucursal.nombre}</label>;
                            })}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" disabled={updateUserMutation.isPending || !editingUser.firstName?.trim() || !editingUser.email?.trim() || editingUser.sucursalIds.length === 0} onClick={() => updateUserMutation.mutate(editingUser)}>Guardar cambios</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          {soloUsuarios && <Card id="usuarios">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><UserPlus size={18} /> Usuarios y permisos</CardTitle>
              <p className="text-sm text-gray-500">Crea administradores de pedidos u operadores y asigna las sucursales que pueden manejar.</p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitUserForm}>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Nombre *</Label><Input name="firstName" required value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} /></div>
                <div><Label>Apellido</Label><Input name="lastName" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} /></div>
                <div><Label>Correo de acceso *</Label><Input name="email" required type="email" autoComplete="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></div>
                <div><Label>Contraseña temporal * (mínimo 6 caracteres)</Label><Input name="password" required type="password" minLength={6} autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></div>
                <div><Label>Tipo de rol</Label>
                  <select name="role" className="w-full h-10 rounded-md border px-3 text-sm" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="admin_pedidos">Administrador de pedidos</option>
                    <option value="operador_sucursal">Operador de sucursal</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Sucursales asignadas</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {sucursales.map((sucursal) => {
                    const checked = userForm.sucursalIds.includes(sucursal.id);
                    return <label key={sucursal.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => setUserForm({
                        ...userForm,
                        sucursalIds: checked ? userForm.sucursalIds.filter((id) => id !== sucursal.id) : [...userForm.sucursalIds, sucursal.id],
                      })} />
                      {sucursal.nombre}
                    </label>;
                  })}
                </div>
              </div>
              <Button type="submit" disabled={createUserMutation.isPending}>
                <UserPlus size={16} className="mr-2" /> {createUserMutation.isPending ? "Creando..." : "Crear usuario"}
              </Button>
              </form>
            </CardContent>
          </Card>}
        </div>
      </main>
    </NegocioLayout>
  );
}