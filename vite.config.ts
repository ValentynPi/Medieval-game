import { defineConfig } from "vite";

/** GitHub Pages serves from /<repo>/ — adjust if the repo name changes */
export default defineConfig({
  base: "/Medieval-game/", // https://valentynpi.github.io/Medieval-game/
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
  },
});
