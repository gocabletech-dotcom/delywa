import { useState } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  BookOpen, 
  Store, 
  Truck, 
  Package, 
  Users, 
  Settings, 
  MessageCircle,
  ChevronRight,
  CheckCircle2,
  Smartphone,
  MapPin,
  DollarSign,
  Clock,
  Coffee,
  Pizza,
  Pill,
  UtensilsCrossed,
  Sandwich,
  Warehouse,
  Bell
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DeliveryIllustration = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <circle cx="100" cy="100" r="90" fill="#E8F5E9" />
    <ellipse cx="100" cy="150" rx="50" ry="15" fill="#C8E6C9" />
    <rect x="60" y="100" width="80" height="40" rx="5" fill="#4CAF50" />
    <circle cx="75" cy="145" r="12" fill="#333" />
    <circle cx="125" cy="145" r="12" fill="#333" />
    <circle cx="75" cy="145" r="6" fill="#666" />
    <circle cx="125" cy="145" r="6" fill="#666" />
    <rect x="130" y="85" width="25" height="30" rx="3" fill="#FF9800" />
    <rect x="133" y="88" width="19" height="10" fill="#FFF" opacity="0.5" />
    <circle cx="100" cy="75" r="20" fill="#FFCCBC" />
    <ellipse cx="100" cy="60" rx="18" ry="12" fill="#5D4037" />
    <circle cx="93" cy="73" r="2" fill="#333" />
    <circle cx="107" cy="73" r="2" fill="#333" />
    <path d="M95 80 Q100 85 105 80" stroke="#333" strokeWidth="2" fill="none" />
    <rect x="90" y="95" width="20" height="25" rx="3" fill="#2196F3" />
    <circle cx="170" cy="50" r="15" fill="#FFF9C4" />
    <text x="170" y="55" textAnchor="middle" fontSize="12" fill="#FF9800">★</text>
  </svg>
);

const ColmaderoIllustration = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <circle cx="100" cy="100" r="90" fill="#E3F2FD" />
    <rect x="40" y="90" width="120" height="70" rx="5" fill="#1976D2" />
    <rect x="50" y="100" width="100" height="50" fill="#BBDEFB" />
    <rect x="55" y="105" width="25" height="20" rx="2" fill="#FFF" />
    <rect x="85" y="105" width="25" height="20" rx="2" fill="#FFF" />
    <rect x="115" y="105" width="30" height="40" rx="2" fill="#90CAF9" />
    <rect x="50" y="80" width="100" height="15" fill="#0D47A1" />
    <text x="100" y="91" textAnchor="middle" fontSize="10" fill="#FFF" fontWeight="bold">MI COLMADO</text>
    <circle cx="75" cy="60" r="18" fill="#FFCCBC" />
    <ellipse cx="75" cy="47" rx="15" ry="10" fill="#4E342E" />
    <circle cx="69" cy="58" r="2" fill="#333" />
    <circle cx="81" cy="58" r="2" fill="#333" />
    <path d="M70 65 Q75 70 80 65" stroke="#333" strokeWidth="2" fill="none" />
    <rect x="65" y="78" width="20" height="30" rx="3" fill="#4CAF50" />
    <rect x="60" y="78" width="5" height="20" fill="#4CAF50" />
    <rect x="80" y="78" width="5" height="20" fill="#4CAF50" />
    <rect x="130" y="50" width="30" height="35" rx="3" fill="#FFF" stroke="#DDD" />
    <rect x="133" y="53" width="24" height="15" fill="#E3F2FD" />
    <circle cx="145" cy="78" r="3" fill="#4CAF50" />
  </svg>
);

