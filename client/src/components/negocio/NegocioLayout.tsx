import { useState, ReactNode } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MessageCircle, Truck, Package, DollarSign, TrendingUp,
  Menu, X, LogOut, Settings, Users, BookOpen, UtensilsCrossed,
   Smartphone, ClipboardList, MoreHorizontal, ChevronRight, Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { businessTheme } from "@/lib/temaNegocio";

type ActiveNav =
   | "dashboard" | "conversaciones" | "clientes" | "pedidos" | "cocina"
  | "deliveries" | "cuadres" | "ventas" | "menu" | "whatsapp-config"
   | "settings" | "manual" | "sucursales" | "usuarios" | "reportes" | "empleados";

interface NegocioLayoutProps {
  title: string;
  subtitle?: string;
  activeNav: ActiveNav;
  headerRight?: ReactNode;
  children: ReactNode;
}

export default function NegocioLayout({
  title,
  subtitle,
  activeNav,
  headerRight,
  children,
}: NegocioLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [otrasOpen, setOtrasOpen] = useState(false);
  const { logout, isAuthenticated } = useAuth();

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

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    tipoNegocio: string;
    colorPrimario: string | null;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["unread-messages", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/conversaciones/unread`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 10000,
  });

  type PedidoMin = { id: number; estado: string };
  const { data: pedidosData } = useQuery<PedidoMin[]>({
    queryKey: ["pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: suscripcionData } = useQuery<{ plan: { nombre: string } }>({
    queryKey: ["suscripcion", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/suscripcion`);
      if (!res.ok) throw new Error("Error al cargar suscripción");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: sucursalesData } = useQuery<{ sucursales: Array<{ id: number; nombre: string }>; sucursalActivaId: number }>({
    queryKey: ["sucursales"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/sucursales");
      if (!res.ok) throw new Error("Error al cargar sucursales");
      return res.json();
    },
    enabled: isAuthenticated && !!roleData?.colmadoId,
  });
  const cambiarSucursalMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/negocio/sucursales/${id}/seleccionar`, { method: "POST" });
      if (!res.ok) throw new Error("No se pudo cambiar de sucursal");
    },
    onSuccess: () => window.location.reload(),
  });

  const pedidosPendientes = pedidosData?.filter((p) => p.estado === "pendiente") || [];
  const unreadCount = unreadData?.count || 0;
  const tieneMenu = colmadoData?.tipoNegocio && !["colmado", "colmadon"].includes(colmadoData.tipoNegocio);

  // ─── Desktop sidebar nav link ─────────────────────────────────────────────
  const navLink = (
    href: string,
    nav: ActiveNav,
    Icon: React.ComponentType<{ size?: number }>,
    label: string,
    badge?: number,
    badgeColor?: string,
  ) => {
    const isActive = activeNav === nav;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-gray-100 text-gray-700"
        }`}
        data-testid={`nav-${nav}`}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon size={20} />
        {label}
        {badge && badge > 0 ? (
          <Badge className={`ml-auto ${badgeColor || "bg-red-500"}`}>{badge}</Badge>
        ) : null}
      </Link>
    );
  };

  // ─── Mobile "Otras" sheet card ────────────────────────────────────────────
  const otrasCard = (
    href: string,
    nav: ActiveNav,
    Icon: React.ComponentType<{ size?: number }>,
    label: string,
    colorClass: string,
    badge?: number,
    badgeColor?: string,
  ) => {
    const isActive = activeNav === nav;
    return (
      <Link
        href={href}
        key={nav}
        className={`relative flex flex-col items-center gap-2.5 p-4 rounded-2xl transition-all active:scale-95 ${
          isActive
            ? "bg-primary/10 ring-2 ring-primary/30"
            : "bg-gray-50 active:bg-gray-100"
        }`}
        onClick={() => setOtrasOpen(false)}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          isActive ? "bg-primary text-white shadow-lg shadow-primary/30" : `${colorClass} text-white shadow-md`
        }`}>
          <Icon size={22} />
        </div>
        <span className={`text-xs font-semibold text-center leading-tight ${isActive ? "text-primary" : "text-gray-700"}`}>
          {label}
        </span>
        {badge && badge > 0 ? (
          <span className={`absolute top-2.5 right-2.5 ${badgeColor || "bg-red-500"} text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const currentDateTime = formatDominicanDateTime();

  // Which tab group is "otras" active (for highlighting the Otras tab)
  const OTRAS_NAVS: ActiveNav[] = ["cocina", "clientes", "deliveries", "cuadres", "ventas", "reportes", "menu", "whatsapp-config", "settings", "manual", "sucursales", "usuarios"];
  const isOtrasActive = OTRAS_NAVS.includes(activeNav);

  return (
    <div className="min-h-screen bg-gray-50 flex" style={businessTheme(colmadoData?.colorPrimario)}>

      {/* ── Desktop sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
              {colmadoData?.logo ? (
                <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
              )}
            </div>
            <div className="font-heading font-bold text-lg leading-tight max-w-[140px]" data-testid="text-header-negocio-name">
              {(() => {
                const nombre = colmadoData?.nombre || "Mi Negocio";
                const palabras = nombre.split(" ");
                if (palabras.length <= 2) return <span className="truncate block">{nombre}</span>;
                return (
                  <>
                    <span className="truncate block">{palabras.slice(0, 2).join(" ")}</span>
                    <span className="text-sm font-medium text-gray-600 truncate block">{palabras.slice(2).join(" ")}</span>
                  </>
                );
              })()}
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navLink("/negocio/dashboard", "dashboard", TrendingUp, "Dashboard")}
          {navLink("/negocio/conversaciones", "conversaciones", MessageCircle, "Conversaciones", unreadCount, "bg-red-500")}
          {navLink("/negocio/clientes", "clientes", Users, "Clientes")}
          {navLink("/negocio/pedidos", "pedidos", Package, "Pedidos", pedidosPendientes.length || 0, "bg-orange-500")}
          {navLink("/negocio/cocina", "cocina", UtensilsCrossed, "Cocina")}
          {navLink("/negocio/deliveries", "deliveries", Truck, "Deliveries")}
          {(roleData?.role === "colmado_owner" || roleData?.role === "admin_pedidos") && navLink("/negocio/empleados", "empleados", Users, "Empleados")}
          {navLink("/negocio/cuadres", "cuadres", ClipboardList, "Cuadres")}
          {navLink("/negocio/ventas", "ventas", DollarSign, "Ventas")}
           {(roleData?.role === "colmado_owner" || roleData?.role === "admin_pedidos") && navLink("/negocio/reportes", "reportes", TrendingUp, "Reportes")}
          {tieneMenu && navLink("/negocio/menu", "menu", UtensilsCrossed, "Menú")}
          {navLink("/negocio/whatsapp-config", "whatsapp-config", Smartphone, "WhatsApp")}
          {navLink("/negocio/settings", "settings", Settings, "Configuración")}
           {roleData?.role === "colmado_owner" && navLink("/negocio/sucursales", "sucursales", Building2, "Sucursales")}
           {roleData?.role === "colmado_owner" && navLink("/negocio/usuarios", "usuarios", Users, "Usuarios y permisos")}
          {navLink("/negocio/manual", "manual", BookOpen, "Manual de Usuario")}

          <div className="pt-4 mt-4 border-t">
            <button
              onClick={() => logout()}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 w-full"
              data-testid="button-logout"
            >
              <LogOut size={20} />
              Cerrar Sesión
            </button>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t shrink-0">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-14 h-14 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
              {colmadoData?.logo ? (
                <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" data-testid="text-negocio-name">
                {colmadoData?.nombre || "Mi Negocio"}
              </p>
              <p className="text-xs text-gray-500 truncate" data-testid="text-plan-name">
                {suscripcionData?.plan?.nombre || "Sin Plan"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Green Sticky Header */}
        <header className="bg-primary text-white sticky top-0 z-30 px-3 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Hamburger only on desktop (mobile uses bottom nav) */}
            <button
              className="hidden lg:hidden text-white/80 hover:text-white shrink-0"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar"
            >
              <Menu size={24} />
            </button>
            {/* Business identity: logo + name */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-11 h-11 rounded-full bg-white/20 border border-white/30 flex items-center justify-center overflow-hidden text-white font-bold text-sm shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <span
                className="font-medium text-white/90 text-sm truncate max-w-[110px]"
                data-testid="text-header-business-name"
              >
                {colmadoData?.nombre || "Mi Negocio"}
              </span>
              <span className="text-white/40 text-lg font-light">|</span>
            </div>
            {/* Page title */}
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold font-heading truncate">{title}</h1>
              {subtitle !== undefined ? (
                <p className="text-xs sm:text-sm text-white/70 hidden sm:block">{subtitle}</p>
              ) : (
                <p className="text-xs sm:text-sm text-white/70 hidden sm:block" data-testid="text-datetime">{currentDateTime}</p>
              )}
            </div>
             {sucursalesData && sucursalesData.sucursales.length > 1 && (
              <select
                value={sucursalesData.sucursalActivaId}
                onChange={(event) => cambiarSucursalMutation.mutate(Number(event.target.value))}
                className="max-w-[150px] sm:max-w-[210px] h-8 rounded-md bg-white/15 border border-white/30 text-white text-xs px-2 outline-none"
                aria-label="Sucursal activa"
                data-testid="select-sucursal-activa"
              >
                {sucursalesData.sucursales.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id} className="text-gray-900">{sucursal.nombre}</option>
                ))}
              </select>
            )}
          </div>
          {headerRight && (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-2">
              {headerRight}
            </div>
          )}
        </header>

        {/* Page Content — extra bottom padding on mobile for bottom nav */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden pb-20 lg:pb-0">
          {children}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          MOBILE BOTTOM NAV BAR (hidden on lg+)
      ════════════════════════════════════════════════════════════ */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-stretch"
        style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}
        data-testid="bottom-nav"
      >
        {/* Dashboard */}
        <Link
          href="/negocio/dashboard"
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors ${
            activeNav === "dashboard" ? "text-primary" : "text-gray-500"
          }`}
          data-testid="bottom-nav-dashboard"
        >
          <TrendingUp size={20} />
          <span className="text-[10px] font-medium leading-none">Dashboard</span>
        </Link>

        {/* Conversaciones */}
        <Link
          href="/negocio/conversaciones"
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 relative transition-colors ${
            activeNav === "conversaciones" ? "text-primary" : "text-gray-500"
          }`}
          data-testid="bottom-nav-conversaciones"
        >
          <div className="relative">
            <MessageCircle size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none">Chats</span>
        </Link>

        {/* Pedidos */}
        <Link
          href="/negocio/pedidos"
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 relative transition-colors ${
            activeNav === "pedidos" ? "text-primary" : "text-gray-500"
          }`}
          data-testid="bottom-nav-pedidos"
        >
          <div className="relative">
            <Package size={20} />
            {pedidosPendientes.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {pedidosPendientes.length > 9 ? "9+" : pedidosPendientes.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none">Pedidos</span>
        </Link>

        {/* Deliveries */}
        <Link
          href="/negocio/deliveries"
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors ${
            activeNav === "deliveries" ? "text-primary" : "text-gray-500"
          }`}
          data-testid="bottom-nav-deliveries"
        >
          <Truck size={20} />
          <span className="text-[10px] font-medium leading-none">Delivery</span>
        </Link>

        {/* Cuadres */}
        <Link
          href="/negocio/cuadres"
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors ${
            activeNav === "cuadres" ? "text-primary" : "text-gray-500"
          }`}
          data-testid="bottom-nav-cuadres"
        >
          <ClipboardList size={20} />
          <span className="text-[10px] font-medium leading-none">Cuadres</span>
        </Link>

        {/* Otras */}
        <button
          className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors ${
            isOtrasActive || otrasOpen ? "text-primary" : "text-gray-500"
          }`}
          onClick={() => setOtrasOpen(true)}
          data-testid="bottom-nav-otras"
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-medium leading-none">Otras</span>
        </button>
      </nav>

      {/* ════════════════════════════════════════════════════════════
          "OTRAS" BOTTOM SHEET — modern card grid
      ════════════════════════════════════════════════════════════ */}
      {otrasOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={() => setOtrasOpen(false)}
          />
          {/* Sheet */}
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden"
            style={{ maxHeight: "82vh", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Business header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-4">
              <div className="w-12 h-12 rounded-2xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-primary font-bold overflow-hidden shrink-0 shadow-sm">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-lg">{colmadoData?.nombre?.charAt(0).toUpperCase() || "N"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate leading-tight">{colmadoData?.nombre || "Mi Negocio"}</p>
                <p className="text-xs text-gray-400 truncate">{suscripcionData?.plan?.nombre || "Sin Plan"}</p>
              </div>
              <button
                onClick={() => setOtrasOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px bg-gray-100 mb-4" />

            {/* Card grid */}
            <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(82vh - 140px)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {otrasCard("/negocio/cocina", "cocina", UtensilsCrossed, "Cocina", "bg-red-500")}
                {otrasCard("/negocio/clientes", "clientes", Users, "Clientes", "bg-blue-500")}
                {otrasCard("/negocio/ventas", "ventas", DollarSign, "Ventas", "bg-emerald-500")}
                {otrasCard("/negocio/whatsapp-config", "whatsapp-config", Smartphone, "WhatsApp", "bg-green-600")}
                {tieneMenu && otrasCard("/negocio/menu", "menu", UtensilsCrossed, "Menú", "bg-orange-500")}
                 {(roleData?.role === "colmado_owner" || roleData?.role === "admin_pedidos") && otrasCard("/negocio/empleados", "empleados", Users, "Empleados", "bg-cyan-500")}
                {otrasCard("/negocio/settings", "settings", Settings, "Config.", "bg-slate-500")}
                 {roleData?.role === "colmado_owner" && otrasCard("/negocio/sucursales", "sucursales", Building2, "Sucursales", "bg-indigo-500")}
                 {roleData?.role === "colmado_owner" && otrasCard("/negocio/usuarios", "usuarios", Users, "Usuarios y permisos", "bg-purple-500")}
                 {(roleData?.role === "colmado_owner" || roleData?.role === "admin_pedidos") && otrasCard("/negocio/reportes", "reportes", TrendingUp, "Reportes", "bg-emerald-500")}
                {otrasCard("/negocio/manual", "manual", BookOpen, "Manual", "bg-violet-500")}
              </div>

              {/* Logout — full width danger button */}
              <button
                onClick={() => { setOtrasOpen(false); logout(); }}
                className="mt-1 w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-red-50 text-red-600 font-semibold text-sm active:bg-red-100 transition-colors"
              >
                <LogOut size={18} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
