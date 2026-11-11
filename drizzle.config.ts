import { defineConfig } from "drizzle-kit";

// Solo genera SQL en ./migrations. Las migraciones se aplican con wrangler
// (npm run db:migrate:local / db:migrate:remote).
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
});
