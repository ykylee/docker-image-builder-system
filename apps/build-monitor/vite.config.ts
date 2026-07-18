/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TASK-101 (M4.5 Group G) — Svelte scaffold 일괄 정리 후 vite config 단순화.
//
// frontend rewrite 시리즈 + M4.5 Group A~F (TASK-088~100) 완료로 React 측이
// primary SPA. Svelte plugin / @sveltejs/vite-plugin-svelte 제거. default
// vite.config.ts 는 React 측 dev (port 5173) + test 전용. build 는 별도
// `vite.react.config.ts` 가 담당 (`build:react` script).
//
// TASK-089 부터 유지된 alias `@` → react/src/ 는 vitest 환경에서 React 측
// test (`./App`, `./Header` 등 상대경로 import) 와 무관 — Svelte 측
// test 가 더 이상 없으므로 React test 만 vitest 가 처리.
export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : undefined,
    alias: {
      "@": path.resolve(__dirname, "react/src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Build Server 가 같은 머신의 :3000 에 떠 있다고 가정. Vite dev
      // server 의 /api/* 요청을 :3000 으로 프록시. /openapi.json 도 같이
      // 프록시해서 production 배포 시 동일 origin 으로 보이게 한다.
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./react/src/test/setup.ts"],
    // TASK-101: Svelte test 일괄 삭제. React test 만 vitest 가 처리.
    include: [
      "react/src/**/*.{test,spec}.ts",
      "react/src/**/*.{test,spec}.tsx"
    ],
    server: {
      deps: {
        inline: [/@testing-library\/react/]
      }
    },
    // TASK-064 운영 baseline: jsdom 의 기본 URL "about:blank" (opaque
    // origin) — localStorage / sessionStorage 비활성. 명시적 URL 로
    // same-origin storage 활성화.
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    }
  }
});
