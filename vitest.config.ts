import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const alias = {
  "@": path.resolve(__dirname, "client", "src"),
  "@shared": path.resolve(__dirname, "shared"),
  "@assets": path.resolve(__dirname, "client", "src", "assets"),
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "client",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./client/src/test/setup.ts"],
          include: ["client/src/**/*.test.{ts,tsx}"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "worker",
          environment: "node",
          include: ["worker/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
