/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TASK-088 React 빌드 전용 vite config. `pnpm dev:react` (port 5174) 와
// `pnpm build:react` (dist-react/) 가 이 config 사용. default `pnpm dev` /
// `pnpm build` 는 여전히 Svelte 빌드 (vite.config.ts) — Build Server 의
// mountBuildMonitorDist 정합 영향 0. /api 프록시 정합은 동일하게 유지.
//
// root 를 `react/` 로 두어 Svelte index.html (apps/build-monitor/index.html)
// 와 격리. production 빌드 결과는 Svelte 와 같은 구조 (dist-react/index.html
// + dist-react/assets/) — PR 6 (TASK-093) 에서 Build Server 의 mountBuild
// MonitorDist 가 Svelte dist 를 React dist 로 swap 하기 쉽도록 정합.
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "react"),
  resolve: {
    alias: {
      // root 가 react/ 이므로 alias `@` 도 react/src/ 와 정합. main.tsx 가
      // `@/globals.css`, `@/App` 로 import — React 빌드 시 react/src/ 기준으로
      // 해석. tsconfig.react.json paths `@/*` → react/src/* 와 동일하게 유지.
      "@": path.resolve(__dirname, "react/src")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist-react"),
    emptyOutDir: true
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});