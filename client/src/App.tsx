import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AdminIndex from "@/pages/admin/index";
import SetupPage from "@/pages/admin/setup";
import PlatformAdminPage from "@/pages/admin/platform";
import PlansAdminPage from "@/pages/admin/plans";
import NegocioNuevoPage from "@/pages/admin/negocio-nuevo";
import NegocioEditarPage from "@/pages/admin/negocio-editar";
import ManualPage from "@/pages/admin/manual";
import AdminPedidosPage from "@/pages/admin/pedidos";
import NegocioManualPage from "@/pages/negocio/manual";
import NegocioDashboard from "@/pages/negocio/dashboard";
import NegocioPedidosPage from "@/pages/negocio/pedidos";
import NegocioCocinaPage from "@/pages/negocio/cocina";
import NegocioDeliveriesPage from "@/pages/negocio/deliveries";
import NegocioVentasPage from "@/pages/negocio/ventas";
import NegocioDeliveryDashboard from "@/pages/negocio/delivery-dashboard";
import NegocioWhatsAppConfigPage from "@/pages/negocio/whatsapp-config";
import NegocioConversacionesPage from "@/pages/negocio/conversaciones";
import NegocioSettingsPage from "@/pages/negocio/settings";
import NegocioClientesPage from "@/pages/negocio/clientes";
import NegocioMenuPage from "@/pages/negocio/menu";
import NegocioJergaPage from "@/pages/negocio/jerga";
import NegocioChatConfigPage from "@/pages/negocio/chat-config";
import NegocioCuadresPage from "@/pages/negocio/cuadres";
import NegocioZipAlertasPage from "@/pages/negocio/zip-alertas";
import NegocioSucursalesPage from "@/pages/negocio/sucursales";
import NegocioEmpleadosPage from "@/pages/negocio/empleados";
import EmpleadoPortalPage from "@/pages/empleado-portal";
import LoginPage from "@/pages/login";
import PrimerAccesoPage from "@/pages/primer-acceso";
import LegalPage from "@/pages/legal";
import RecuperarPage from "@/pages/recuperar";
import DeletionStatusPage from "@/pages/deletion-status";
import DataDeletionPage from "@/pages/data-deletion";
import ContactPage from "@/pages/contact";
import PedirPage from "@/pages/pedir";
import MenuGraficoPage from "@/pages/menu-grafico";
import RepartidorPage from "@/pages/repartidor";
import SeguimientoPage from "@/pages/seguimiento";
import SucursalPage from "@/pages/sucursal";

function Router() {
  return (
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
