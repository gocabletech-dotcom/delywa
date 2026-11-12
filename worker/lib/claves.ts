// Contraseñas nuevas: mínimo 10 caracteres, que no sean obvias y que no aparezcan en filtraciones conocidas.
// Se consulta Have I Been Pwned por «k-anonimato»: solo salen los 5 primeros caracteres del SHA-1,
// la contraseña nunca sale del servidor. Si el servicio no responde en 3 segundos, no se bloquea a nadie.
// Las contraseñas que ya existen siguen funcionando (esto solo se revisa al crear o cambiar una).

export const CLAVE_MIN = 10;
/** Las pruebas reemplazan esta función para no llamar al servicio real. */
export const filtraciones = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

export async function claveDebil(password: unknown): Promise<string | null> {
  const c = typeof password === "string" ? password : "";
  if (c.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres. Lo más fácil: una frase corta que solo tú conozcas.`;
  if (c.length > 200) return "La contraseña es demasiado larga.";
  if (/^(.)\1+$/.test(c) || /^(0123456789|1234567890|abcdefghij|qwertyuiop|contraseña|contrasena|password|delywa)/i.test(c)) {
    return "Esa contraseña es muy fácil de adivinar. Usa una frase corta que solo tú conozcas.";
  }
  try {
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(c)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await filtraciones.fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const resto = hash.slice(5);
      for (const linea of (await r.text()).split("\n")) {
        const [sufijo, veces] = linea.trim().split(":");
        if (sufijo === resto && Number(veces) > 0) return "Esa contraseña apareció en filtraciones de otras páginas y los ladrones la prueban primero. Escoge otra.";
      }
    }
  } catch {
    // Sin respuesta del servicio: no se bloquea.
  }
  return null;
}
