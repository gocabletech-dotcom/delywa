import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUpload } from "@/hooks/use-upload";
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
  MessageCircle, Truck, Package, DollarSign, TrendingUp, Menu, Settings, Store, User, LogOut, RefreshCw, Users, Copy,
  Sparkles, BookOpen, Camera, ImageIcon, Smartphone, ClipboardList
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { emojiParaProducto, emojiDeProducto } from "@/lib/emojiProductos";

interface MenuProducto {
  id: number;
  colmadoId: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria: string;
  imagen: string | null;
  emoji: string | null;
  disponible: boolean;
  inventario: number | null;
  orden: number | null;
  fechaCreacion: string;
}

interface Colmado {
  id: number;
  nombre: string;
  tipoNegocio: string;
  logo: string | null;
  simboloMoneda?: string;
  tecnologiasHabilitadas?: { api_evo?: boolean; meta?: boolean; link_pedido?: boolean };
}

interface Sucursal {
  id: number;
  nombre: string;
}

export default function MenuPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MenuProducto | null>(null);
  const [productForm, setProductForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    inventario: "",
    categoria: "General",
    disponible: true,
    imagen: "",
    emoji: "",
  });
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyTargetIds, setCopyTargetIds] = useState<number[]>([]);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const objectUrl = response.objectPath;
      setProductForm(prev => ({ ...prev, imagen: objectUrl }));
      setImagePreview(objectUrl);
      toast({ title: "Imagen subida", description: "La foto del producto se cargó correctamente" });
    },
    onError: (error) => {
      toast({ title: "Error al subir imagen", description: error.message, variant: "destructive" });
    },
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Solo se permiten archivos de imagen", variant: "destructive" });
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "La imagen no puede ser mayor a 5MB", variant: "destructive" });
      return;
    }
    
    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);
    
    await uploadFile(file);
  };

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

  const { data: sucursalesData } = useQuery<{ sucursales: Sucursal[] }>({
    queryKey: ["sucursales"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/sucursales");
      if (!res.ok) throw new Error("No se pudieron cargar las sucursales");
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const sucursales = sucursalesData?.sucursales || [];

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
  const sucursalesDestino = sucursales.filter((sucursal) => sucursal.id !== colmadoId);

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
      const res = await fetch(`/api/menu/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId: colmadoId }),
      });
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

  const copiarMenuMutation = useMutation({
    mutationFn: async (targetIds: number[]) => {
      const results = await Promise.all(targetIds.map(async (targetSucursalId) => {
        const res = await fetch(`/api/colmados/${colmadoId}/menu/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetSucursalId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Error al copiar el menú");
        return data;
      }));
      return results;
    },
    onSuccess: (results) => {
      results.forEach((result) => {
        queryClient.invalidateQueries({ queryKey: ["menu-productos", result.targetSucursalId] });
        queryClient.invalidateQueries({ queryKey: ["menu-categorias", result.targetSucursalId] });
      });
      setCopyMenuOpen(false);
      setCopyTargetIds([]);
      toast({ title: "Menú copiado", description: `Se copió a ${results.length} sucursal${results.length === 1 ? "" : "es"}.` });
    },
    onError: (error: Error) => toast({ title: "No se pudo copiar el menú", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setProductForm({
      nombre: "",
      descripcion: "",
      precio: "",
      inventario: "",
      categoria: "General",
      disponible: true,
      imagen: "",
      emoji: "",
    });
    setImagePreview(null);
  };

  const openEditDialog = (producto: MenuProducto) => {
    setEditingProduct(producto);
    setProductForm({
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: producto.precio,
      inventario: producto.inventario == null ? "" : String(producto.inventario),
      categoria: producto.categoria,
      disponible: producto.disponible,
      imagen: producto.imagen || "",
      emoji: producto.emoji || "",
    });
    setImagePreview(producto.imagen || null);
    setShowProductDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: { ...productForm, sucursalId: colmadoId } as any });
    } else {
      createProductMutation.mutate(productForm);
    }
  };

  const tieneMenu = colmado && (
    (colmado.tipoNegocio !== "colmado" && colmado.tipoNegocio !== "colmadon") ||
    colmado.tecnologiasHabilitadas?.link_pedido === true
  );

  const productosFiltrados = filterCategoria === "todas" 
    ? productos 
    : productos.filter(p => p.categoria === filterCategoria);

  const productosAgrupados = productosFiltrados.reduce((acc, producto) => {
    const cat = producto.categoria;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(producto);
    return acc;
  }, {} as Record<string, MenuProducto[]>);


  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading || loadingColmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
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
            <Button variant="outline" onClick={() => setLocation("/negocio/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <NegocioLayout
      title="Menú"
      activeNav="menu"
      headerRight={
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className="h-8 sm:h-10 px-2 sm:px-4 bg-white hover:bg-slate-50 text-slate-800 border-slate-300"
            variant="outline"
            onClick={() => {
              resetForm();
              setEditingProduct(null);
              setShowProductDialog(true);
            }}
            data-testid="button-add-product"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Agregar</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 sm:h-10 px-2 sm:px-4 bg-white hover:bg-slate-50 text-slate-800 border-slate-300"
            onClick={() => setCopyMenuOpen(true)}
            title={sucursalesDestino.length > 0 ? "Copiar menú a otra sucursal" : "Necesitas otra sucursal para copiar el menú"}
            data-testid="button-copy-menu"
          >
            <Copy className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Copiar menú</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            onClick={() => queryClient.invalidateQueries()}
            title="Refrescar"
            data-testid="button-refresh"
          >
            <RefreshCw size={18} className="sm:hidden" />
            <RefreshCw size={20} className="hidden sm:block" />
          </Button>
        </div>
      }
    >

      <main className="flex-1 lg:ml-0">

        <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto">
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
              <CardContent className="py-8 sm:py-12 px-4 sm:px-6 text-center">
                <UtensilsCrossed className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No hay productos en tu menú</h3>
                <p className="text-sm sm:text-base text-gray-500 mb-6">
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
                          className="py-3 sm:py-4 flex flex-row items-center gap-3 sm:gap-4"
                          data-testid={`menu-item-${producto.id}`}
                        >
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border">
                            {producto.imagen ? (
                              <img 
                                src={producto.imagen} 
                                alt={producto.nombre}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl select-none bg-white">
                                {emojiDeProducto(producto)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-gray-900 text-sm sm:text-base">{producto.nombre}</h4>
                              {!producto.disponible && (
                                <Badge variant="secondary" className="text-xs">No disponible</Badge>
                              )}
                            </div>
                            {producto.descripcion && (
                              <p className="text-xs sm:text-sm text-gray-500 line-clamp-1">{producto.descripcion}</p>
                            )}
                            <span className="font-semibold text-primary text-sm sm:text-base">
                              {moneda} {parseFloat(producto.precio).toFixed(2)}
                            </span>
                            <p className="text-xs text-gray-500">
                              {producto.inventario == null ? "Existencias sin límite" : `${producto.inventario} disponibles en esta sucursal`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                              onClick={() => openEditDialog(producto)}
                              data-testid={`button-edit-${producto.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0 sm:h-9 sm:w-9"
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
        <DialogContent className="max-w-[95vw] sm:max-w-md mx-auto">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="precio">Precio ({moneda}) *</Label>
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
            <div className="space-y-2">
              <Label htmlFor="inventario">Inventario (opcional)</Label>
              <Input
                id="inventario"
                type="number"
                min="0"
                step="1"
                value={productForm.inventario}
                onChange={(e) => setProductForm({ ...productForm, inventario: e.target.value })}
                placeholder="Sin límite"
                data-testid="input-product-inventario"
              />
              <p className="text-xs text-gray-500">Déjalo vacío para no controlar existencias. En una sucursal, este valor solo afecta esa ubicación.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emoji">Emoji (figurita)</Label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg border flex items-center justify-center text-2xl bg-gray-50 flex-shrink-0">
                  {productForm.emoji.trim() || (productForm.nombre.trim() ? emojiParaProducto(productForm.nombre) : "🛒")}
                </div>
                <Input
                  id="emoji"
                  value={productForm.emoji}
                  onChange={(e) => setProductForm({ ...productForm, emoji: e.target.value })}
                  placeholder={productForm.nombre.trim() ? `Automático: ${emojiParaProducto(productForm.nombre)}` : "Automático según el nombre"}
                  maxLength={8}
                  className="flex-1"
                  data-testid="input-product-emoji"
                />
                {productForm.emoji.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProductForm({ ...productForm, emoji: "" })}
                    data-testid="button-reset-emoji"
                  >
                    Auto
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Si lo dejas vacío, la app pone un emoji solo según el nombre.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Foto del Producto (opcional)</Label>
              <div className="flex items-start gap-4">
                <div 
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-image"
                >
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  ) : imagePreview ? (
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <Camera className="w-6 h-6 mx-auto text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">Subir</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-500">
                    Toca para subir una foto del producto. Se mostrará en el menú gráfico.
                  </p>
                  {imagePreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setImagePreview(null);
                        setProductForm(prev => ({ ...prev, imagen: "" }));
                      }}
                      data-testid="button-remove-image"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Quitar foto
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                data-testid="input-product-image"
              />
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
      <Dialog open={copyMenuOpen} onOpenChange={setCopyMenuOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              Copiar menú a otra sucursal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {sucursalesDestino.length === 0 ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                Primero agrega otra sucursal en <strong>Sucursales</strong>. Cuando esté disponible,
                podrás copiarle este menú sin modificar la sucursal origen.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Se copiarán los <strong>{productos.length} productos</strong>, sus categorías, precios,
                  imágenes, disponibilidad e inventario desde <strong>{colmado?.nombre}</strong>.
                </p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  El menú propio de cada sucursal seleccionada será reemplazado. Esta acción no modifica la sucursal origen.
                </div>
                <div className="space-y-2">
                  <Label>Sucursales destino</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sucursalesDestino.map((sucursal) => (
                      <label key={sucursal.id} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={copyTargetIds.includes(sucursal.id)}
                          onChange={(event) => setCopyTargetIds((current) =>
                            event.target.checked
                              ? [...current, sucursal.id]
                              : current.filter((id) => id !== sucursal.id)
                          )}
                        />
                        {sucursal.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCopyMenuOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={sucursalesDestino.length === 0 || copyTargetIds.length === 0 || copiarMenuMutation.isPending}
                onClick={() => copiarMenuMutation.mutate(copyTargetIds)}
                data-testid="button-confirm-copy-menu"
              >
                {copiarMenuMutation.isPending ? "Copiando..." : "Confirmar copia"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </NegocioLayout>
  );
}
