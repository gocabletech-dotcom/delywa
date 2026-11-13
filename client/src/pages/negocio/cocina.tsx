import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChefHat, Clock3, PackageCheck, Truck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";

type PedidoCocina = {
  id: number;
  estado: string;
  clienteNombre: string;
  clienteUbicacion: string;
  productos: string;
  notas: string | null;
  tipoEntrega: "delivery" | "pickup";
  fechaCreacion: string;
  deliveryId: number | null;
};

type Delivery = { id: number; nombre: string; estado: string };

function productosPedido(value: string): Array<{ nombre: string; cantidad?: number }> {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [{ nombre: value }];
}

function hora(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CocinaPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: roleData } = useQuery<{ colmadoId?: number }>({
    queryKey: ["user-role"],
    queryFn: async () => (await fetch("/api/user/role")).json(),
    enabled: isAuthenticated,
  });
  const colmadoId = roleData?.colmadoId;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) window.location.href = "/login";
  }, [authLoading, isAuthenticated]);

  const { data: pedidos = [], isLoading } = useQuery<PedidoCocina[]>({
    queryKey: ["cocina-pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/cocina/pedidos`);
      if (!res.ok) throw new Error("No se pudieron cargar los pedidos");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 10_000,
  });

  const { data: deliveries = [] } = useQuery<Delivery[]>({
    queryKey: ["deliveries", colmadoId],
    queryFn: async () => (await fetch(`/api/colmados/${colmadoId}/deliveries`)).json(),
    enabled: !!colmadoId,
  });

  const estadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/pedidos/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el pedido");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cocina-pedidos", colmadoId] }),
    onError: (error: Error) => toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" }),
  });

  const asignarMutation = useMutation({
    mutationFn: async ({ pedidoId, deliveryId }: { pedidoId: number; deliveryId: number }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/asignar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo asignar el repartidor");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cocina-pedidos", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["pedidos", colmadoId] });
      toast({ title: "Repartidor asignado", description: "El repartidor ya puede recibir el pedido." });
    },
    onError: (error: Error) => toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" }),
  });

  const grupos = [
    { estado: "pendiente", titulo: "Por preparar", icon: Clock3, color: "border-orange-200 bg-orange-50", action: "en_preparacion", actionLabel: "Iniciar preparación" },
    { estado: "en_preparacion", titulo: "En preparación", icon: ChefHat, color: "border-blue-200 bg-blue-50", action: "listo", actionLabel: "Marcar listo" },
    { estado: "listo", titulo: "Listos", icon: PackageCheck, color: "border-purple-200 bg-purple-50", action: null, actionLabel: "" },
  ] as const;
  const disponibles = deliveries.filter((delivery) => delivery.estado === "activo");

  return (
    <NegocioLayout title="Preparación de pedidos" subtitle="Lo que hay que preparar ahora" activeNav="pedidos" headerRight={<Link href="/negocio/pedidos"><Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-300 text-slate-800 text-sm font-semibold">Volver a Pedidos</Button></Link>}>
      <main className="p-4 sm:p-6 overflow-auto">
        <div className="grid gap-4 lg:grid-cols-3">
          {grupos.map((grupo) => {
            const Icon = grupo.icon;
            const grupoPedidos = pedidos.filter((pedido) => pedido.estado === grupo.estado);
            return (
              <section key={grupo.estado} className={`rounded-xl border ${grupo.color} p-3 min-h-[260px]`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold flex items-center gap-2"><Icon size={19} /> {grupo.titulo}</h2>
                  <Badge variant="secondary">{grupoPedidos.length}</Badge>
                </div>
                <div className="space-y-3">
                  {isLoading && <p className="text-sm text-gray-500">Cargando pedidos…</p>}
                  {!isLoading && grupoPedidos.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">No hay pedidos</p>}
                  {grupoPedidos.map((pedido) => (
                    <article key={pedido.id} className="bg-white rounded-lg border shadow-sm p-3" data-testid={`cocina-pedido-${pedido.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold">Pedido #{pedido.id}</p>
                          <p className="text-xs text-gray-500">{pedido.clienteNombre} · {hora(pedido.fechaCreacion)}</p>
                        </div>
                        <Badge variant="outline">{pedido.tipoEntrega === "pickup" ? "Pickup" : "Delivery"}</Badge>
                      </div>
                      <ul className="mt-3 space-y-1 text-sm">
                        {productosPedido(pedido.productos).map((producto, index) => (
                          <li key={`${producto.nombre}-${index}`}><strong>{producto.cantidad || 1}×</strong> {producto.nombre}</li>
                        ))}
                      </ul>
                      {pedido.notas && <p className="mt-2 text-xs bg-yellow-50 border border-yellow-100 rounded p-2"><strong>Nota:</strong> {pedido.notas}</p>}
                      {grupo.action && (
                        <Button className="w-full mt-3" size="sm" onClick={() => estadoMutation.mutate({ id: pedido.id, estado: grupo.action! })} disabled={estadoMutation.isPending}>
                          <Check size={15} className="mr-1" /> {grupo.actionLabel}
                        </Button>
                      )}
                      {grupo.estado === "listo" && pedido.tipoEntrega === "delivery" && (
                        pedido.deliveryId ? (
                          <p className="mt-3 text-sm text-green-700 flex items-center gap-1"><Truck size={15} /> Repartidor asignado</p>
                        ) : (
                          <select
                            className="mt-3 w-full h-9 rounded-md border bg-white px-2 text-sm"
                            defaultValue=""
                            onChange={(event) => {
                              const deliveryId = Number(event.target.value);
                              if (deliveryId) asignarMutation.mutate({ pedidoId: pedido.id, deliveryId });
                            }}
                            disabled={asignarMutation.isPending}
                            aria-label={`Asignar delivery al pedido ${pedido.id}`}
                          >
                            <option value="">Asignar repartidor…</option>
                            {disponibles.map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.nombre}</option>)}
                          </select>
                        )
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </NegocioLayout>
  );
}