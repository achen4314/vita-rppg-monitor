import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("node_modules/three") >= 0) return "three";
          if (id.indexOf("node_modules/p5") >= 0) return "p5";
          if (id.indexOf("node_modules/gsap") >= 0) return "gsap";
          if (id.indexOf("node_modules/lenis") >= 0) return "lenis";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
