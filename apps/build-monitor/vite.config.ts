/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TASK-153: dual vite config 통일. 이전에는 `vite.config.ts`(dev 5173 + test,
// root 미설정 → stale 루트 index.html→/src/main.ts 로 build 불가) 와
// `vite.react.config.ts`(build root=react/ → dist-react) 로 이원화돼 있었고,
// 그 사이 틈으로 Dockerfile 이 잘못된 config 를 잡아 이미지 빌드가 깨졌다
// (session_handoff rev 149). 이제 **단일 canonical config** 로 통합한다:
//   - root=react/  (React SPA 의 실제 루트. react/index.html → react/src/main.tsx)
//   - build.outDir=dist-react  (Dockerfile stage3 이 dist/ 로 COPY)
//   - test(vitest) 블록 통합  (setupFiles 는 절대경로, include 는 root 상대)
//
// 폐기: Svelte 잔재 `index.html`(루트), `svelte.config.js`, `vite.react.config.ts`,
// `vite.config.js`(.gitignore/.dockerignore). alias `@` → react/src 유지
// (tsconfig.react.json paths `@/*` 와 정합).
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "react"),
  resolve: {
    conditions: process.env.VITEST ? ["browser"] : undefined,
    alias: {
      "@": path.resolve(__dirname, "react/src")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist-react"),
    emptyOutDir: true
  },
  // root 가 react/ 이므로 publicDir 만 외부 경로(build-monitor/public)를
  // 가리켜 favicon.svg 등 정적 자산이 빌드 결과에 포함되게 한다.
  publicDir: path.resolve(__dirname, "public"),
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      // dev 시 vite dev server 의 /api/* 요청을 Build Server(:3000) 로 프록시.
      // production 은 Build Server 가 SPA + /api 를 단일 포트로 서빙.
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  },
  test: {
    environment: "jsdom",
    // 절대경로로 고정해 root=react/ 하의 resolution 모호성 제거.
    setupFiles: [path.resolve(__dirname, "react/src/test/setup.ts")],
    // include 는 vite root(=react/) 상대 경로.
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx"
    ],
    server: {
      deps: {
        inline: [/@testing-library\/react/]
      }
    },
    // TASK-064 운영 baseline: jsdom 기본 URL "about:blank" (opaque origin) 은
    // localStorage/sessionStorage 비활성 → 명시적 URL 로 same-origin storage 활성화.
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    }
  }
});
