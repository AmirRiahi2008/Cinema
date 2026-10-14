import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import vercelConfig from "./vercel.json";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig(() => {
  const apiRewrite = vercelConfig.rewrites.find(rule => rule.source === "/api/cinema/:path*");
  if (!apiRewrite || !apiRewrite.destination.startsWith("https://")) {
    throw new Error("vercel.json must define an HTTPS upstream for /api/cinema/:path*.");
  }
  const apiOrigin = new URL(apiRewrite.destination).origin;
  return {
    root: fileURLToPath(new URL("./vercel-web/", import.meta.url)),
    publicDir: fileURLToPath(new URL("./public/", import.meta.url)),
    envDir: projectRoot,
    plugins: [react()],
    resolve: { alias: { "@": projectRoot } },
    // The browser always uses this app's /api/cinema path. Vercel forwards it
    // to the upstream; an old dashboard variable must not restore cross-origin calls.
    define: { "import.meta.env.VITE_CINEMA_API_ORIGIN": JSON.stringify("") },
    build: {
      outDir: fileURLToPath(new URL("./dist-vercel/", import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      host: "127.0.0.1", port: 5173, strictPort: true,
      fs: { allow: [projectRoot] },
      proxy: { "/api/cinema": { target: apiOrigin, changeOrigin: true } },
    },
  };
});
