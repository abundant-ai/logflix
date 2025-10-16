import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@logflix/shared": path.resolve(import.meta.dirname, "../../packages/shared"),
    },
  },
  root: import.meta.dirname,
  envDir: path.resolve(import.meta.dirname, "../.."),
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.PORT || '5001', 10),
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
