import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import type { ComponentType } from "react";

/**
 * Carga una pantalla aparte. Si falla porque se publicó una versión nueva mientras la página
 * estaba abierta (los archivos viejos ya no existen), recarga una sola vez para traer la nueva.
 */
function lazyConReintento<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(() => cargar().catch((err) => {
    const clave = "delywa-recarga-version";
    if (!sessionStorage.getItem(clave)) {
      sessionStorage.setItem(clave, "1");
      window.location.reload();
      return new Promise<{ default: T }>(() => undefined);
    }
    throw err;
  }).then((m) => { sessionStorage.removeItem("delywa-recarga-version"); return m; }));
}
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
const NotFound = lazyConReintento(() => import("@/pages/not-found"));
const Home = lazyConReintento(() => import("@/pages/home"));
const AdminIndex = lazyConReintento(() => import("@/pages/admin/index"));
const SetupPage = lazyConReintento(() => import("@/pages/admin/setup"));
const PlatformAdminPage = lazyConReintento(() => import("@/pages/admin/platform"));
const PlansAdminPage = lazyConReintento(() => import("@/pages/admin/plans"));
const NegocioNuevoPage = lazyConReintento(() => import("@/pages/admin/negocio-nuevo"));
const NegocioEditarPage = lazyConReintento(() => import("@/pages/admin/negocio-editar"));
const ManualPage = lazyConReintento(() => import("@/pages/admin/manual"));
const AdminPedidosPage = lazyConReintento(() => import("@/pages/admin/pedidos"));
const NegocioManualPage = lazyConReintento(() => import("@/pages/negocio/manual"));
const NegocioDashboard = lazyConReintento(() => import("@/pages/negocio/dashboard"));
const NegocioPedidosPage = lazyConReintento(() => import("@/pages/negocio/pedidos"));
const NegocioCocinaPage = lazyConReintento(() => import("@/pages/negocio/cocina"));
const NegocioDeliveriesPage = lazyConReintento(() => import("@/pages/negocio/deliveries"));
const NegocioVentasPage = lazyConReintento(() => import("@/pages/negocio/ventas"));
const NegocioDeliveryDashboard = lazyConReintento(() => import("@/pages/negocio/delivery-dashboard"));
const NegocioWhatsAppConfigPage = lazyConReintento(() => import("@/pages/negocio/whatsapp-config"));
const NegocioConversacionesPage = lazyConReintento(() => import("@/pages/negocio/conversaciones"));
const NegocioSettingsPage = lazyConReintento(() => import("@/pages/negocio/settings"));
const NegocioClientesPage = lazyConReintento(() => import("@/pages/negocio/clientes"));
const NegocioMenuPage = lazyConReintento(() => import("@/pages/negocio/menu"));
const NegocioJergaPage = lazyConReintento(() => import("@/pages/negocio/jerga"));
const NegocioChatConfigPage = lazyConReintento(() => import("@/pages/negocio/chat-config"));
const NegocioCuadresPage = lazyConReintento(() => import("@/pages/negocio/cuadres"));
const NegocioZipAlertasPage = lazyConReintento(() => import("@/pages/negocio/zip-alertas"));
const NegocioSucursalesPage = lazyConReintento(() => import("@/pages/negocio/sucursales"));
const NegocioEmpleadosPage = lazyConReintento(() => import("@/pages/negocio/empleados"));
const EmpleadoPortalPage = lazyConReintento(() => import("@/pages/empleado-portal"));
const LoginPage = lazyConReintento(() => import("@/pages/login"));
const PrimerAccesoPage = lazyConReintento(() => import("@/pages/primer-acceso"));
const LegalPage = lazyConReintento(() => import("@/pages/legal"));
const RecuperarPage = lazyConReintento(() => import("@/pages/recuperar"));
const DeletionStatusPage = lazyConReintento(() => import("@/pages/deletion-status"));
const DataDeletionPage = lazyConReintento(() => import("@/pages/data-deletion"));
const ContactPage = lazyConReintento(() => import("@/pages/contact"));
const PedirPage = lazyConReintento(() => import("@/pages/pedir"));
const MenuGraficoPage = lazyConReintento(() => import("@/pages/menu-grafico"));
const RepartidorPage = lazyConReintento(() => import("@/pages/repartidor"));
const SeguimientoPage = lazyConReintento(() => import("@/pages/seguimiento"));
const SucursalPage = lazyConReintento(() => import("@/pages/sucursal"));

