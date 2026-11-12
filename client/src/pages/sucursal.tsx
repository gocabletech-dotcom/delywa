import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { MapPin, Phone, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

type SucursalPublica = {
  nombre: string;
  slug: string | null;
  logo: string | null;
  direccion: string;
  ciudad: string | null;
  provincia: string | null;
  whatsappNumero: string;
  tipoNegocio: string;
  estaAbiertoManual?: boolean;
  mensajeCerrado?: string | null;
};

export default function SucursalPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useQuery<SucursalPublica>({
    queryKey: ["sucursal-publica", slug],
    queryFn: async () => {
      const res = await fetch(`/api/chat-web/colmado/${encodeURIComponent(slug || "")}`);
      if (!res.ok) throw new Error("Sucursal no encontrada");
      return res.json();
    },
    enabled: !!slug,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (isError || !data) return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold">Sucursal no encontrada</h1><p className="text-gray-500 mt-2">El enlace puede estar vencido o desactivado.</p></div></div>;

  const publicSlug = data.slug || slug;
  const esColmado = ["colmado", "colmadon"].includes(data.tipoNegocio);
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-primary text-white p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            {data.logo ? <img src={data.logo} alt="" className="w-full h-full object-contain" /> : <span className="text-3xl font-bold">{data.nombre.charAt(0)}</span>}
          </div>
          <h1 className="text-2xl font-bold mt-4">{data.nombre}</h1>
          <p className="text-white/80 text-sm mt-1">{data.estaAbiertoManual === false ? (data.mensajeCerrado || "Estamos cerrados") : "Estamos atendiendo pedidos"}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-3 text-gray-700"><MapPin className="text-primary shrink-0" size={20} /><span>{data.direccion}{data.ciudad ? `, ${data.ciudad}` : ""}{data.provincia ? `, ${data.provincia}` : ""}</span></div>
          <div className="flex gap-3 text-gray-700"><Phone className="text-primary shrink-0" size={20} /><span>{data.whatsappNumero}</span></div>
          {/* Los colmados se piden hablando, como por WhatsApp: no hay menú. */}
          <div className={`grid gap-3 pt-2 ${esColmado ? "grid-cols-1" : "grid-cols-2"}`}>
            <Link href={`/pedir/${publicSlug}`}><Button className="w-full"><ShoppingBag size={17} className="mr-2" /> {esColmado ? "Escribir al colmado" : "Pedir ahora"}</Button></Link>
            {!esColmado && <Link href={`/menu/${publicSlug}`}><Button variant="outline" className="w-full"><UtensilsCrossed size={17} className="mr-2" /> Ver menú</Button></Link>}
          </div>
        </div>
      </section>
    </main>
  );
}