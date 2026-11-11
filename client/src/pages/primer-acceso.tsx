import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Crea el administrador de la plataforma. Solo funciona una vez, mientras no
// exista ningún administrador, y exige el código de instalación.
export default function PrimerAccesoPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [form, setForm] = useState({ firstName: "", email: "", password: "", confirmar: "", codigo: "" });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setDisponible(Boolean(data.disponible)))
      .catch(() => setDisponible(false));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmar) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: form.firstName,
          email: form.email,
          password: form.password,
          codigo: form.codigo,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Administrador creado", description: "Ya puedes administrar la plataforma" });
        window.location.href = "/admin";
      } else {
        toast({ title: "Error", description: data.error || "No se pudo crear el administrador", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="primer-acceso-card">
        <CardHeader className="text-center">
          <img src="/delywa-logo.png" alt="DelyWa" className="mx-auto h-24 w-auto mb-2 border-2 border-gray-200 rounded-lg p-2" />
          <h1 className="text-xl font-semibold">Primer acceso</h1>
          <p className="text-gray-500 text-sm">Crea la cuenta del administrador de la plataforma</p>
        </CardHeader>
        <CardContent>
          {disponible === null && (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          )}
          {disponible === false && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600" data-testid="text-setup-no-disponible">
                El primer acceso ya no está disponible: la plataforma ya tiene administrador.
              </p>
              <Button className="w-full bg-[#25D366] hover:bg-[#25D366]/90" onClick={() => setLocation("/login")}>
                Ir a iniciar sesión
              </Button>
            </div>
          )}
          {disponible && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" value={form.firstName} onChange={set("firstName")} required data-testid="input-setup-nombre" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" autoComplete="username" value={form.email} onChange={set("email")} required data-testid="input-setup-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña (mínimo 10 caracteres)</Label>
                <Input id="password" type="password" autoComplete="new-password" minLength={10} value={form.password} onChange={set("password")} required data-testid="input-setup-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar">Repite la contraseña</Label>
                <Input id="confirmar" type="password" autoComplete="new-password" minLength={10} value={form.confirmar} onChange={set("confirmar")} required data-testid="input-setup-confirmar" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código de instalación</Label>
                <Input id="codigo" autoComplete="off" value={form.codigo} onChange={set("codigo")} required data-testid="input-setup-codigo" />
              </div>
              <Button type="submit" className="w-full bg-[#25D366] hover:bg-[#25D366]/90" disabled={isLoading} data-testid="button-submit-setup">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Crear administrador
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
