import { useEffect, useRef } from "react";

// Verificación de Cloudflare Turnstile ("¿eres una persona?").
// Se usa en el login y en la prueba del panel de plataforma.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let cargando: Promise<void> | null = null;

function cargarTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { cargando = null; reject(new Error("No se pudo cargar Turnstile")); };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** Cambiarlo vuelve a mostrar la verificación (por ejemplo, después de un intento fallido). */
  reinicio?: number;
};

export function TurnstileWidget({ siteKey, onToken, reinicio = 0 }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const aviso = useRef(onToken);
  aviso.current = onToken;

  useEffect(() => {
    let id: string | null = null;
    let vivo = true;
    cargarTurnstile()
      .then(() => {
        if (!vivo || !caja.current || !window.turnstile) return;
        id = window.turnstile.render(caja.current, {
          sitekey: siteKey,
          language: "es",
          callback: (token: string) => aviso.current(token),
          "expired-callback": () => aviso.current(null),
          "error-callback": () => aviso.current(null),
        });
      })
      .catch(() => aviso.current(null));
    return () => {
      vivo = false;
      if (id && window.turnstile) window.turnstile.remove(id);
      aviso.current(null);
    };
  }, [siteKey, reinicio]);

  return <div ref={caja} className="flex justify-center min-h-[65px]" data-testid="turnstile-widget" />;
}
