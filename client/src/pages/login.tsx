import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [primerAcceso, setPrimerAcceso] = useState(false);

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
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({ title: "Bienvenido", description: `Iniciaste sesión como ${data.role}` });
        window.location.href = "/admin";
      } else {
        toast({ title: "Error", description: data.error || "Credenciales incorrectas", variant: "destructive" });
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
                className="w-full bg-[#25D366] hover:bg-[#25D366]/90"
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
            <Button 
              type="submit" 
              className="w-full bg-[#25D366] hover:bg-[#25D366]/90"
              disabled={isLoading}
              data-testid="button-submit-login"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Iniciar Sesión
            </Button>
          </form>

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
