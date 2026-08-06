import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 3000,
  },

  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        profile: resolve(__dirname, "profile.html"),
        review: resolve(__dirname, "review.html"),
        searchResults: resolve(__dirname, "searchResult.html"),
        admin: resolve(__dirname, "admin.html"),
        auth: resolve(__dirname, "auth.html"),
      },
    },
  },
});