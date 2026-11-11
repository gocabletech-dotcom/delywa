import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, Trash2 } from "lucide-react";

interface DeletionStatus {
  confirmation_code: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  data_deleted: {
    conversaciones: number;
    mensajes: number;
  } | null;
}

export default function DeletionStatusPage() {
  const [, params] = useRoute("/deletion-status/:code");
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params?.code) {
      fetch(`/api/deletion-status/${params.code}`)
        .then(res => {
          if (!res.ok) {
            if (res.status === 404) {
              throw new Error("Solicitud no encontrada");
            }
            throw new Error("Error al verificar estado");
          }
          return res.json();
        })
        .then(data => {
          setStatus(data);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [params?.code]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            Completado
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Procesando
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800">
            {status}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando estado...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Error</h2>
              <p className="text-gray-600">{error}</p>
              <a href="/" className="text-primary hover:underline mt-4 inline-block">
                Volver al inicio
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Trash2 className="w-16 h-16 text-primary" />
          </div>
          <CardTitle className="text-2xl">Estado de Eliminación de Datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Estado:</span>
            {status && getStatusBadge(status.status)}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Código de confirmación:</span>
              <span className="font-mono text-sm">{status?.confirmation_code}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Fecha de solicitud:</span>
              <span>{status?.requested_at ? new Date(status.requested_at).toLocaleDateString("es-DO", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              }) : "-"}</span>
            </div>

            {status?.completed_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">Fecha de completado:</span>
                <span>{new Date(status.completed_at).toLocaleDateString("es-DO", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}</span>
              </div>
            )}
          </div>

          {status?.data_deleted && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Datos eliminados:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{status.data_deleted.conversaciones}</div>
                  <div className="text-sm text-gray-600">Conversaciones</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{status.data_deleted.mensajes}</div>
                  <div className="text-sm text-gray-600">Mensajes</div>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4 text-center text-sm text-gray-500">
            <p>
              Esta solicitud fue procesada de acuerdo con nuestra{" "}
              <a href="/privacy" className="text-primary hover:underline">Política de Privacidad</a>.
            </p>
          </div>

          <div className="text-center">
            <a href="/" className="text-primary hover:underline">
              ← Volver al inicio
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
