import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TurnstileWidget } from "@/components/TurnstileWidget";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [primerAcceso, setPrimerAcceso] = useState(false);
  // Verificación de Cloudflare Turnstile, solo si la plataforma la activó.
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [reinicioTurnstile, setReinicioTurnstile] = useState(0);

  // «¿Olvidaste tu contraseña?» (solo si la plataforma activó el correo).
  const [recuperarDisponible, setRecuperarDisponible] = useState(false);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [correoRecuperar, setCorreoRecuperar] = useState("");
  const [enviandoRecuperar, setEnviandoRecuperar] = useState(false);
  const [avisoRecuperar, setAvisoRecuperar] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/recuperar").then((r) => r.json()).then((d) => setRecuperarDisponible(Boolean(d.disponible))).catch(() => undefined);
  }, []);
  const pedirRecuperacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoRecuperar(true);
    try {
      const r = await fetch("/api/auth/recuperar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: correoRecuperar }) });
      const d = await r.json().catch(() => ({}));
      setAvisoRecuperar(d.mensaje || d.error || "Intenta de nuevo.");
    } catch {
      setAvisoRecuperar("Error de conexión. Intenta de nuevo.");
    } finally {
      setEnviandoRecuperar(false);
    }
  };

  // La verificación aparece solo cuando el servidor la pide (después de varios intentos fallidos).

  // Mientras la plataforma no tenga administrador, ofrecer crearlo.
  useEffect(() => {
    fetch("/api/auth/setup", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setPrimerAcceso(Boolean(data.disponible)))
      .catch(() => setPrimerAcceso(false));
  }, []);

  // Read reason from URL query param: /login?reason=inactivity
  const reason = new URLSearchParams(window.location.search).get("reason");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileSiteKey && !turnstileToken) {
      toast({ title: "Falta la verificación", description: "Espera a que aparezca la marca verde de verificación.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, turnstileToken: turnstileToken ?? undefined }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({ title: "Bienvenido", description: `Iniciaste sesión como ${data.role}` });
        window.location.href = "/admin";
      } else {
        toast({ title: "Error", description: data.error || "Credenciales incorrectas", variant: "destructive" });
        if (data.turnstile && data.siteKey) setTurnstileSiteKey(data.siteKey);
        // Cada verificación sirve una sola vez: se pide otra para el próximo intento.
        if (turnstileSiteKey) setReinicioTurnstile((n) => n + 1);
      }
    } catch (error) {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="login-card">
        <CardHeader className="text-center">
          <img src="/delywa-logo.png" alt="DelyWa" className="mx-auto h-32 w-auto mb-4 border-2 border-gray-200 rounded-lg p-2" />
          <p className="text-gray-500 text-sm mt-2">La forma más fácil de vender por WhatsApp</p>
        </CardHeader>
        <CardContent>
          {reason === "inactivity" && (
            <div
              className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800"
              data-testid="banner-inactivity-logout"
            >
              Tu sesión se cerró por inactividad mientras el negocio estaba cerrado.
            </div>
          )}

          {primerAcceso && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-900" data-testid="banner-primer-acceso">
              <p className="mb-2">Esta plataforma todavía no tiene administrador.</p>
              <Button
                type="button"
                className="w-full bg-[#17804F] hover:bg-[#17804F]/90"
                onClick={() => setLocation("/primer-acceso")}
                data-testid="button-primer-acceso"
              >
                Crear usuario administrador
              </Button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Correo</Label>
              <Input
                id="username"
                type="text"
                placeholder="tu@correo.com"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            {turnstileSiteKey && (
              <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} reinicio={reinicioTurnstile} />
            )}
            <Button 
              type="submit" 
              className="w-full bg-[#17804F] hover:bg-[#17804F]/90"
              disabled={isLoading || Boolean(turnstileSiteKey && !turnstileToken)}
              data-testid="button-submit-login"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Iniciar Sesión
            </Button>
          </form>

          {recuperarDisponible && (
            <div className="mt-4 text-center text-sm">
              {!mostrarRecuperar ? (
                <button type="button" className="text-[#128C7E] underline" onClick={() => { setMostrarRecuperar(true); setCorreoRecuperar(username); }} data-testid="link-olvide-clave">
                  ¿Olvidaste tu contraseña?
                </button>
              ) : (
                <form onSubmit={pedirRecuperacion} className="space-y-2 text-left border rounded-lg p-3 bg-gray-50" data-testid="form-recuperar">
                  <Label htmlFor="correo-recuperar">Tu correo</Label>
                  <Input id="correo-recuperar" type="email" value={correoRecuperar} onChange={(e) => setCorreoRecuperar(e.target.value.toLowerCase())} required />
                  <Button type="submit" variant="outline" className="w-full" disabled={enviandoRecuperar}>
                    {enviandoRecuperar ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Mandarme un enlace para cambiarla
                  </Button>
                  {avisoRecuperar && <p className="text-sm text-gray-600">{avisoRecuperar}</p>}
                </form>
              )}
            </div>
          )}

          <div className="mt-4 text-center">
            <Button 
              variant="link" 
              className="text-gray-500"
              onClick={() => setLocation("/")}
            >
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
