/** Identificador al azar de este navegador. Sirve para reconocer al cliente que vuelve desde el mismo aparato. */
export function aparato(): string {
  try {
    let a = localStorage.getItem("delywa-aparato") || "";
    if (!/^[0-9a-f]{32}$/.test(a)) {
      a = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("delywa-aparato", a);
    }
    return a;
  } catch { return ""; }
}

/** Encabezado que acompaña las consultas del menú gráfico. */
export const cabeceraAparato = (): Record<string, string> => {
  const a = aparato();
  return a ? { "X-Delywa-Aparato": a } : {};
};
