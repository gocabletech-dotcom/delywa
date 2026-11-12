import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/TurnstileWidget";

// Formulario "Crear mi negocio" de la página principal.
// El negocio queda en revisión hasta que la plataforma lo activa.

type Opciones = {
  paises: Array<{ id: number; codigo: string; nombre: string; bandera: string | null; prefijoCelular: string }>;
  tipos: Array<{ slug: string; nombre: string }>;
  turnstileSiteKey: string | null;
};

const VACIO = { paisId: "", tipoNegocio: "colmado", nombreNegocio: "", nombre: "", telefono: "", direccion: "", correo: "", password: "" };

export function RegistroNegocioForm() {
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [datos, setDatos] = useState(VACIO);
  const [acepta, setAcepta] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    fetch("/api/registro-negocio/opciones", { credentials: "include" })
      .then((r) => r.json())
      .then((o: Opciones) => {
        setOpciones(o);
        const rd = o.paises.find((p) => p.codigo === "DO") ?? o.paises[0];
        setDatos((d) => ({ ...d, paisId: rd ? String(rd.id) : "", tipoNegocio: o.tipos[0]?.slug ?? "colmado" }));
      })
      .catch(() => setError("No se pudo cargar el formulario. Recarga la página."));
  }, []);

  const cambiar = (campo: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const pais = opciones?.paises.find((p) => String(p.id) === datos.paisId);
  const faltaVerificacion = Boolean(opciones?.turnstileSiteKey && !token);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (datos.password.length < 10) return setError("La contraseña debe tener al menos 10 caracteres.");
    if (!acepta) return setError("Debes aceptar los términos, la política de privacidad y el acuerdo de tratamiento de datos.");
    setEnviando(true);
    try {
      const r = await fetch("/api/registro-negocio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, paisId: Number(datos.paisId), aceptaTerminos: acepta, turnstileToken: token ?? undefined }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "No se pudo crear el negocio.");
        if (opciones?.turnstileSiteKey) setReinicio((n) => n + 1);
        return;
      }
      setListo(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (listo) {
    return (
      <div className="text-center space-y-4 py-6" data-testid="registro-listo">
        <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
        <h3 className="text-2xl font-bold text-brand-dark">¡Recibimos tu solicitud!</h3>
        <p className="text-gray-600">Vamos a revisar los datos de tu negocio. Mientras tanto ya puedes entrar a tu panel y preparar tu menú; los pedidos se activan cuando aprobemos tu negocio.</p>
        <Button className="rounded-full px-8" onClick={() => { window.location.href = "/admin"; }}>Ir a mi panel</Button>
      </div>
    );
  }

  const selectClase = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <form onSubmit={enviar} className="space-y-4 text-left" data-testid="form-registro-negocio">
      <div className="space-y-1">
        <Label htmlFor="reg-pais">País del negocio</Label>
        <select id="reg-pais" className={selectClase} value={datos.paisId} onChange={cambiar("paisId")} required data-testid="select-pais">
          {opciones?.paises.map((p) => <option key={p.id} value={p.id}>{p.bandera ? `${p.bandera} ` : ""}{p.nombre}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Tipo de negocio</Label>
        <div className="flex flex-wrap gap-2">
          {(opciones?.tipos ?? [{ slug: "colmado", nombre: "Colmado" }]).map((t) => (
            <button
              type="button"
              key={t.slug}
              onClick={() => setDatos((d) => ({ ...d, tipoNegocio: t.slug }))}
              className={`px-4 py-2 rounded-full border text-sm font-medium ${datos.tipoNegocio === t.slug ? "bg-primary text-white border-primary" : "bg-white text-gray-700"}`}
              data-testid={`tipo-${t.slug}`}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="reg-negocio">Nombre del negocio</Label>
          <Input id="reg-negocio" value={datos.nombreNegocio} onChange={cambiar("nombreNegocio")} maxLength={100} required data-testid="input-nombre-negocio" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-nombre">Tu nombre</Label>
          <Input id="reg-nombre" value={datos.nombre} onChange={cambiar("nombre")} maxLength={80} autoComplete="name" required data-testid="input-nombre" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-direccion">Dirección del negocio</Label>
        <Input id="reg-direccion" value={datos.direccion} onChange={cambiar("direccion")} maxLength={200} placeholder="Calle, número, sector, ciudad" required data-testid="input-direccion" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="reg-telefono">Teléfono (WhatsApp del negocio)</Label>
          <Input id="reg-telefono" type="tel" value={datos.telefono} onChange={cambiar("telefono")} placeholder="809 555 1234" autoComplete="tel" required data-testid="input-telefono" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-correo">Correo</Label>
          <Input id="reg-correo" type="email" value={datos.correo} onChange={(e) => setDatos((d) => ({ ...d, correo: e.target.value.toLowerCase() }))} autoComplete="email" required data-testid="input-correo" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-password">Contraseña (mín. 10)</Label>
        <Input id="reg-password" type="password" value={datos.password} onChange={cambiar("password")} minLength={10} autoComplete="new-password" required data-testid="input-password-registro" />
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input type="checkbox" className="mt-1" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} data-testid="check-acepta" />
        <span>
          Acepto los <a href="/legal#terminos" target="_blank" rel="noopener" className="text-primary underline">Términos y condiciones</a>, la{" "}
          <a href="/legal#privacidad" target="_blank" rel="noopener" className="text-primary underline">Política de privacidad</a> y el{" "}
          <a href="/legal#dpa" target="_blank" rel="noopener" className="text-primary underline">Acuerdo de tratamiento de datos (DPA)</a>.
        </span>
      </label>
      {opciones?.turnstileSiteKey && <TurnstileWidget siteKey={opciones.turnstileSiteKey} onToken={setToken} reinicio={reinicio} />}
      {error && <p className="text-sm text-red-600" data-testid="registro-error">{error}</p>}
      <Button type="submit" className="w-full h-12 rounded-full text-lg font-bold" disabled={enviando || !opciones || faltaVerificacion} data-testid="button-crear-negocio">
        {enviando && <Loader2 className="w-5 h-5 animate-spin mr-2" />}Crear mi negocio
      </Button>
      <p className="text-xs text-center text-gray-400">Revisamos cada negocio antes de activarlo.</p>
    </form>
  );
}
