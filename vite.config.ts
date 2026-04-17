import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  // 打包为 file:// 场景时，资源必须使用相对路径，否则会命中根路径导致 ERR_FILE_NOT_FOUND
  base: command === "serve" ? "/" : "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "src/components/shared"),
      "@types": path.resolve(__dirname, "src/types")
    }
  }
}));
