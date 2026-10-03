import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One page (index.html) and React Router handle every URL: /search, /profile?id=…, and so on.
// The dev and preview servers fall back to index.html for unknown paths; netlify.toml does the same in production.
export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
  },
});
