import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      // Allow embedding from the demo host (3001) and the AWS console.
      "Content-Security-Policy":
        "frame-ancestors 'self' http://localhost:3001 https://*.console.aws.amazon.com https://console.aws.amazon.com",
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
