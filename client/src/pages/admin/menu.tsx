import { useState, useEffect } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, UtensilsCrossed, Plus, Edit, Trash2, Save, X, ArrowLeft,
  MessageCircle, Truck, Package, DollarSign, TrendingUp, Menu, Settings, Store, User, LogOut, RefreshCw, Users,
  Sparkles, BookOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MenuProducto {
  id: number;
  colmadoId: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria: string;
  imagen: string | null;
  disponible: boolean;
  orden: number | null;
  fechaCreacion: string;
}

interface Colmado {
  id: number;
  nombre: string;
  tipoNegocio: string;
}

export default function MenuPage() {
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
  
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MenuProducto | null>(null);
  const [productForm, setProductForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    categoria: "General",
    disponible: true,
  });
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");

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

  const { data: productos = [], isLoading: loadingProductos } = useQuery<MenuProducto[]>({
    queryKey: ["menu-productos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/menu`);
      if (!res.ok) throw new Error("Error al cargar menú");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: categorias = [] } = useQuery<string[]>({
    queryKey: ["menu-categorias", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/menu/categorias`);
      if (!res.ok) throw new Error("Error al cargar categorías");
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

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof productForm) => {
      const res = await fetch(`/api/colmados/${colmadoId}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear producto");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-productos", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["menu-categorias", colmadoId] });
      setShowProductDialog(false);
      resetForm();
      toast({ title: "Producto creado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof productForm }) => {
      const res = await fetch(`/api/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar producto");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-productos", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["menu-categorias", colmadoId] });
      setShowProductDialog(false);
      setEditingProduct(null);
      resetForm();
      toast({ title: "Producto actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/menu/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar producto");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-productos", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["menu-categorias", colmadoId] });
      toast({ title: "Producto eliminado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const aplicarPlantillaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/aplicar-plantilla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al aplicar plantilla");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["menu-productos", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["menu-categorias", colmadoId] });
      toast({ 
        title: "Plantilla aplicada", 
        description: data.message || `Se agregaron productos al menú` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setProductForm({
      nombre: "",
      descripcion: "",
      precio: "",
      categoria: "General",
      disponible: true,
    });
  };

  const openEditDialog = (producto: MenuProducto) => {
    setEditingProduct(producto);
    setProductForm({
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: producto.precio,
      categoria: producto.categoria,
      disponible: producto.disponible,
    });
    setShowProductDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productForm });
    } else {
      createProductMutation.mutate(productForm);
    }
  };

  const tieneMenu = colmado && colmado.tipoNegocio !== "colmado" && colmado.tipoNegocio !== "colmadon";

  const productosFiltrados = filterCategoria === "todas" 
    ? productos 
    : productos.filter(p => p.categoria === filterCategoria);

  const productosAgrupados = productosFiltrados.reduce((acc, producto) => {
    const cat = producto.categoria;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(producto);
    return acc;
  }, {} as Record<string, MenuProducto[]>);

  const navItems = [
    { icon: TrendingUp, label: "Dashboard", href: "/admin/dashboard" },
    { icon: MessageCircle, label: "Conversaciones", href: "/admin/conversaciones", badge: unreadData?.count },
    { icon: Users, label: "Clientes", href: "/admin/clientes" },
    { icon: Package, label: "Pedidos", href: "/admin/pedidos" },
    { icon: Truck, label: "Deliveries", href: "/admin/deliveries" },
    { icon: DollarSign, label: "Ventas", href: "/admin/ventas" },
    { icon: UtensilsCrossed, label: "Menú", href: "/admin/menu", active: true },
    { icon: Settings, label: "Configuración", href: "/admin/settings" },
    { icon: BookOpen, label: "Manual de Usuario", href: "/admin/manual" },
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

  if (!tieneMenu && colmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md mx-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5" />
              Menú no disponible
            </CardTitle>
            <CardDescription>
              Tu tipo de negocio ({colmado.tipoNegocio}) no tiene la opción de menú habilitada.
              Solo los negocios tipo cafetería, restaurant, fast food, farmacia y pizzería pueden gestionar un menú.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLocation("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <UtensilsCrossed className="w-6 h-6 text-primary" />
                Gestión de Menú
              </h1>
              <p className="text-sm text-gray-500">{currentDateTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.reload()}
              title="Refrescar"
            >
              <RefreshCw size={20} />
            </Button>
            <Button 
              onClick={() => {
                resetForm();
                setEditingProduct(null);
                setShowProductDialog(true);
              }}
              data-testid="button-add-product"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar
            </Button>
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {categorias.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge 
                variant={filterCategoria === "todas" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterCategoria("todas")}
              >
                Todas
              </Badge>
              {categorias.map((cat) => (
                <Badge 
                  key={cat}
                  variant={filterCategoria === cat ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setFilterCategoria(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          )}

          {loadingProductos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : productos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UtensilsCrossed className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay productos en tu menú</h3>
                <p className="text-gray-500 mb-6">
                  Puedes usar nuestra plantilla sugerida para {colmado?.tipoNegocio === "cafeteria" ? "cafetería" : 
                    colmado?.tipoNegocio === "restaurant" ? "restaurante" : 
                    colmado?.tipoNegocio === "fast_food" ? "comida rápida" : 
                    colmado?.tipoNegocio === "farmacia" ? "farmacia" : 
                    colmado?.tipoNegocio === "pizzeria" ? "pizzería" : 
                    colmado?.tipoNegocio || "tu negocio"} o agregar productos manualmente.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    onClick={() => colmadoId && aplicarPlantillaMutation.mutate()}
                    disabled={aplicarPlantillaMutation.isPending || !colmadoId}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                    data-testid="button-apply-template"
                  >
                    {aplicarPlantillaMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Usar Plantilla Sugerida
                  </Button>
                  <Button variant="outline" onClick={() => setShowProductDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Manualmente
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(productosAgrupados).map(([categoria, prods]) => (
                <Card key={categoria}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{categoria}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y">
                      {prods.map((producto) => (
                        <div 
                          key={producto.id} 
                          className="py-4 flex items-center justify-between gap-4"
                          data-testid={`menu-item-${producto.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900 truncate">{producto.nombre}</h4>
                              {!producto.disponible && (
                                <Badge variant="secondary" className="text-xs">No disponible</Badge>
                              )}
                            </div>
                            {producto.descripcion && (
                              <p className="text-sm text-gray-500 truncate">{producto.descripcion}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-semibold text-primary whitespace-nowrap">
                              RD$ {parseFloat(producto.precio).toFixed(2)}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => openEditDialog(producto)}
                                data-testid={`button-edit-${producto.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  if (confirm("¿Estás seguro de eliminar este producto?")) {
                                    deleteProductMutation.mutate(producto.id);
                                  }
                                }}
                                data-testid={`button-delete-${producto.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              {editingProduct ? "Editar Producto" : "Agregar Producto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre del Producto *</Label>
              <Input
                id="nombre"
                value={productForm.nombre}
                onChange={(e) => setProductForm({ ...productForm, nombre: e.target.value })}
                placeholder="Ej: Hamburguesa Clásica"
                required
                data-testid="input-product-nombre"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción (opcional)</Label>
              <Textarea
                id="descripcion"
                value={productForm.descripcion}
                onChange={(e) => setProductForm({ ...productForm, descripcion: e.target.value })}
                placeholder="Describe el producto..."
                rows={2}
                data-testid="input-product-descripcion"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precio">Precio (RD$) *</Label>
                <Input
                  id="precio"
                  type="number"
                  step="0.01"
                  min="0"
                  value={productForm.precio}
                  onChange={(e) => setProductForm({ ...productForm, precio: e.target.value })}
                  placeholder="0.00"
                  required
                  data-testid="input-product-precio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Input
                  id="categoria"
                  value={productForm.categoria}
                  onChange={(e) => setProductForm({ ...productForm, categoria: e.target.value })}
                  placeholder="General"
                  list="categorias-list"
                  data-testid="input-product-categoria"
                />
                <datalist id="categorias-list">
                  {categorias.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base">Disponible</Label>
                <p className="text-sm text-gray-500">El producto está disponible para pedidos</p>
              </div>
              <Switch
                checked={productForm.disponible}
                onCheckedChange={(checked) => setProductForm({ ...productForm, disponible: checked })}
                data-testid="switch-product-disponible"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowProductDialog(false);
                  setEditingProduct(null);
                  resetForm();
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createProductMutation.isPending || updateProductMutation.isPending}
              >
                {(createProductMutation.isPending || updateProductMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {editingProduct ? "Guardar Cambios" : "Crear Producto"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
