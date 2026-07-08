/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TASK-088: Svelte 빌드와 React 빌드를 같은 vite.config.ts 에서 공존시
// 키기 위해 두 plugin 을 모두 등록. 각 plugin 은 자기 file extension 만
// transform 하므로 충돌 없음 — svelte plugin 은 .svelte, react plugin
// 은 .tsx / .jsx. `pnpm dev` (default Svelte) 와 `pnpm dev:react` (별도
// config vite.react.config.ts) 로 두 빌드를 독립 운영. PR 1 의 회귀
// 영향 0 검증: Svelte 빌드 + Svelte 테스트는 모두 기존 baseline 유지.
export default defineConfig({
  plugins: [svelte(), react()],
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : undefined,
    // TASK-088: tsconfig.react.json 의 paths 와 정합. App.test.tsx 와
    // main.tsx 가 `@/react/App` 으로 import — vite/vitest 의 import-analysis
    // 가 해석할 수 있도록 mirror alias 필요. tsconfig paths 는 typecheck
    // 단계 전용이라 runtime import 에는 영향 없음. vite.react.config.ts
    // 와 같은 path.resolve(__dirname, "src") 패턴으로 정합.
    alias: {
      "@": path.resolve(__dirname, "src")
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
    setupFiles: ["./src/test/setup.ts"],
    // Svelte test 는 src/, React test 는 react/. TASK-088 PoC test 1종이
    // react/src/App.test.tsx 로 이동했고, 추가 React 컴포넌트 test 도 향후
    // react/src/ 하위에 둘 예정. alias `@` 는 Svelte src/ 기준이지만 React
    // test 는 상대경로 import (./App) 를 쓰므로 vitest 의 Svelte/React
    // alias 충돌 없음.
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx",
      "react/src/**/*.{test,spec}.ts",
      "react/src/**/*.{test,spec}.tsx"
    ],
    // Svelte 5 의 . exports 가 default = index-server.js 이고, browser
    // condition 일 때만 index-client.js 로 분기한다. vitest 의 jsdom 환경
    // 은 worker/node condition 으로 떨어져 server module 진입. testing
    // 시점에 browser condition 을 강제하여 mount 가 client API 로 동작.
    server: {
      deps: {
        inline: [/@testing-library\/svelte/, /@testing-library\/react/]
      }
    },
    // jsdom 기본 URL 은 "about:blank" (opaque origin) — localStorage /
    // sessionStorage / 쿠키 가 비활성. TASK-064 운영 baseline: 명시적
    // http://localhost/ URL 을 주어 same-origin storage 가 활성화되도록
    // 한다. setup.ts 에서도 storage polyfill 을 한 번 더 박아 jsdom 환경
    // 자체가 깨졌을 때의 안전망 역할.
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    }
  }
});