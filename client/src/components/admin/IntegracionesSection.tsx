import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Brain, Check, Copy, Loader2, MessageSquare, Save, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TurnstileWidget } from "@/components/TurnstileWidget";

// Plataforma → Integraciones: llaves de OpenAI, Meta (WhatsApp) y Cloudflare Turnstile.
// Los secretos se guardan cifrados y nunca vuelven completos al navegador.

type Campo = {
  campo: string;
  etiqueta: string;
  secreto: boolean;
  configurado: boolean;
  origen: "panel" | "cloudflare" | null;
  vista: string | null;
  ilegible: boolean;
};

type Estado = {
  claveMaestra: boolean;
  campos: Campo[];
  meta: { webhookUrl: string; verifyToken: string | null; eliminacionDatosUrl: string };
  turnstile: { activo: boolean; siteKey: string | null };
  negociosConLlavePropia: number;
};

type Prueba = { ok: boolean; mensaje: string };

const URL_API = "/api/admin/integraciones";

/** Pide al servidor y devuelve el JSON, o lanza el mensaje de error que mandó. */
export async function pedirJSON<T>(metodo: string, url: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    credentials: "include",
    headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : {},
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
  return data as T;
}

const GRUPOS: Array<{ titulo: string; descripcion: string; icono: typeof Brain; campos: string[]; prueba?: string }> = [
  {
    titulo: "Inteligencia artificial (OpenAI)",
    descripcion: "La usan el bot de WhatsApp, el chat web y los generadores de menú. Cada respuesta consume saldo de la cuenta de OpenAI. Un negocio puede tener su propia llave (se pone en la ficha del negocio).",
    icono: Brain,
    campos: ["openai_api_key", "ai_gateway_url"],
    prueba: "probar-openai",
  },
  {
    titulo: "WhatsApp oficial (Meta)",
    descripcion: "Datos de la app de Meta for Developers. Con ellos cada negocio conecta su número desde el botón «Conectar con Facebook».",
    icono: MessageSquare,
    campos: ["meta_app_id", "meta_app_secret", "meta_config_id", "whatsapp_verify_token", "whatsapp_access_token", "meta_graph_version"],
    prueba: "probar-meta",
  },
  {
    titulo: "Protección del login (Cloudflare Turnstile)",
    descripcion: "Pide una verificación «¿eres una persona?» al iniciar sesión. Solo se activa después de una prueba exitosa, para que nadie quede fuera por un error en las claves.",
    icono: ShieldCheck,
    campos: ["turnstile_site_key", "turnstile_secret_key"],
  },
];

const AYUDA: Record<string, string> = {
  openai_api_key: "Empieza con sk-. Se crea en platform.openai.com → API keys.",
  ai_gateway_url: "Opcional. Si la pones, las llamadas pasan por tu AI Gateway de Cloudflare (registro de costos y límites).",
  meta_app_id: "Meta for Developers → tu app → Configuración de la app → Básica → Identificador de la app.",
  meta_app_secret: "En la misma pantalla: Clave secreta de la app → Mostrar.",
  meta_config_id: "WhatsApp → Registro integrado (Embedded Signup) → Configuración → ID de configuración.",
  whatsapp_verify_token: "Ya se creó uno al azar. Solo cámbialo si Meta ya tiene otro.",
  whatsapp_access_token: "Opcional. Solo para negocios que no conectaron su propio número.",
  meta_graph_version: "Opcional. Si lo dejas vacío se usa v24.0.",
  turnstile_site_key: "Cloudflare → Turnstile → tu widget → Clave del sitio.",
  turnstile_secret_key: "En el mismo widget → Clave secreta.",
};

