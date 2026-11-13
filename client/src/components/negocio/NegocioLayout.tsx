import { useState, ReactNode } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MessageCircle, Truck, Package, DollarSign, TrendingUp,
  Menu, X, LogOut, Settings, Users, BookOpen, UtensilsCrossed,
   Smartphone, ClipboardList, MoreHorizontal, ChevronRight, Building2,
  Home, BarChart3, UserCog, Contact,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { businessTheme } from "@/lib/temaNegocio";
import { useTiempoReal } from "@/hooks/use-tiempo-real";

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
  // Pedidos y mensajes nuevos aparecen al instante (además de la recarga periódica).
  useTiempoReal(colmadoId);

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    tipoNegocio: string;
    colorPrimario: string | null;
    estado?: string;
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

  const esDueno = roleData?.role === "colmado_owner";
  const esAdmin = esDueno || roleData?.role === "admin_pedidos";
  const inicial = colmadoData?.nombre?.charAt(0).toUpperCase() || "N";
  const logo = (clases: string) => (
    <div className={`${clases} bg-primary text-primary-foreground flex items-center justify-center font-bold overflow-hidden shrink-0`}>
      {colmadoData?.logo ? <img src={colmadoData.logo} alt="" className="w-full h-full object-contain bg-white" /> : inicial}
    </div>
  );

  // ─── Enlace del menú lateral ──────────────────────────────────────────────
  const navLink = (
    href: string,
    nav: ActiveNav,
    Icon: React.ComponentType<{ size?: number; className?: string }>,
    label: string,
    badge?: number,
  ) => {
    const isActive = activeNav === nav;
    return (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[15px] transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-slate-700 font-medium hover:bg-slate-100"
        }`}
        data-testid={`nav-${nav}`}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon size={19} className={isActive ? "" : "text-slate-500"} />
        <span className="flex-1 truncate">{label}</span>
        {badge && badge > 0 ? (
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${isActive ? "bg-primary text-primary-foreground" : "bg-slate-200 text-slate-800"}`}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </Link>
    );
  };
  const grupo = (nombre: string) => (
    <p className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{nombre}</p>
  );

  // ─── Tarjeta de la hoja "Más" (celular) ───────────────────────────────────
  const otrasCard = (
    href: string,
    nav: ActiveNav,
    Icon: React.ComponentType<{ size?: number }>,
    label: string,
    badge?: number,
  ) => {
    const isActive = activeNav === nav;
    return (
      <Link
        href={href}
        key={nav}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-colors ${
          isActive ? "bg-primary/10 border-primary/40" : "bg-white border-slate-200 active:bg-slate-50"
        }`}
        onClick={() => setOtrasOpen(false)}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          <Icon size={21} />
        </div>
        <span className={`text-xs font-semibold text-center leading-tight ${isActive ? "text-primary" : "text-slate-700"}`}>{label}</span>
        {badge && badge > 0 ? (
          <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  // ─── Pestaña del menú de abajo (celular) ──────────────────────────────────
  const pestana = (
    href: string,
    nav: ActiveNav,
    Icon: React.ComponentType<{ size?: number }>,
    label: string,
    badge?: number,
  ) => {
    const isActive = activeNav === nav;
    return (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl transition-colors ${
          isActive ? "bg-primary/10 text-primary font-bold" : "text-slate-600 font-medium"
        }`}
        data-testid={`bottom-nav-${nav}`}
      >
        <div className="relative">
          <Icon size={21} />
          {badge && badge > 0 ? (
            <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none ring-2 ring-white">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] leading-none">{label}</span>
      </Link>
    );
  };

  const currentDateTime = formatDominicanDateTime();

  const OTRAS_NAVS: ActiveNav[] = ["cocina", "clientes", "cuadres", "ventas", "reportes", "menu", "whatsapp-config", "settings", "manual", "sucursales", "usuarios", "empleados"];
  const isOtrasActive = OTRAS_NAVS.includes(activeNav);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900" style={businessTheme(colmadoData?.colorPrimario)}>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Menú lateral (computadora) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 pt-5 pb-3 flex items-center gap-3 shrink-0">
          {logo("w-10 h-10 rounded-xl")}
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-[15px] leading-tight truncate" data-testid="text-header-negocio-name">{colmadoData?.nombre || "Mi Negocio"}</p>
            <p className="text-xs text-slate-500 truncate" data-testid="text-plan-name">{suscripcionData?.plan?.nombre || "Sin Plan"}</p>
          </div>
          <button className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-600" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 pb-3 space-y-0.5 overflow-y-auto" aria-label="Menú del negocio">
          {navLink("/negocio/dashboard", "dashboard", Home, "Inicio")}
          {navLink("/negocio/pedidos", "pedidos", Package, "Pedidos", pedidosPendientes.length || 0)}
          {navLink("/negocio/conversaciones", "conversaciones", MessageCircle, "Chats", unreadCount)}

          {grupo("Mi negocio")}
          {tieneMenu && navLink("/negocio/menu", "menu", UtensilsCrossed, "Menú y productos")}
          {navLink("/negocio/deliveries", "deliveries", Truck, "Repartidores")}
          {navLink("/negocio/clientes", "clientes", Users, "Clientes")}
          {esAdmin && navLink("/negocio/empleados", "empleados", Contact, "Empleados")}

          {grupo("Dinero")}
          {navLink("/negocio/ventas", "ventas", DollarSign, "Ventas")}
          {navLink("/negocio/cuadres", "cuadres", ClipboardList, "Cuadres")}
          {esAdmin && navLink("/negocio/reportes", "reportes", BarChart3, "Reportes")}

          {grupo("Ajustes")}
          {navLink("/negocio/settings", "settings", Settings, "Configuración")}
          {navLink("/negocio/whatsapp-config", "whatsapp-config", Smartphone, "WhatsApp")}
          {esDueno && navLink("/negocio/sucursales", "sucursales", Building2, "Sucursales")}
          {esDueno && navLink("/negocio/usuarios", "usuarios", UserCog, "Usuarios y permisos")}
          {navLink("/negocio/manual", "manual", BookOpen, "Manual de uso")}
        </nav>

        <div className="p-3 border-t border-slate-200 shrink-0">
          <p className="sr-only" data-testid="text-negocio-name">{colmadoData?.nombre || "Mi Negocio"}</p>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[15px] font-medium text-red-700 hover:bg-red-50 w-full"
            data-testid="button-logout"
          >
            <LogOut size={19} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Contenido ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3 sm:px-5 lg:px-7 h-16 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="hidden text-slate-600 shrink-0"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar"
              aria-label="Abrir menú"
            >
              <Menu size={24} />
            </button>
            <div className="lg:hidden">{logo("w-9 h-9 rounded-lg text-sm")}</div>
            <span className="sr-only" data-testid="text-header-business-name">{colmadoData?.nombre || "Mi Negocio"}</span>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-[22px] leading-tight font-bold font-heading text-slate-900 truncate">{title}</h1>
              {subtitle !== undefined ? (
                <p className="text-xs sm:text-[13px] text-slate-500 truncate">{subtitle}</p>
              ) : (
                <p className="text-xs sm:text-[13px] text-slate-500 truncate hidden sm:block" data-testid="text-datetime">{currentDateTime}</p>
              )}
            </div>
            {sucursalesData && sucursalesData.sucursales.length > 1 && (
              <select
                value={sucursalesData.sucursalActivaId}
                onChange={(event) => cambiarSucursalMutation.mutate(Number(event.target.value))}
                className="max-w-[140px] sm:max-w-[210px] h-10 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm px-2 outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Sucursal activa"
                data-testid="select-sucursal-activa"
              >
                {sucursalesData.sucursales.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>
                ))}
              </select>
            )}
          </div>
          {headerRight && (
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {headerRight}
            </div>
          )}
        </header>

        {/* En el celular se deja espacio abajo para el menú */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden pb-20 lg:pb-0">
          {colmadoData?.estado === "pendiente_revision" && (
            <div className="mx-4 mt-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="banner-en-revision">
              <b>Tu negocio está en revisión.</b> Estamos verificando tus datos. Mientras tanto puedes preparar tu menú y tu configuración; cuando lo activemos empezarás a recibir pedidos y mensajes.
            </div>
          )}
          {colmadoData?.estado === "rechazado" && (
            <div className="mx-4 mt-3 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" data-testid="banner-rechazado">
              <b>No pudimos aprobar tu negocio.</b> Escríbenos a soporte@delywa.com para revisar tu solicitud.
            </div>
          )}
          {children}
        </div>
      </div>

      {/* ── Menú de abajo (celular) ── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        data-testid="bottom-nav"
        aria-label="Secciones"
      >
        {pestana("/negocio/dashboard", "dashboard", Home, "Inicio")}
        {pestana("/negocio/pedidos", "pedidos", Package, "Pedidos", pedidosPendientes.length)}
        {pestana("/negocio/conversaciones", "conversaciones", MessageCircle, "Chats", unreadCount)}
        {pestana("/negocio/deliveries", "deliveries", Truck, "Reparto")}
        <button
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl transition-colors ${
            isOtrasActive || otrasOpen ? "bg-primary/10 text-primary font-bold" : "text-slate-600 font-medium"
          }`}
          onClick={() => setOtrasOpen(true)}
          data-testid="bottom-nav-otras"
        >
          <MoreHorizontal size={21} />
          <span className="text-[11px] leading-none">Más</span>
        </button>
      </nav>

      {/* ── Hoja "Más" (celular) ── */}
      {otrasOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setOtrasOpen(false)} />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-50 rounded-t-3xl overflow-hidden shadow-2xl" style={{ maxHeight: "82vh" }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center gap-3 px-5 pt-2 pb-4">
              {logo("w-11 h-11 rounded-xl")}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 truncate leading-tight">{colmadoData?.nombre || "Mi Negocio"}</p>
                <p className="text-xs text-slate-500 truncate">{suscripcionData?.plan?.nombre || "Sin Plan"}</p>
              </div>
              <button
                onClick={() => setOtrasOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shrink-0"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-5" style={{ maxHeight: "calc(82vh - 110px)" }}>
              <div className="grid grid-cols-3 gap-2.5 mb-3">
                {tieneMenu && otrasCard("/negocio/menu", "menu", UtensilsCrossed, "Menú")}
                {otrasCard("/negocio/clientes", "clientes", Users, "Clientes")}
                {esAdmin && otrasCard("/negocio/empleados", "empleados", Contact, "Empleados")}
                {otrasCard("/negocio/ventas", "ventas", DollarSign, "Ventas")}
                {otrasCard("/negocio/cuadres", "cuadres", ClipboardList, "Cuadres")}
                {esAdmin && otrasCard("/negocio/reportes", "reportes", BarChart3, "Reportes")}
                {otrasCard("/negocio/settings", "settings", Settings, "Configuración")}
                {otrasCard("/negocio/whatsapp-config", "whatsapp-config", Smartphone, "WhatsApp")}
                {esDueno && otrasCard("/negocio/sucursales", "sucursales", Building2, "Sucursales")}
                {esDueno && otrasCard("/negocio/usuarios", "usuarios", UserCog, "Usuarios")}
                {otrasCard("/negocio/manual", "manual", BookOpen, "Manual")}
              </div>
              <button
                onClick={() => { setOtrasOpen(false); logout(); }}
                className="w-full flex items-center justify-center gap-2.5 min-h-[48px] rounded-2xl bg-white border border-red-200 text-red-700 font-semibold text-sm"
              >
                <LogOut size={18} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
