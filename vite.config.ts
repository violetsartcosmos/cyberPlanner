import "dotenv/config";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { defineConfig } from "vite";

const apiPort = process.env.PORT || "3000";
const backendDirectory = resolve("server");

export default defineConfig({
  root: "src",
  resolve: {
    alias: {
      "@": resolve("src"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: { quietDeps: true },
    },
  },
  plugins: [
    {
      name: "prevent-server-imports",
      enforce: "pre",
      transform(_code, id) {
        const path = relative(backendDirectory, id.split("?")[0]);
        if (path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) {
          this.error("Server modules cannot be imported into the browser client.");
        }
      },
    },
  ],
  build: { outDir: "../build/client", emptyOutDir: true },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: `http://localhost:${apiPort}`, changeOrigin: false },
      "/auth": { target: `http://localhost:${apiPort}`, changeOrigin: false },
    },
  },
});
