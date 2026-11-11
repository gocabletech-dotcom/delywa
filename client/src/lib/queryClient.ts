import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global interceptor: detect inactivity-logout 401s from negocio API routes and
// redirect to /login?reason=inactivity so the login page can show an explanation.
if (typeof window !== "undefined") {
  const _originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const res = await _originalFetch(...args);
    if (res.status === 401) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] instanceof Request ? args[0].url : "");
      // Only intercept negocio API calls (not the portal-repartidor or public endpoints)
      if (url.startsWith("/api/") && !url.includes("/portal-repartidor") && !url.includes("/auth/")) {
        try {
          const cloned = res.clone();
          const body = await cloned.json();
          if (body?.reason === "inactivity_closed") {
            window.location.href = "/login?reason=inactivity";
          }
        } catch {
          // Not JSON – ignore
        }
      }
    }
    return res;
  };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
