import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// GitHub Pages はサブパス配信 (https://<user>.github.io/photo-sorter/)。
// dev では PORT 環境変数（プレビューハーネス）を尊重する。
// base は VITE_BASE で上書き可能（GitHub Pages は "/photo-sorter/"、ローカル検証は "/"）。
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === "build" ? "/photo-sorter/" : "/"),
  plugins: [preact()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500, // onnxruntime-web の wasm ラッパが大きい
  },
  worker: {
    format: "es" as const,
  },
  // onnxruntime-web の .wasm/.mjs をそのままアセットとして扱う
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
}));
