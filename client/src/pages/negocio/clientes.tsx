import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Users,
  X,
  LogOut,
  Search,
  Phone,
  MapPin,
  Edit2,
  ChevronRight,
  Calendar,
  CreditCard,
  Banknote,
  Wallet,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type Cliente = {
  id: number;
  colmadoId: number;
  clienteWhatsapp: string;
  clienteNombre: string | null;
  direccionTexto: string | null;
  cantidadPedidos: number;
  totalGastado: number;
  ultimoPedido: string | null;
};

type Pedido = {
  id: number;
  productos: string;
  total: string;
  estado: string;
  metodoPago: string | null;
  fechaCreacion: string;
};

const formatProductos = (productosStr: string): string => {
  try {
    const productos = JSON.parse(productosStr);
    if (Array.isArray(productos)) {
      return productos.map((p: any) => `${p.cantidad}x ${p.nombre}`).join(", ");
    }
    return productosStr;
  } catch {
    return productosStr;
  }
};

export default function ClientesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editDireccion, setEditDireccion] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["clientes", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/clientes`);
      if (!res.ok) throw new Error("Error al cargar clientes");
      return res.json() as Promise<Cliente[]>;
    },
    enabled: !!colmadoId,
  });


  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    estado: string;
    tipoNegocio: string;
    simboloMoneda?: string;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: clientePedidos } = useQuery({
    queryKey: ["cliente-pedidos", colmadoId, selectedCliente?.clienteWhatsapp],
    queryFn: async () => {
      if (!selectedCliente) return [];
      const res = await fetch(`/api/colmados/${colmadoId}/clientes/${encodeURIComponent(selectedCliente.clienteWhatsapp)}/pedidos`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json() as Promise<Pedido[]>;
    },
    enabled: !!selectedCliente,
  });

  const moneda = colmadoData?.simboloMoneda || "RD$";

  const updateClienteMutation = useMutation({
    mutationFn: async ({ id, clienteNombre, direccionTexto }: { id: number; clienteNombre: string; direccionTexto: string }) => {
      const res = await fetch(`/api/clientes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: clienteNombre, direccionTexto }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast({ title: "Cliente actualizado" });
      setEditDialogOpen(false);
    },
  });

  const updateMetodoPagoMutation = useMutation({
    mutationFn: async ({ pedidoId, metodoPago }: { pedidoId: number; metodoPago: string }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/metodo-pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodoPago }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliente-pedidos"] });
      toast({ title: "Método de pago actualizado" });
    },
  });

  const filteredClientes = (clientes || []).filter(
    (c) =>
      (c.clienteNombre?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      c.clienteWhatsapp.includes(searchTerm)
  );

  const handleEditClick = (cliente: Cliente) => {
    setEditNombre(cliente.clienteNombre || "");
    setEditDireccion(cliente.direccionTexto || "");
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedCliente) return;
    updateClienteMutation.mutate({
      id: selectedCliente.id,
      clienteNombre: editNombre,
      direccionTexto: editDireccion,
    });
  };

  const getMetodoPagoIcon = (metodo: string | null) => {
    switch (metodo) {
      case "tarjeta": return <CreditCard size={14} className="text-blue-600" />;
      case "transferencia": return <Wallet size={14} className="text-purple-600" />;
      default: return <Banknote size={14} className="text-green-600" />;
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "entregado": return <Badge className="bg-green-100 text-green-700 text-xs">Entregado</Badge>;
      case "cancelado": return <Badge className="bg-red-100 text-red-700 text-xs">Cancelado</Badge>;
      case "en_camino": return <Badge className="bg-blue-100 text-blue-700 text-xs">En Camino</Badge>;
      default: return <Badge className="bg-orange-100 text-orange-700 text-xs">Pendiente</Badge>;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (colmadoData?.estado === "inactivo") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Cuenta Suspendida</h1>
          <p className="text-gray-600 mb-6">
            Tu cuenta está temporalmente suspendida. Para reactivar tu servicio, comunícate con nuestro equipo de soporte.
          </p>
          <Button variant="outline" onClick={() => logout()} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  const headerRight = (
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
  );

  return (
    <NegocioLayout title="Clientes" activeNav="clientes" headerRight={headerRight}>


        <main className="flex-1 flex overflow-hidden">
          <div className={`w-full md:w-80 lg:w-96 border-r bg-white flex flex-col ${selectedCliente ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Buscar cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-cliente"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : filteredClientes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users size={48} className="mx-auto mb-2 opacity-50" />
                    <p>No hay clientes</p>
                  </div>
                ) : (
                  filteredClientes.map((cliente) => (
                    <div
                      key={cliente.id}
                      onClick={() => setSelectedCliente(cliente)}
                      className={`p-3 rounded-lg cursor-pointer mb-1 transition-colors ${
                        selectedCliente?.id === cliente.id
                          ? "bg-primary/10 border-l-4 border-primary"
                          : "hover:bg-gray-50"
                      }`}
                      data-testid={`cliente-${cliente.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 shrink-0">
                          {(cliente.clienteNombre || cliente.clienteWhatsapp)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm truncate">
                              {cliente.clienteNombre || cliente.clienteWhatsapp}
                            </span>
                            <ChevronRight size={16} className="text-gray-400" />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{cliente.cantidadPedidos} pedidos</span>
                            <span>•</span>
                            <span>{moneda}{cliente.totalGastado.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className={`flex-1 flex flex-col bg-gray-50 ${selectedCliente ? 'flex' : 'hidden md:flex'}`}>
            {selectedCliente ? (
              <>
                <div className="bg-white border-b p-4">
                  {/* Top bar: back + avatar + info + edit */}
                  <div className="flex items-center gap-3">
                    <button
                      className="md:hidden p-1 hover:bg-gray-100 rounded shrink-0"
                      onClick={() => setSelectedCliente(null)}
                    >
                      <X size={20} />
                    </button>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg shrink-0">
                      {(selectedCliente.clienteNombre || selectedCliente.clienteWhatsapp)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-base leading-tight truncate">{selectedCliente.clienteNombre || "Sin nombre"}</h2>
                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                        <Phone size={12} /> {selectedCliente.clienteWhatsapp}
                      </p>
                      {selectedCliente.direccionTexto && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                          <MapPin size={12} /> {selectedCliente.direccionTexto}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 px-2 h-8 text-xs" onClick={() => handleEditClick(selectedCliente)} data-testid="button-edit-cliente">
                      <Edit2 size={13} className="mr-1" /> Editar
                    </Button>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-xl font-bold text-primary leading-tight">{selectedCliente.cantidadPedidos}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Pedidos</p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm font-bold text-green-600 leading-tight truncate">{moneda}{selectedCliente.totalGastado.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Total Gastado</p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm font-bold text-gray-600 leading-tight">
                        {selectedCliente.ultimoPedido
                          ? new Date(selectedCliente.ultimoPedido).toLocaleDateString("es-DO", { day: "numeric", month: "short" })
                          : "-"}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Último Pedido</p>
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <Calendar size={18} /> Historial de Pedidos
                  </h3>
                  <div className="space-y-3">
                    {(clientePedidos || []).map((pedido) => (
                      <Card key={pedido.id} className="border-none shadow-sm" data-testid={`pedido-historial-${pedido.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium text-sm">{formatProductos(pedido.productos)}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(pedido.fechaCreacion).toLocaleDateString("es-DO", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            {getEstadoBadge(pedido.estado)}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t flex-wrap">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {getMetodoPagoIcon(pedido.metodoPago)}
                              <Select
                                value={pedido.metodoPago || "efectivo"}
                                onValueChange={(value) => updateMetodoPagoMutation.mutate({ pedidoId: pedido.id, metodoPago: value })}
                              >
                                <SelectTrigger className="h-7 w-32 text-xs" data-testid={`select-metodo-pago-${pedido.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="efectivo">Efectivo</SelectItem>
                                  <SelectItem value="transferencia">Transferencia</SelectItem>
                                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="font-bold text-primary shrink-0">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {(!clientePedidos || clientePedidos.length === 0) && (
                      <div className="text-center py-8 text-gray-500">
                        <Package size={48} className="mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos registrados</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Users size={64} className="mx-auto mb-4 opacity-30" />
                  <p>Selecciona un cliente para ver su historial</p>
                </div>
              </div>
            )}
          </div>
        </main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nombre</label>
              <Input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                placeholder="Nombre del cliente"
                data-testid="input-edit-nombre"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Dirección</label>
              <Input
                value={editDireccion}
                onChange={(e) => setEditDireccion(e.target.value)}
                placeholder="Dirección de entrega"
                data-testid="input-edit-direccion"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateClienteMutation.isPending} data-testid="button-save-cliente">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NegocioLayout>
  );
}
