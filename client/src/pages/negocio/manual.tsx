import NegocioLayout from "@/components/negocio/NegocioLayout";
import ManualInteractivo from "@/components/manual/ManualInteractivo";

/** Manual de uso dentro del panel del negocio: el mismo manual interactivo con "Abrir esta pantalla". */
export default function NegocioManualPage() {
  return (
    <NegocioLayout title="Manual de uso" activeNav="manual">
      <ManualInteractivo embebido porDefecto="negocio" />
    </NegocioLayout>
  );
}
