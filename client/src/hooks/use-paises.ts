import { useQuery } from "@tanstack/react-query";

export interface Pais {
  id: number;
  codigo: string;
  nombre: string;
  bandera: string | null;
  prefijoCelular: string;
  moneda: string;
  simboloMoneda: string;
  zonaHoraria: string;
  activo: boolean;
  // Address format metadata
  etiquetaEstado: string | null;
  etiquetaCodigoPostal: string | null;
  requiereCodigoPostal: boolean;
  ejemploDireccion: string | null;
  ejemploCiudad: string | null;
  ejemploEstado: string | null;
  ejemploCodigoPostal: string | null;
}

export function getDisplayPrefix(pais: Pick<Pais, "codigo" | "prefijoCelular">): string {
  if (pais.codigo === "DO") return "+1";
  const p = pais.prefijoCelular.startsWith("+") ? pais.prefijoCelular : `+${pais.prefijoCelular}`;
  return p;
}

export function getPhoneExample(codigoPais: string): string {
  const examples: Record<string, string> = {
    DO: "8091234567",
    US: "2125551234",
    AR: "1151234567",
    MX: "5512345678",
    CO: "3001234567",
    VE: "4121234567",
    PE: "9991234567",
    CL: "912345678",
    EC: "991234567",
    BO: "71234567",
    PY: "981234567",
    UY: "91234567",
    GT: "51234567",
    SV: "71234567",
    HN: "91234567",
    NI: "81234567",
    CR: "81234567",
    PA: "61234567",
    ES: "612345678",
  };
  return examples[codigoPais] || "1234567890";
}

// Returns the Pais whose raw prefijoCelular best matches the start of fullNumber.
// Uses longest-prefix match on raw digits (e.g. "1809" for DO beats "1" for US),
// so DO and US are resolved correctly even though both display as "+1".
export function findPaisForNumber(fullNumber: string, paises: Pais[]): Pais | undefined {
  if (!paises || paises.length === 0) return undefined;
  const digits = (fullNumber || "").replace(/\D/g, "");
  const sorted = [...paises].sort(
    (a, b) => b.prefijoCelular.replace(/\D/g, "").length - a.prefijoCelular.replace(/\D/g, "").length
  );
  for (const p of sorted) {
    const prefDigits = p.prefijoCelular.replace(/\D/g, "");
    if (digits.startsWith(prefDigits)) return p;
  }
  return undefined;
}

// Kept for backwards compatibility — prefer findPaisForNumber when you need the Pais object.
export function extractCountryPrefixFromPaises(
  fullNumber: string,
  paises: Pais[]
): string {
  const p = findPaisForNumber(fullNumber, paises);
  return p ? getDisplayPrefix(p) : "+1";
}

export function usePaises() {
  return useQuery<Pais[]>({
    queryKey: ["paises-publicos"],
    queryFn: async () => {
      const res = await fetch("/api/paises");
      if (!res.ok) throw new Error("Error al cargar países");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
