import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      // Forward API calls to the backend that will hold the Nango secret key.
      // The frontend runs fully on mock data today, so this only matters once
      // the real integration is wired (see src/lib/nango.ts).
      "/api": "http://localhost:3010",
    },
  },
});
