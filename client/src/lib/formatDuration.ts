export function formatearDuracionMinutos(minutos: number): string {
  const totalMinutos = Math.max(0, Math.round(Number(minutos) || 0));
  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = String(totalMinutos % 60).padStart(2, "0");
  return `${horas}:${minutosRestantes} minutos`;
}