// Capa 5: cada pantalla se descarga solo cuando se abre (el cliente que pide en un colmado
// no baja el panel de plataforma, ni los videos de la página principal, ni los mapas).
function Cargando() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Cargando">
      <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#25D366] animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<Cargando />}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/legal" component={() => <LegalPage />} />
      <Route path="/privacy" component={() => <LegalPage seccion="privacidad" />} />
      <Route path="/deletion-status/:code" component={DeletionStatusPage} />
      <Route path="/data-deletion" component={DataDeletionPage} />
      <Route path="/terms" component={() => <LegalPage seccion="terminos" />} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/recuperar" component={RecuperarPage} />
      <Route path="/primer-acceso" component={PrimerAccesoPage} />
      
      {/* Chat Web Público (sin restricciones de Meta) */}
      <Route path="/pedir/:codigo" component={PedirPage} />
      <Route path="/sucursal/:slug" component={SucursalPage} />
      
      {/* Portal Web Repartidores */}
      <Route path="/repartidor/:slug" component={RepartidorPage} />

      {/* Seguimiento público de pedido */}
      <Route path="/seguimiento/:pedidoId" component={SeguimientoPage} />
      
      {/* Menú Gráfico Visual */}
      <Route path="/menu/:codigo" component={MenuGraficoPage} />
      
      {/* Admin de Plataforma */}
      <Route path="/admin" component={AdminIndex} />
      <Route path="/admin/setup" component={SetupPage} />
      <Route path="/admin/platform" component={PlatformAdminPage} />
      <Route path="/admin/planes" component={PlansAdminPage} />
      <Route path="/admin/negocio/nuevo" component={NegocioNuevoPage} />
      <Route path="/admin/negocio/:id/editar" component={NegocioEditarPage} />
      <Route path="/admin/manual" component={ManualPage} />
      <Route path="/admin/pedidos" component={AdminPedidosPage} />
      
      {/* Panel de Negocio (dueños) */}
      <Route path="/negocio/dashboard" component={NegocioDashboard} />
      <Route path="/negocio/pedidos" component={NegocioPedidosPage} />
      <Route path="/negocio/cocina" component={NegocioCocinaPage} />
      <Route path="/negocio/deliveries" component={NegocioDeliveriesPage} />
      <Route path="/negocio/ventas" component={NegocioVentasPage} />
      <Route path="/negocio/reportes" component={NegocioVentasPage} />
      <Route path="/negocio/delivery-dashboard" component={NegocioDeliveryDashboard} />
      <Route path="/negocio/whatsapp-config" component={NegocioWhatsAppConfigPage} />
      <Route path="/negocio/conversaciones" component={NegocioConversacionesPage} />
      <Route path="/negocio/clientes" component={NegocioClientesPage} />
      <Route path="/negocio/settings" component={NegocioSettingsPage} />
      <Route path="/negocio/menu" component={NegocioMenuPage} />
      <Route path="/negocio/jerga" component={NegocioJergaPage} />
      <Route path="/negocio/chat-config" component={NegocioChatConfigPage} />
      <Route path="/negocio/cuadres" component={NegocioCuadresPage} />
      <Route path="/negocio/alertas/zip" component={NegocioZipAlertasPage} />
      <Route path="/negocio/sucursales" component={NegocioSucursalesPage} />
      <Route path="/negocio/usuarios" component={NegocioSucursalesPage} />
      <Route path="/negocio/empleados" component={NegocioEmpleadosPage} />
      <Route path="/empleado/:codigo" component={EmpleadoPortalPage} />
      <Route path="/empleado" component={EmpleadoPortalPage} />
      <Route path="/negocio/manual" component={NegocioManualPage} />
      
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