const ProductosIllustration = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <circle cx="100" cy="100" r="90" fill="#FFF3E0" />
    <rect x="30" y="80" width="40" height="60" rx="3" fill="#FF9800" />
    <rect x="35" y="85" width="30" height="20" fill="#FFF" opacity="0.3" />
    <text x="50" y="130" textAnchor="middle" fontSize="8" fill="#FFF">ARROZ</text>
    <rect x="80" y="70" width="35" height="70" rx="3" fill="#F44336" />
    <rect x="85" y="75" width="25" height="15" fill="#FFF" opacity="0.3" />
    <text x="97" y="125" textAnchor="middle" fontSize="6" fill="#FFF">SALSA</text>
    <circle cx="145" cy="110" r="25" fill="#FFC107" />
    <circle cx="145" cy="110" r="15" fill="#FFE082" />
    <text x="145" y="115" textAnchor="middle" fontSize="8" fill="#F57F17">QUESO</text>
    <rect x="120" y="60" width="25" height="35" rx="12" fill="#4CAF50" />
    <rect x="130" y="55" width="5" height="10" fill="#2E7D32" />
    <ellipse cx="55" cy="55" rx="20" ry="15" fill="#8BC34A" />
    <ellipse cx="55" cy="55" rx="12" ry="8" fill="#AED581" />
  </svg>
);

const ClienteIllustration = () => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <circle cx="100" cy="100" r="90" fill="#F3E5F5" />
    <circle cx="100" cy="70" r="25" fill="#FFCCBC" />
    <ellipse cx="100" cy="50" rx="20" ry="15" fill="#6D4C41" />
    <circle cx="92" cy="68" r="3" fill="#333" />
    <circle cx="108" cy="68" r="3" fill="#333" />
    <path d="M94 78 Q100 83 106 78" stroke="#333" strokeWidth="2" fill="none" />
    <path d="M70 100 Q100 130 130 100 L130 150 L70 150 Z" fill="#9C27B0" />
    <rect x="130" y="80" width="40" height="60" rx="5" fill="#333" />
    <rect x="133" y="85" width="34" height="50" rx="3" fill="#4CAF50" />
    <rect x="138" y="90" width="24" height="20" fill="#FFF" />
    <circle cx="150" cy="125" r="4" fill="#FFF" opacity="0.5" />
    <path d="M145 95 L155 105 M155 95 L145 105" stroke="#4CAF50" strokeWidth="2" />
  </svg>
);