function Copiable({ etiqueta, valor, testId }: { etiqueta: string; valor: string | null; testId: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{etiqueta}</Label>
      <div className="flex gap-2">
        <Input readOnly value={valor ?? "—"} className="font-mono text-xs" data-testid={testId} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!valor}
          onClick={() => valor && navigator.clipboard?.writeText(valor).then(() => toast({ title: "Copiado" }))}
          aria-label={`Copiar ${etiqueta}`}
        >
          <Copy className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function IntegracionesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [resultados, setResultados] = useState<Record<string, Prueba>>({});
  const [tokenTurnstile, setTokenTurnstile] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);

  const { data, isLoading, error } = useQuery<Estado>({ queryKey: [URL_API], queryFn: () => pedirJSON<Estado>("GET", URL_API) });

  const guardar = useMutation({
    mutationFn: (valores: Record<string, string | null>) => pedirJSON<Estado>("PUT", URL_API, { valores }),
    onSuccess: (estado, valores) => {
      queryClient.setQueryData([URL_API], estado);
      setBorradores((b) => {
        const copia = { ...b };
        for (const k of Object.keys(valores)) delete copia[k];
        return copia;
      });
      toast({ title: "Guardado" });
    },
    onError: (e: Error) => toast({ title: "No se guardó", description: e.message, variant: "destructive" }),
  });

  const probar = useMutation({
    mutationFn: ({ ruta, cuerpo }: { ruta: string; cuerpo?: unknown }) => pedirJSON<Prueba>("POST", `${URL_API}/${ruta}`, cuerpo ?? {}),
    onSuccess: (r, { ruta }) => {
      setResultados((x) => ({ ...x, [ruta]: r }));
      if (ruta === "probar-turnstile") {
        setReinicio((n) => n + 1);
        queryClient.invalidateQueries({ queryKey: [URL_API] });
      }
    },
    onError: (e: Error, { ruta }) => setResultados((x) => ({ ...x, [ruta]: { ok: false, mensaje: e.message } })),
  });

  const desactivarTurnstile = useMutation({
    mutationFn: () => pedirJSON("POST", `${URL_API}/desactivar-turnstile`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [URL_API] }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>;
  if (error || !data) return <p className="text-red-600">No se pudieron cargar las integraciones.</p>;

  const porNombre = Object.fromEntries(data.campos.map((c) => [c.campo, c]));

  const guardarGrupo = (campos: string[]) => {
    const valores: Record<string, string> = {};
    for (const c of campos) if (borradores[c] !== undefined && borradores[c].trim() !== "") valores[c] = borradores[c].trim();
    if (Object.keys(valores).length === 0) {
      toast({ title: "Nada que guardar", description: "Escribe un valor nuevo en algún campo." });
      return;
    }
    guardar.mutate(valores);
  };

  return (
    <div className="space-y-6" data-testid="section-integraciones">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Integraciones</h2>
        <p className="text-gray-500 text-sm">Llaves de los servicios externos. Lo que guardes aquí tiene prioridad sobre los secretos cargados en Cloudflare.</p>
      </div>

      {!data.claveMaestra && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex gap-2" data-testid="aviso-clave-maestra">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Falta la clave maestra del servidor, así que todavía no se pueden guardar llaves secretas. Vuelve a ejecutar <b>instalar-delywa.bat</b>: la crea sola.</span>
        </div>
      )}

      {GRUPOS.map((grupo) => {
        const Icono = grupo.icono;
        const resultado = grupo.prueba ? resultados[grupo.prueba] : undefined;
        return (
          <Card key={grupo.titulo}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Icono className="w-5 h-5 text-emerald-600" />{grupo.titulo}</CardTitle>
              <p className="text-sm text-gray-500">{grupo.descripcion}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {grupo.campos.map((nombre) => {
                const campo = porNombre[nombre];
                if (!campo) return null;
                return (
                  <div key={nombre} className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label htmlFor={`int-${nombre}`}>{campo.etiqueta}</Label>
                      {campo.ilegible ? (
                        <Badge variant="destructive">Hay que escribirla de nuevo</Badge>
                      ) : campo.configurado ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          {campo.origen === "panel" ? "Guardada aquí" : "Desde Cloudflare"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Sin configurar</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id={`int-${nombre}`}
                        type={campo.secreto ? "password" : "text"}
                        autoComplete="off"
                        placeholder={campo.vista ?? ""}
                        value={borradores[nombre] ?? ""}
                        onChange={(e) => setBorradores((b) => ({ ...b, [nombre]: e.target.value }))}
                        data-testid={`input-integracion-${nombre}`}
                      />
                      {campo.origen === "panel" && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`¿Quitar «${campo.etiqueta}» del panel?${campo.secreto ? " Si hay un secreto en Cloudflare con el mismo nombre, se usará ese." : ""}`)) {
                              guardar.mutate({ [nombre]: null });
                            }
                          }}
                          data-testid={`button-quitar-${nombre}`}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                    {AYUDA[nombre] && <p className="text-xs text-gray-400">{AYUDA[nombre]}</p>}
                  </div>
                );
              })}

              {grupo.titulo.startsWith("WhatsApp") && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-3 border">
                  <p className="text-sm font-medium">Datos para pegar en Meta (WhatsApp → Configuración → Webhook):</p>
                  <Copiable etiqueta="URL de devolución de llamada" valor={data.meta.webhookUrl} testId="text-webhook-url" />
                  <Copiable etiqueta="Token de verificación" valor={data.meta.verifyToken} testId="text-verify-token" />
                  <Copiable etiqueta="URL de eliminación de datos (Configuración básica)" valor={data.meta.eliminacionDatosUrl} testId="text-data-deletion-url" />
                  <p className="text-xs text-gray-500">En Meta, después de verificar, suscribe el campo <b>messages</b>.</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <Button onClick={() => guardarGrupo(grupo.campos)} disabled={guardar.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  {guardar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}Guardar
                </Button>
                {grupo.prueba && (
                  <Button variant="outline" onClick={() => probar.mutate({ ruta: grupo.prueba! })} disabled={probar.isPending} data-testid={`button-${grupo.prueba}`}>
                    Probar conexión
                  </Button>
                )}
              </div>
              {resultado && (
                <p className={`text-sm flex items-center gap-1 ${resultado.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {resultado.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{resultado.mensaje}
                </p>
              )}

              {grupo.titulo.startsWith("Protección") && (
                <div className="border-t pt-4 space-y-3">
                  {data.turnstile.activo ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className="bg-emerald-600">Activo en el login</Badge>
                      <Button variant="outline" size="sm" onClick={() => desactivarTurnstile.mutate()} disabled={desactivarTurnstile.isPending}>
                        Desactivar
                      </Button>
                    </div>
                  ) : data.turnstile.siteKey && porNombre.turnstile_secret_key?.configurado ? (
                    <>
                      <p className="text-sm">Completa la verificación de abajo y pulsa <b>Probar y activar</b>.</p>
                      <TurnstileWidget siteKey={data.turnstile.siteKey} onToken={setTokenTurnstile} reinicio={reinicio} />
                      <Button
                        onClick={() => probar.mutate({ ruta: "probar-turnstile", cuerpo: { token: tokenTurnstile } })}
                        disabled={!tokenTurnstile || probar.isPending}
                        data-testid="button-probar-turnstile"
                      >
                        Probar y activar
                      </Button>
                      {resultados["probar-turnstile"] && (
                        <p className={`text-sm ${resultados["probar-turnstile"].ok ? "text-emerald-700" : "text-red-600"}`}>{resultados["probar-turnstile"].mensaje}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Guarda las dos claves para poder probarlo.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {data.negociosConLlavePropia > 0 && (
        <p className="text-sm text-gray-500">{data.negociosConLlavePropia} negocio(s) usan su propia llave de OpenAI.</p>
      )}
    </div>
  );
}

type EstadoIA = { llavePropia: boolean; vista: string | null; ilegible: boolean; usaLlaveDePlataforma: boolean };

/** Ficha del negocio: llave de OpenAI propia (opcional). */
export function LlaveIANegocio({ colmadoId }: { colmadoId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/admin/colmados/${colmadoId}/ia`;
  const [valor, setValor] = useState("");
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const { data } = useQuery<EstadoIA>({ queryKey: [url], queryFn: () => pedirJSON<EstadoIA>("GET", url) });

  const guardar = useMutation({
    mutationFn: (openaiApiKey: string | null) => pedirJSON<EstadoIA>("PUT", url, { openaiApiKey }),
    onSuccess: (estado) => { queryClient.setQueryData([url], estado); setValor(""); setPrueba(null); toast({ title: "Guardado" }); },
    onError: (e: Error) => toast({ title: "No se guardó", description: e.message, variant: "destructive" }),
  });
  const probar = useMutation({
    mutationFn: () => pedirJSON<Prueba>("POST", `${url}/probar`),
    onSuccess: setPrueba,
    onError: (e: Error) => setPrueba({ ok: false, mensaje: e.message }),
  });

  return (
    <Card data-testid="card-llave-ia-negocio">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Brain className="w-5 h-5 text-emerald-600" />Inteligencia artificial</CardTitle>
        <p className="text-sm text-gray-500">
          {data?.llavePropia
            ? `Este negocio usa su propia llave de OpenAI (${data.vista}); el consumo se cobra a esa cuenta.`
            : data?.usaLlaveDePlataforma
              ? "Este negocio usa la llave de OpenAI de la plataforma. Si le pones una propia, el consumo se cobra a su cuenta."
              : "No hay llave de OpenAI: ni la de la plataforma (Integraciones) ni una propia. El bot no podrá responder."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.ilegible && <Badge variant="destructive">La llave guardada no se puede leer: escríbela de nuevo</Badge>}
        <div className="flex gap-2">
          <Input type="password" autoComplete="off" placeholder={data?.vista ?? "sk-..."} value={valor} onChange={(e) => setValor(e.target.value)} data-testid="input-llave-ia-negocio" />
          <Button onClick={() => valor.trim() && guardar.mutate(valor.trim())} disabled={!valor.trim() || guardar.isPending} className="bg-emerald-600 hover:bg-emerald-700">Guardar</Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => probar.mutate()} disabled={probar.isPending}>Probar conexión</Button>
          {data?.llavePropia && (
            <Button variant="outline" size="sm" onClick={() => window.confirm("¿Quitar la llave propia? El negocio pasará a usar la de la plataforma.") && guardar.mutate(null)}>
              Quitar llave propia
            </Button>
          )}
        </div>
        {prueba && <p className={`text-sm ${prueba.ok ? "text-emerald-700" : "text-red-600"}`}>{prueba.mensaje}</p>}
      </CardContent>
    </Card>
  );
}
