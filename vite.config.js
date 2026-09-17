import { defineConfig } from "vite";

// Minimal Vite config.
// GLB files live in /public/models, so Vite serves them as static
// assets at "/models/2GALERIADUPLACHACKRAS.glb" both in dev and build.
export default defineConfig({
  // Relative base so the built site works no matter where it's hosted from
  // (root domain, subfolder, a zip opened by a third-party platform, etc.)
  // — important for portability to platforms like SuperRare Studio.
  base: "./",
  build: {
    // GLB assets are already >1kb by nature; keep them out of base64 inlining.
    assetsInlineLimit: 0,
  },
});
