import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  MessageCircle,
  Truck,
  TrendingUp,
  ShieldCheck,
  Smartphone,
  Menu,
  X,
  ArrowRight,
  CheckCircle2,
  Link2,
  Zap,
  Gift,
  Play,
  Eye,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

// Assets
import heroImage from "@assets/generated_images/delivery_driver_on_motorcycle_in_dominican_republic_street.png";
import phoneImage from "@assets/generated_images/smartphone_showing_whatsapp_style_chat_bot_interface.png";

const WA_SALES = "https://wa.me/19193436706?text=Quiero%20registrar%20mi%20negocio%20en%20DelyWa%20gratis";

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  const copyToClipboard = (text: string, field: "email" | "password") => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/admin");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-white font-sans text-foreground overflow-x-hidden">

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="container mx-auto px-4 md:px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white rounded-xl shadow-md border border-gray-100">
              <img src="/delywa-logo.png" alt="DelyWa" className="h-16 w-auto rounded-lg" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-bold text-2xl tracking-tight text-brand-dark">DelyWa</span>
              <span className="text-xs text-gray-500">La forma más fácil de vender por WhatsApp</span>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#como-funciona" className="text-sm font-medium hover:text-primary transition-colors">¿Cómo funciona?</a>
            <a href="#delivery" className="text-sm font-medium hover:text-primary transition-colors">Soy Delivery</a>
            <a
              href="#ver-demo"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-primary text-primary" />
              Ver Demo
            </a>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary text-primary hover:bg-primary/10"
              onClick={() => setLocation("/login")}
              data-testid="button-login"
            >
              Iniciar Sesión
            </Button>
            <a
              href={WA_SALES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-primary hover:bg-primary/90 text-white rounded-full px-6 h-10 text-sm font-medium"
            >
              Empieza Gratis
            </a>
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden p-2 text-foreground" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-24 left-0 w-full bg-white border-b border-gray-100 p-4 flex flex-col gap-4 animate-in slide-in-from-top-5">
            <a href="#como-funciona" className="text-base font-medium py-2" onClick={() => setIsMenuOpen(false)}>¿Cómo funciona?</a>
            <a href="#delivery" className="text-base font-medium py-2" onClick={() => setIsMenuOpen(false)}>Soy Delivery</a>
            <a href="#ver-demo" className="flex items-center gap-2 text-base font-medium text-primary py-2" onClick={() => setIsMenuOpen(false)}>
              <Play className="w-4 h-4 fill-primary text-primary" />
              Ver Demo
            </a>
            <Button
              variant="outline"
              className="w-full rounded-full border-primary text-primary"
              onClick={() => { setIsMenuOpen(false); setLocation("/login"); }}
            >
              Iniciar Sesión
            </Button>
            <a
              href={WA_SALES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-primary text-white w-full rounded-full h-10 text-sm font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Empieza Gratis
            </a>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-20 md:pt-24 md:pb-32 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 md:pr-8 animate-in slide-in-from-left-10 duration-700">
              <Badge variant="secondary" className="px-4 py-2 text-primary bg-green-50 rounded-full font-medium border-green-100 mb-2">
                🎁 3 meses gratis · Pagas solo si vendes
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-extrabold leading-tight text-brand-dark">
                La forma más fácil<br />de vender por<br />
                <span className="text-primary">WhatsApp</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl">
                Tus clientes piden desde su celular, la IA los atiende, y tú ves cada pedido llegar a tu panel — mientras sigues con tu día.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <a
                  href={WA_SALES}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center bg-primary hover:bg-primary/90 text-white h-14 px-8 rounded-full text-lg shadow-lg shadow-green-200 transition-all hover:-translate-y-1 font-semibold"
                >
                  <Smartphone className="mr-2 h-5 w-5" />
                  Empieza gratis — sin tarjeta
                </a>
                <a
                  href="#como-funciona"
                  className="inline-flex items-center justify-center h-14 px-8 rounded-full text-lg border-2 border-gray-200 hover:bg-gray-50 text-foreground font-medium transition-colors"
                >
                  Ver cómo funciona
                </a>
              </div>

              <div className="pt-6 flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <p>+500 negocios ya venden con DelyWa en RD</p>
              </div>
            </div>

            <div className="relative animate-in slide-in-from-right-10 duration-700 delay-200">
              <div className="absolute inset-0 bg-gradient-to-tr from-green-100 to-blue-50 rounded-full opacity-60 blur-3xl transform scale-90 translate-y-10"></div>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <img
                  src={heroImage}
                  alt="Delivery en motor RD"
                  className="w-full h-auto object-cover md:h-[600px]"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-8">
                  <div className="bg-white/95 backdrop-blur p-4 rounded-xl shadow-lg max-w-xs mx-auto transform translate-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-800">Pedido en camino 🛵</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">3 min</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-primary w-3/4 h-full rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ──────────────────────────────────────────────────── */}
      <section id="como-funciona" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4 text-brand-dark">
              Así de fácil funciona
            </h2>
            <p className="text-muted-foreground text-lg">
              Sin instalar apps, sin APIs, sin técnicos. Solo comparte el link y empieza a vender.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: Link2,
                title: "Comparte tu link de pedidos",
                desc: "Cada negocio tiene un link único (ej. delywa.com/pedir/tu-colmado). Lo pones en tu historia de WhatsApp o lo mandas a tus clientes — ellos abren el chat desde el celular, sin descargar nada.",
                color: "bg-blue-100 text-blue-600",
              },
              {
                step: "2",
                icon: MessageCircle,
                title: "La IA toma el pedido",
                desc: "El cliente escribe lo que quiere en texto libre, igual que en WhatsApp. La IA entiende el dominicano, confirma los productos, pregunta la dirección y recoge el método de pago — todo automático.",
                color: "bg-green-100 text-green-600",
              },
              {
                step: "3",
                icon: TrendingUp,
                title: "Tú vendes, DelyWa trabaja",
                desc: "El pedido aparece en tu panel al instante. Asignas un delivery con un toque y el cliente ve su moto en tiempo real hasta que llega. Tú cuadras la caja al final del día sin sumar papelitos.",
                color: "bg-orange-100 text-orange-600",
              },
            ].map((s, i) => (
              <Card key={i} className="border-none shadow-md hover:shadow-xl transition-shadow duration-300 relative overflow-hidden">
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                  {s.step}
                </div>
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${s.color}`}>
                    <s.icon size={32} />
                  </div>
                  <h3 className="text-xl font-bold mb-3 font-heading">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── App Interface Preview ──────────────────────────────────────────── */}
      <section className="py-24 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="w-full md:w-1/2 flex justify-center relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-[100px] transform scale-150"></div>
              <img
                src={phoneImage}
                alt="Chat web de pedidos DelyWa"
                className="relative z-10 w-full max-w-md drop-shadow-2xl animate-in fade-in zoom-in duration-1000"
              />
            </div>
            <div className="w-full md:w-1/2 space-y-8">
              <h2 className="text-3xl md:text-5xl font-heading font-bold text-brand-dark leading-tight">
                Una IA que entiende el "Dominicano"
              </h2>
              <div className="space-y-6">
                {[
                  { title: "Entiende jerga local", desc: "Sabe lo que es una 'fría', un 'pica pollo' y una 'recarga de claro'." },
                  { title: "Recoge dirección y pago", desc: "Pregunta la dirección, el método de pago y calcula la devuelta exacta sin que tú hagas nada." },
                  { title: "Tracking en tiempo real", desc: "Cuando el delivery sale, el cliente ve la moto moverse hasta su puerta. Cero llamadas de '¿dónde está mi pedido?'." },
                ].map((feat, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="mt-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={14} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg text-brand-dark">{feat.title}</h4>
                      <p className="text-muted-foreground">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <a
                href={WA_SALES}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center mt-4 bg-brand-dark hover:bg-brand-dark/90 text-white rounded-full px-8 h-12 font-semibold"
              >
                Quiero mi link gratis <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tu WhatsApp, sin cambiar nada ──────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12 max-w-3xl mx-auto">
            <Badge variant="secondary" className="px-4 py-2 text-green-700 bg-green-50 rounded-full font-medium border-green-100 mb-4">
              📲 Sin configuraciones complicadas
            </Badge>
            <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4 text-brand-dark">
              Usa tu WhatsApp — nosotros nos encargamos del resto
            </h2>
            <p className="text-muted-foreground text-lg">
              No necesitas configurar APIs, contratar técnicos ni tocar nada de tu WhatsApp actual.
              Solo comparte el link de tu colmado y nosotros atendemos a tus clientes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                emoji: "🔗",
                title: "Tu link único",
                desc: "Te damos un link personalizado para tu negocio. Lo compartes como quieras — Instagram, WhatsApp, cartel en la tienda.",
                color: "bg-blue-50 border-blue-100",
              },
              {
                emoji: "📲",
                title: "Tus clientes piden desde el celular",
                desc: "Entran al link, chatean con la IA como si fuera WhatsApp y hacen su pedido en menos de 2 minutos. Sin apps, sin registros.",
                color: "bg-green-50 border-green-100",
              },
              {
                emoji: "⚡",
                title: "Sin instalaciones",
                desc: "Todo funciona desde el navegador. Tú ves los pedidos en tu panel, tu delivery recibe la ruta en su celular. Punto.",
                color: "bg-orange-50 border-orange-100",
              },
            ].map((item, i) => (
              <div key={i} className={`rounded-2xl border p-8 text-center ${item.color}`}>
                <div className="text-5xl mb-5">{item.emoji}</div>
                <h3 className="text-xl font-bold mb-3 text-brand-dark font-heading">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para colmados y deliveries ─────────────────────────────────────── */}
      <section id="delivery" className="py-24 bg-brand-dark text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2"></div>

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="outline" className="text-primary border-primary mb-4 px-4 py-1">Plataforma Todo-en-Uno</Badge>
            <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">Todo incluido desde el primer día</h2>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto">
              Panel de ventas, gestión de deliveries y cuadre de caja — sin costos extra.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm text-white hover:bg-white/10 transition-colors">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-6">
                  <TrendingUp className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">Ventas Diarias</h3>
                <p className="text-gray-400">
                  Reportes automáticos de cuánto vendiste hoy. Sin sumar papelitos, todo digitalizado.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm text-white hover:bg-white/10 transition-colors">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-6">
                  <Truck className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">Gestión de Delivery</h3>
                <p className="text-gray-400">
                  Agrega deliveries por número de teléfono. Asígnales rutas con un toque desde tu panel.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm text-white hover:bg-white/10 transition-colors">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-6">
                  <ShieldCheck className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">Cuadre de Caja</h3>
                <p className="text-gray-400">
                  Conciliación automática de pedidos entregados vs cancelados. El dinero nunca falta.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── 3 meses gratis / Pagas si vendes ──────────────────────────────── */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <Badge variant="secondary" className="px-4 py-2 text-primary bg-green-50 rounded-full font-medium border-green-100 mb-4">
              💰 Sin mensualidades
            </Badge>
            <h2 className="text-3xl md:text-5xl font-heading font-bold mb-4 text-brand-dark">
              Empieza gratis.<br />Crece sin riesgo.
            </h2>
            <p className="text-muted-foreground text-lg">
              No hay cuota fija. Solo pagas una pequeña comisión de lo que vendas — y los primeros 3 meses son completamente gratis.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-14">
            {[
              {
                icon: Gift,
                title: "3 meses gratis",
                desc: "Úsalo sin límite durante los primeros 3 meses. Sin tarjeta, sin contrato, sin letra pequeña.",
                highlight: true,
              },
              {
                icon: Zap,
                title: "Pagas solo si vendes",
                desc: "Después del período gratis, solo pagamos una comisión sobre lo que realmente vendiste. Cero pedidos = cero costo.",
                highlight: false,
              },
              {
                icon: CheckCircle2,
                title: "Sin mensualidades fijas",
                desc: "Olvídate de pagar una cuota aunque el mes estuvo flojo. Tu costo crece solo cuando tu negocio crece.",
                highlight: false,
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 text-center border transition-shadow hover:shadow-lg ${
                  item.highlight
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto ${item.highlight ? "bg-primary text-white" : "bg-gray-100 text-gray-600"}`}>
                  <item.icon size={28} />
                </div>
                <h3 className="text-xl font-bold mb-3 font-heading text-brand-dark">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <a
              href={WA_SALES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-primary hover:bg-primary/90 text-white h-16 px-12 rounded-full text-xl font-bold shadow-lg shadow-green-200 transition-all hover:-translate-y-1"
            >
              <Smartphone className="mr-3 h-6 w-6" />
              Registra tu negocio — Es gratis
            </a>
            <p className="mt-4 text-sm text-muted-foreground">Sin tarjeta de crédito · Sin contrato · Cancela cuando quieras</p>
          </div>
        </div>
      </section>

      {/* ── Ver Demo ───────────────────────────────────────────────────────── */}
      <section id="ver-demo" className="py-24 bg-green-50 border-t border-green-100">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <Badge className="bg-green-100 text-primary border-green-200 px-4 py-2 rounded-full font-medium mb-4 text-sm">
              🎬 Cuenta de Demostración
            </Badge>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-brand-dark mb-4">
              Explora DelyWa sin registrarte
            </h2>
            <p className="text-muted-foreground text-lg">
              Entra al panel de <strong>La Elegancia Colmado</strong> con datos reales de ejemplo — pedidos, deliveries, reportes y configuración lista para explorar.
            </p>
          </div>

          <div className="max-w-xl mx-auto">
            {/* Demo card */}
            <div className="bg-white rounded-3xl border-2 border-green-200 shadow-xl overflow-hidden">
              {/* Header with logo */}
              <div className="bg-gradient-to-r from-primary to-green-500 p-6 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center shrink-0">
                  <img src="/logo-elegancia-demo.png" alt="La Elegancia" className="w-full h-full object-contain" />
                </div>
                <div className="text-white">
                  <p className="font-bold text-xl font-heading">La Elegancia Colmado</p>
                  <p className="text-green-100 text-sm">Cuenta de demostración · Datos de ejemplo</p>
                </div>
                <div className="ml-auto">
                  <span className="bg-white/20 border border-white/40 text-white text-xs font-medium px-3 py-1 rounded-full">DEMO</span>
                </div>
              </div>

              {/* Credentials */}
              <div className="p-8 space-y-4">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Credenciales de acceso</p>

                {/* Email */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-0.5">Usuario</p>
                    <p className="font-mono font-semibold text-gray-800">demo@gmail.com</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard("demo@gmail.com", "email")}
                    className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-green-50"
                    title="Copiar"
                  >
                    {copiedField === "email" ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-0.5">Contraseña</p>
                    <p className="font-mono font-semibold text-gray-800 tracking-widest">123</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard("123", "password")}
                    className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-green-50"
                    title="Copiar"
                  >
                    {copiedField === "password" ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* What's included */}
                <div className="pt-2 space-y-2">
                  {[
                    "14 pedidos con distintos estados (entregado, pendiente, en camino…)",
                    "2 repartidores configurados con historial de entregas",
                    "19 productos en el catálogo del colmado",
                    "6 clientes registrados con historial de compras",
                    "Reportes de ventas por período",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setLocation("/login")}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl text-lg transition-colors shadow-md shadow-green-200"
                >
                  <Eye className="w-5 h-5" />
                  Entrar al Demo
                </button>

                <p className="text-center text-xs text-gray-400">
                  No necesitas tarjeta · Explora libremente
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Final ──────────────────────────────────────────────────────── */}
      <section className="py-24 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-heading font-extrabold text-white mb-6 tracking-tight">
            Empieza hoy gratis.<br />Sin mensualidades. Sin riesgo.
          </h2>
          <p className="text-green-50 text-xl mb-10 max-w-2xl mx-auto">
            Únete a DelyWa y convierte tu WhatsApp en una máquina de ventas — los primeros 3 meses son completamente gratis.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={WA_SALES}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-white text-primary hover:bg-gray-100 text-lg h-14 px-8 rounded-full font-bold shadow-xl"
            >
              <Smartphone className="mr-2 h-5 w-5" />
              Registrar mi Negocio Gratis
            </a>
            <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 text-lg h-14 px-8 rounded-full font-bold">
              Hablar con Ventas
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-white py-12 border-t border-gray-100">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/delywa-logo.png" alt="DelyWa" className="h-10 w-auto" />
            </div>
            <div className="flex gap-8 text-sm text-gray-500">
              <a href="#como-funciona" className="hover:text-primary">Cómo funciona</a>
              <a href="/terms" className="hover:text-primary">Términos</a>
              <a href="/privacy" className="hover:text-primary">Privacidad</a>
              <a href="/contact" className="hover:text-primary">Contacto</a>
            </div>
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} DelyWa. Hecho con ❤️ en RD.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
