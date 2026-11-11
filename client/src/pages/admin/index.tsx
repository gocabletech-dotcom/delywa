import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function AdminIndex() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const { data: roleData, isLoading: roleLoading } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
      return;
    }

    if (!roleLoading && roleData) {
      if (roleData.role === "platform_admin") {
        setLocation("/admin/platform");
      } else if (roleData.role === "colmado_owner" && roleData.colmadoId) {
        setLocation("/negocio/dashboard");
      } else if (roleData.role === "delivery" && roleData.deliveryId) {
        setLocation("/negocio/delivery-dashboard");
      } else {
        setLocation("/admin/setup");
      }
    }
  }, [authLoading, isAuthenticated, roleLoading, roleData, setLocation]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return null;
}
