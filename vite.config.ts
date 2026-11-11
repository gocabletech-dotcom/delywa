import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