const tiposNegocio = [
  { slug: "colmado", nombre: "Colmado", icon: Store, color: "bg-blue-500", desc: "Tienda de barrio" },
  { slug: "colmadon", nombre: "Colmadón", icon: Warehouse, color: "bg-indigo-500", desc: "Colmado grande" },
  { slug: "cafeteria", nombre: "Cafetería", icon: Coffee, color: "bg-amber-600", desc: "Café y snacks" },
  { slug: "restaurant", nombre: "Restaurante", icon: UtensilsCrossed, color: "bg-red-500", desc: "Comida completa" },
  { slug: "fast_food", nombre: "Comida Rápida", icon: Sandwich, color: "bg-orange-500", desc: "Servicio express" },
  { slug: "farmacia", nombre: "Farmacia", icon: Pill, color: "bg-green-600", desc: "Medicamentos" },
  { slug: "pizzeria", nombre: "Pizzería", icon: Pizza, color: "bg-red-600", desc: "Pizzas y más" },
];

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState("intro");

  const sections = [
    { id: "intro", label: "Introducción", icon: BookOpen },
    { id: "dueno", label: "Para el Dueño", icon: Store },
    { id: "delivery", label: "Para el Delivery", icon: Truck },
    { id: "tipos", label: "Tipos de Negocio", icon: Package },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      <header className="bg-primary text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/negocio/dashboard">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10" data-testid="button-volver">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al Panel
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-white/80" />
              Manual de Usuario
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <nav className="flex gap-2 overflow-x-auto pb-4 mb-6">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                activeSection === section.id
                  ? "bg-emerald-500 text-white shadow-lg"
                  : "bg-white text-gray-600 hover:bg-gray-100 border"
              }`}
              data-testid={`nav-section-${section.id}`}
            >
              <section.icon className="w-4 h-4" />
              {section.label}
            </button>
          ))}
        </nav>

        {activeSection === "intro" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="text-center py-8">
              <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center shadow-xl">
                <MessageCircle className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">Bienvenido a DelyWa</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Tu plataforma de delivery por WhatsApp. Automatiza pedidos, gestiona entregas y haz crecer tu negocio.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                <div className="h-48 bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center p-4">
                  <ColmaderoIllustration />
                </div>
                <CardContent className="p-4 text-center">
                  <h3 className="font-bold text-lg mb-2">Gestiona tu Negocio</h3>
                  <p className="text-gray-600 text-sm">Recibe pedidos automáticos por WhatsApp y administra todo desde un solo lugar.</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                <div className="h-48 bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center p-4">
                  <DeliveryIllustration />
                </div>
                <CardContent className="p-4 text-center">
                  <h3 className="font-bold text-lg mb-2">Deliveries Eficientes</h3>
                  <p className="text-gray-600 text-sm">Tus motores reciben los pedidos en su celular y marcan entregas fácilmente.</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                <div className="h-48 bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center p-4">
                  <ClienteIllustration />
                </div>
                <CardContent className="p-4 text-center">
                  <h3 className="font-bold text-lg mb-2">Clientes Felices</h3>
                  <p className="text-gray-600 text-sm">Tus clientes piden por WhatsApp y reciben actualizaciones automáticas.</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Clock className="w-6 h-6" />
                  Flujo de un Pedido
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {[
                    { step: 1, title: "Cliente pide", desc: "Por WhatsApp" },
                    { step: 2, title: "Tú confirmas", desc: "Precio y productos" },
                    { step: 3, title: "Cliente paga", desc: "Efectivo o transferencia" },
                    { step: 4, title: "Delivery recoge", desc: "Ve la dirección" },
                    { step: 5, title: "Entrega exitosa", desc: "Cliente recibe" },
                  ].map((item, i) => (
                    <div key={i} className="text-center">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
                        {item.step}
                      </div>
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-xs text-white/80">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "dueno" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 sm:gap-4 mb-8">
              <div className="w-16 h-16 sm:w-24 sm:h-24 shrink-0">
                <ColmaderoIllustration />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Guía para el Dueño del Negocio</h2>
                <p className="text-sm sm:text-base text-gray-600">Aprende a gestionar tu negocio con DelyWa</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    1. Conversaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-gray-600 text-sm">Aquí ves todos los mensajes de tus clientes por WhatsApp.</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Los mensajes nuevos aparecen con una bolita roja</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Puedes responder directamente desde aquí</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>El bot responde automáticamente cuando no estés</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Package className="w-4 h-4 text-orange-600" />
                    </div>
                    2. Pedidos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-gray-600 text-sm">Gestiona todos los pedidos de tu negocio.</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span><strong>Por confirmar:</strong> Revisa productos y pon el total</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span><strong>Pendientes:</strong> Listos para asignar a un delivery</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span><strong>En camino:</strong> El delivery está en ruta</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-purple-600" />
                    </div>
                    3. Deliveries
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-gray-600 text-sm">Administra tus motores y mensajeros.</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Agrega nuevos deliveries con su WhatsApp</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Ve cuáles están activos (disponibles)</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Asigna pedidos a deliveries específicos</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-green-600" />
                    </div>
                    4. Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-gray-600 text-sm">Mira tus ventas y estadísticas.</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Total vendido hoy y esta semana</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Pedidos entregados vs cancelados</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Cuadrar caja al final del día</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Settings className="w-4 h-4 text-gray-600" />
                    </div>
                    5. Configuración
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">Datos del Negocio</h4>
                      <p className="text-sm text-gray-600">Nombre, dirección, logo y horarios de tu negocio.</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">Métodos de Pago</h4>
                      <p className="text-sm text-gray-600">Efectivo, transferencia o tarjeta. Configura tus cuentas bancarias.</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">WhatsApp</h4>
                      <p className="text-sm text-gray-600">Conecta tu número de WhatsApp Business para recibir pedidos.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeSection === "delivery" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 sm:gap-4 mb-8">
              <div className="w-16 h-16 sm:w-24 sm:h-24 shrink-0">
                <DeliveryIllustration />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Guía para el Delivery</h2>
                <p className="text-sm sm:text-base text-gray-600">Cómo usar DelyWa desde tu celular</p>
              </div>
            </div>

            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Smartphone className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Todo desde tu WhatsApp</h3>
                    <p className="text-white/80">No necesitas instalar ninguna app. Recibes todo por mensajes.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg font-bold">1</div>
                    <CardTitle className="text-lg">Actívate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-3">Envía un mensaje al WhatsApp del negocio:</p>
                    <div className="bg-emerald-100 rounded-lg p-3 inline-block">
                      <p className="font-mono text-emerald-800 font-semibold">"Activo"</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    El sistema te reconoce y te marca como <Badge className="bg-green-500">Disponible</Badge>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg font-bold">2</div>
                    <CardTitle className="text-lg">Recibe pedidos</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600">Cuando te asignan un pedido, recibes un mensaje con:</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span>Nombre del cliente</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-red-500" />
                      <span>Dirección de entrega</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Package className="w-4 h-4 text-orange-500" />
                      <span>Lista de productos</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-green-500" />
                      <span>Total a cobrar y devuelta</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg font-bold">3</div>
                    <CardTitle className="text-lg">Marca entregado</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-3">Cuando entregas, escribe:</p>
                    <div className="bg-emerald-100 rounded-lg p-3 inline-block">
                      <p className="font-mono text-emerald-800 font-semibold">"Entregado #123"</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Donde 123 es el número del pedido. El cliente recibe confirmación automática.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-400 text-white flex items-center justify-center text-lg font-bold">4</div>
                    <CardTitle className="text-lg">Desactívate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-3">Cuando termines tu turno:</p>
                    <div className="bg-gray-200 rounded-lg p-3 inline-block">
                      <p className="font-mono text-gray-700 font-semibold">"Inactivo"</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    No recibirás más pedidos hasta que vuelvas a activarte.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-md bg-blue-50">
              <CardContent className="p-6">
                <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Comandos útiles
                </h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <p className="font-mono text-sm text-blue-600 mb-1">"Activo"</p>
                    <p className="text-xs text-gray-600">Empezar a recibir pedidos</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="font-mono text-sm text-blue-600 mb-1">"Inactivo"</p>
                    <p className="text-xs text-gray-600">Dejar de recibir pedidos</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="font-mono text-sm text-blue-600 mb-1">"Entregado #N"</p>
                    <p className="text-xs text-gray-600">Marcar pedido como entregado</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "tipos" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 sm:gap-4 mb-8">
              <div className="w-16 h-16 sm:w-24 sm:h-24 shrink-0">
                <ProductosIllustration />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Tipos de Negocio</h2>
                <p className="text-sm sm:text-base text-gray-600">DelyWa funciona para diferentes tipos de negocios</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tiposNegocio.map((tipo) => (
                <Card key={tipo.slug} className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden" data-testid={`card-tipo-${tipo.slug}`}>
                  <div className={`h-24 ${tipo.color} flex items-center justify-center`}>
                    <tipo.icon className="w-12 h-12 text-white" />
                  </div>
                  <CardContent className="p-4 text-center">
                    <h3 className="font-bold text-lg mb-1">{tipo.nombre}</h3>
                    <p className="text-gray-600 text-sm">{tipo.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">¿Qué tipo de negocio eres?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  DelyWa se adapta a tu tipo de negocio. Según el tipo que elijas:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">Colmados y Colmadones</p>
                      <p className="text-sm text-gray-600">Los clientes piden por monto ("dame 50 de arroz")</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">Restaurantes y Pizzerías</p>
                      <p className="text-sm text-gray-600">Pueden usar menú con precios fijos</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">Cafeterías</p>
                      <p className="text-sm text-gray-600">Ideal para pedidos de café y snacks</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">Farmacias</p>
                      <p className="text-sm text-gray-600">Entrega de medicamentos a domicilio</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
