import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  // PixiJS is large; let it have its own chunk.
  build: { target: "esnext" },
});
