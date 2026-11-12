import { useState, useEffect } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, BookText, Edit, Trash2, X, ArrowLeft,
  MessageCircle, Truck, Package, DollarSign, TrendingUp, Menu, Settings, Store, User, LogOut, RefreshCw, Users,
  Sparkles, BookOpen, UtensilsCrossed
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiccionarioJerga {
  id: number;
  colmadoId: number;
  jerga: string;
  productoIdentificado: string;
  precioSugerido: string | null;
  vecesUsado: number;
  fechaCreacion: string;
  ultimoUso: string;
}

interface Colmado {
  id: number;
  nombre: string;
  tipoNegocio: string;
  simboloMoneda?: string;
}

export default function JergaPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingJerga, setEditingJerga] = useState<DiccionarioJerga | null>(null);
  const [jergaForm, setJergaForm] = useState({
    jerga: "",
    productoIdentificado: "",
    precioSugerido: "",
  });

  const { data: roleData } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const colmadoId = roleData?.colmadoId;

  const { data: colmado, isLoading: loadingColmado } = useQuery<Colmado>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const moneda = colmado?.simboloMoneda || "RD$";

  const { data: diccionario = [], isLoading: loadingDiccionario } = useQuery<DiccionarioJerga[]>({
    queryKey: ["diccionario-jerga", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/diccionario-jerga`);
      if (!res.ok) throw new Error("Error al cargar diccionario");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/unread-count`);
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 30000,
  });

  const updateJergaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof jergaForm }) => {
      const res = await fetch(`/api/diccionario-jerga/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jerga: data.jerga,
          productoIdentificado: data.productoIdentificado,
          precioSugerido: data.precioSugerido ? data.precioSugerido : null,
        }),
      });
      if (!res.ok) throw new Error("Error al actualizar jerga");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diccionario-jerga", colmadoId] });
      setShowEditDialog(false);
      setEditingJerga(null);
      resetForm();
      toast({ title: "Jerga actualizada" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteJergaMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/diccionario-jerga/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar jerga");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diccionario-jerga", colmadoId] });
      toast({ title: "Jerga eliminada" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copiarPlantillaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/copiar-jerga-plantilla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al copiar plantilla");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["diccionario-jerga", colmadoId] });
      toast({ 
        title: "Plantilla cargada", 
        description: data.message || "Se agregaron expresiones al diccionario" 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setJergaForm({
      jerga: "",
      productoIdentificado: "",
      precioSugerido: "",
    });
  };

  const openEditDialog = (jerga: DiccionarioJerga) => {
    setEditingJerga(jerga);
    setJergaForm({
      jerga: jerga.jerga,
      productoIdentificado: jerga.productoIdentificado,
      precioSugerido: jerga.precioSugerido || "",
    });
    setShowEditDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingJerga) {
      updateJergaMutation.mutate({ id: editingJerga.id, data: jergaForm });
    }
  };

  const diccionarioOrdenado = [...diccionario].sort((a, b) => b.vecesUsado - a.vecesUsado);

  const navItems = [
    { icon: TrendingUp, label: "Dashboard", href: "/negocio/dashboard" },
    { icon: MessageCircle, label: "Conversaciones", href: "/negocio/conversaciones", badge: unreadData?.count },
    { icon: Users, label: "Clientes", href: "/negocio/clientes" },
    { icon: Package, label: "Pedidos", href: "/negocio/pedidos" },
    { icon: Truck, label: "Deliveries", href: "/negocio/deliveries" },
    { icon: DollarSign, label: "Ventas", href: "/negocio/ventas" },
    { icon: UtensilsCrossed, label: "Menú", href: "/negocio/menu" },
    { icon: BookText, label: "Jerga", href: "/negocio/jerga", active: true },
    { icon: Settings, label: "Configuración", href: "/negocio/settings" },
    { icon: BookOpen, label: "Manual de Usuario", href: "/negocio/manual" },
  ];

  if (authLoading || loadingColmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">DelyWa</span>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${
                  item.active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-green-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.firstName || "Usuario"}</p>
              <p className="text-xs text-gray-500 truncate">{colmado?.nombre || "Negocio"}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-0">
        <header className="bg-white border-b px-3 sm:px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                <BookText className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                <span className="hidden xs:inline">Diccionario de </span>Jerga
              </h1>
              <p className="text-xs sm:text-sm text-gray-500">{currentDateTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => window.location.reload()}
              title="Refrescar"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <Button 
              size="sm"
              className="h-8 sm:h-10 px-2 sm:px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              onClick={() => copiarPlantillaMutation.mutate()}
              disabled={copiarPlantillaMutation.isPending || !colmadoId}
              data-testid="button-cargar-plantilla"
            >
              {copiarPlantillaMutation.isPending ? (
                <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Cargar Plantilla Base</span>
            </Button>
          </div>
        </header>

        <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Expresiones Aprendidas</CardTitle>
              <CardDescription>
                El sistema aprende automáticamente expresiones coloquiales de las conversaciones con tus clientes.
                Aquí puedes revisar y editar las expresiones identificadas.
              </CardDescription>
            </CardHeader>
          </Card>

          {loadingDiccionario ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : diccionario.length === 0 ? (
            <Card>
              <CardContent className="py-8 sm:py-12 px-4 sm:px-6 text-center">
                <BookText className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No hay jerga aprendida todavía</h3>
                <p className="text-sm sm:text-base text-gray-500 mb-6">
                  El sistema aprenderá expresiones automáticamente de las conversaciones con tus clientes.
                  Tu bot ya usa el diccionario de jerga de tu país, que se alimenta con lo que aprenden todos los colmados. Aquí verás las expresiones propias de tu colmado y su precio.
                </p>
                <Button 
                  onClick={() => colmadoId && copiarPlantillaMutation.mutate()}
                  disabled={copiarPlantillaMutation.isPending || !colmadoId}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                  data-testid="button-cargar-plantilla-empty"
                >
                  {copiarPlantillaMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Cargar Plantilla Base
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Jerga</TableHead>
                        <TableHead className="min-w-[150px]">Producto Identificado</TableHead>
                        <TableHead className="min-w-[100px]">Precio Sugerido</TableHead>
                        <TableHead className="min-w-[80px] text-center">Veces Usado</TableHead>
                        <TableHead className="w-[100px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diccionarioOrdenado.map((item) => (
                        <TableRow key={item.id} data-testid={`jerga-row-${item.id}`}>
                          <TableCell className="font-medium">{item.jerga}</TableCell>
                          <TableCell>{item.productoIdentificado}</TableCell>
                          <TableCell>
                            {item.precioSugerido ? `${moneda} ${parseFloat(item.precioSugerido).toFixed(2)}` : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                              {item.vecesUsado}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEditDialog(item)}
                                data-testid={`button-edit-jerga-${item.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  if (confirm("¿Estás seguro de eliminar esta jerga?")) {
                                    deleteJergaMutation.mutate(item.id);
                                  }
                                }}
                                data-testid={`button-delete-jerga-${item.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookText className="w-5 h-5 text-primary" />
              Editar Jerga
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="jerga">Expresión / Jerga *</Label>
              <Input
                id="jerga"
                value={jergaForm.jerga}
                onChange={(e) => setJergaForm({ ...jergaForm, jerga: e.target.value })}
                placeholder="Ej: dame un fría"
                required
                data-testid="input-jerga"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productoIdentificado">Producto Identificado *</Label>
              <Input
                id="productoIdentificado"
                value={jergaForm.productoIdentificado}
                onChange={(e) => setJergaForm({ ...jergaForm, productoIdentificado: e.target.value })}
                placeholder="Ej: Cerveza Presidente"
                required
                data-testid="input-producto-identificado"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precioSugerido">Precio Sugerido ({moneda})</Label>
              <Input
                id="precioSugerido"
                type="number"
                step="0.01"
                min="0"
                value={jergaForm.precioSugerido}
                onChange={(e) => setJergaForm({ ...jergaForm, precioSugerido: e.target.value })}
                placeholder="0.00"
                data-testid="input-precio-sugerido"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingJerga(null);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateJergaMutation.isPending}
                data-testid="button-guardar-jerga"
              >
                {updateJergaMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
