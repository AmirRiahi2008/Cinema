import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, projectRoot, "VITE_");
  const apiOrigin = values.VITE_CINEMA_API_ORIGIN || process.env.VITE_CINEMA_API_ORIGIN || "https://two-seats-amir.amirreza-riahi3311.chatgpt.site";
  const origin = new URL(apiOrigin);
  if (origin.protocol !== "https:" || origin.origin !== apiOrigin) {
    throw new Error("VITE_CINEMA_API_ORIGIN must be an HTTPS origin without a trailing slash or path.");
  }
  return {
    root: fileURLToPath(new URL("./vercel-web/", import.meta.url)),
    publicDir: fileURLToPath(new URL("./public/", import.meta.url)),
    envDir: projectRoot,
    plugins: [react()],
    resolve: { alias: { "@": projectRoot } },
    define: { "import.meta.env.VITE_CINEMA_API_ORIGIN": JSON.stringify(apiOrigin) },
    build: {
      outDir: fileURLToPath(new URL("./dist-vercel/", import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
    server: { host: "127.0.0.1", port: 5173, strictPort: true, fs: { allow: [projectRoot] } },
  };
});
