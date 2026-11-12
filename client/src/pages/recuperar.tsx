import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Página del enlace de «¿Olvidaste tu contraseña?» (delywa.com/recuperar?t=...).
export default function RecuperarPage() {
  const token = new URLSearchParams(window.location.search).get("t") || "";
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave !== repetir) return setError("Las dos contraseñas no son iguales.");
    setEnviando(true);
    try {
      const r = await fetch("/api/auth/recuperar/cambiar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: clave }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error || "No se pudo cambiar.");
      setListo(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/delywa-logo.png" alt="DelyWa" className="mx-auto h-20 w-auto mb-2" />
          <h1 className="text-xl font-bold">Contraseña nueva</h1>
        </CardHeader>
        <CardContent>
          {listo ? (
            <div className="space-y-4 text-center" data-testid="recuperar-listo">
              <p>Listo. Ya puedes entrar con tu contraseña nueva. Por seguridad cerramos todas tus sesiones abiertas.</p>
              <Button className="w-full bg-[#25D366] hover:bg-[#25D366]/90" onClick={() => { window.location.href = "/login"; }}>Iniciar sesión</Button>
            </div>
          ) : !token ? (
            <p className="text-center text-gray-600">Este enlace no es válido. Pide uno nuevo desde «¿Olvidaste tu contraseña?» en la página de inicio de sesión.</p>
          ) : (
            <form onSubmit={cambiar} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="clave">Contraseña nueva (mínimo 10)</Label>
                <Input id="clave" type="password" autoComplete="new-password" minLength={10} value={clave} onChange={(e) => setClave(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="repetir">Escríbela otra vez</Label>
                <Input id="repetir" type="password" autoComplete="new-password" minLength={10} value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
              </div>
              <p className="text-xs text-gray-500">Lo más fácil: una frase corta que solo tú conozcas, por ejemplo «mi gato come mango».</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full bg-[#25D366] hover:bg-[#25D366]/90" disabled={enviando}>
                {enviando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Guardar contraseña nueva
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
