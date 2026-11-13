import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

// La versión se muestra en el panel y en el portal del repartidor para saber qué está publicado.
const VERSION = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")).version as string;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __DELYWA_VERSION__: JSON.stringify(VERSION) },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "client", "src", "assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/client"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Librerías base en archivos aparte: el navegador las guarda y no las vuelve a bajar en cada versión.
        // Las gráficas, los mapas y el PDF quedan dentro de las pantallas que los usan (no en la portada).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|wouter)[\\/]/.test(id)) return "react";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("@radix-ui")) return "ui";
          if (id.includes("lucide-react")) return "iconos";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    // En desarrollo la API corre con `npm run dev:worker` (wrangler dev, puerto 8787).
    proxy: {
      "/api": "http://localhost:8787",
      "/uploads": "http://localhost:8787",
      "/compartir": "http://localhost:8787",
    },
  },
});
