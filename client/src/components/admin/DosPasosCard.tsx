import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Plataforma → Seguridad: verificación en dos pasos de la cuenta de plataforma (app de códigos).

type Estado = { disponible: boolean; activo: boolean; activoDesde: string | null; respaldosRestantes: number };

async function pedir<T>(url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: cuerpo === undefined ? "GET" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo completar.");
  return j as T;
}

export function DosPasosCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: estado } = useQuery<Estado>({ queryKey: ["dos-pasos"], queryFn: () => pedir<Estado>("/api/auth/dos-pasos") });
  const [nuevo, setNuevo] = useState<{ secreto: string; enlace: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [respaldos, setRespaldos] = useState<string[] | null>(null);
  const [apagando, setApagando] = useState(false);
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const correr = async (fn: () => Promise<void>) => {
    setOcupado(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo."); }
    setOcupado(false);
  };

  if (!estado?.disponible) return null;

  return (
    <Card data-testid="card-dos-pasos">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {estado.activo ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <ShieldAlert className="w-5 h-5 text-amber-600" />}
          Verificación en dos pasos
        </CardTitle>
        <p className="text-sm text-gray-500">Además de la contraseña, para entrar a la cuenta de plataforma se pide un código de 6 números de una app en tu teléfono (Google Authenticator, Microsoft Authenticator u otra).</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {respaldos ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="codigos-respaldo">
            <p className="font-semibold text-amber-950">Guarda estos códigos de respaldo ahora</p>
            <p className="text-sm text-amber-900 mt-1">Cada uno sirve una sola vez si pierdes el teléfono. No se vuelven a mostrar. Guárdalos en tu gestor de contraseñas o imprímelos.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[15px]">{respaldos.map((r) => <span key={r} className="rounded bg-white border px-2 py-1 text-center">{r}</span>)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(respaldos.join("\n")); toast({ title: "Códigos copiados" }); }}><Copy className="w-4 h-4 mr-2" />Copiar códigos</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setRespaldos(null)}>Ya los guardé</Button>
            </div>
          </div>
        ) : estado.activo ? (
          <>
            <p className="text-sm text-emerald-800">Activa{estado.activoDesde ? ` desde el ${new Date(estado.activoDesde).toLocaleDateString("es-DO", { dateStyle: "long" })}` : ""}. Te quedan {estado.respaldosRestantes} códigos de respaldo.</p>
            {!apagando ? (
              <Button variant="outline" onClick={() => setApagando(true)}>Apagar la verificación en dos pasos</Button>
            ) : (
              <form className="space-y-3 max-w-sm" onSubmit={(e) => { e.preventDefault(); correr(async () => {
                await pedir("/api/auth/dos-pasos/desactivar", { password: clave, codigo });
                setApagando(false); setClave(""); setCodigo("");
                await qc.invalidateQueries({ queryKey: ["dos-pasos"] });
                toast({ title: "Verificación en dos pasos apagada" });
              }); }}>
                <div className="space-y-1"><Label htmlFor="dp-clave">Tu contraseña</Label><Input id="dp-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required /></div>
                <div className="space-y-1"><Label htmlFor="dp-codigo-off">Código de la app (o uno de respaldo)</Label><Input id="dp-codigo-off" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} required /></div>
                <div className="flex gap-2"><Button type="submit" variant="destructive" disabled={ocupado}>Apagar</Button><Button type="button" variant="ghost" onClick={() => setApagando(false)}>Cancelar</Button></div>
              </form>
            )}
          </>
        ) : !nuevo ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={ocupado} data-testid="button-activar-dos-pasos"
            onClick={() => correr(async () => setNuevo(await pedir("/api/auth/dos-pasos/iniciar", {})))}>
            {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Activar
          </Button>
        ) : (
          <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] items-start">
            <div className="rounded-xl border bg-white p-3 w-fit" aria-label="Código QR para la app de verificación"><QRCodeSVG value={nuevo.enlace} size={180} /></div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); correr(async () => {
              const r = await pedir<{ codigosRespaldo: string[] }>("/api/auth/dos-pasos/activar", { codigo });
              setRespaldos(r.codigosRespaldo); setNuevo(null); setCodigo("");
              await qc.invalidateQueries({ queryKey: ["dos-pasos"] });
            }); }}>
              <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
                <li>Abre tu app de verificación y toca «Agregar» o «+».</li>
                <li>Escanea este código QR. Si no puedes, escribe esta clave: <span className="font-mono break-all bg-gray-100 px-1 rounded">{nuevo.secreto}</span></li>
                <li>Escribe aquí el código de 6 números que te sale.</li>
              </ol>
              <div className="space-y-1 max-w-xs"><Label htmlFor="dp-codigo">Código de la app</Label>
                <Input id="dp-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} required data-testid="input-codigo-activar" className="text-center text-lg tracking-[0.3em]" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={ocupado || codigo.length !== 6}>Confirmar y activar</Button>
                <Button type="button" variant="ghost" onClick={() => { setNuevo(null); setCodigo(""); }}>Cancelar</Button>
              </div>
            </form>
          </div>
        )}
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
