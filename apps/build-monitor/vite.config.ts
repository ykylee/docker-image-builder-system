/// <reference types="vitest" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: process.env.VITEST
    ? { conditions: ["browser"] }
    : undefined,
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
    include: ["src/**/*.{test,spec}.ts"],
    // Svelte 5 의 . exports 가 default = index-server.js 이고, browser
    // condition 일 때만 index-client.js 로 분기한다. vitest 의 jsdom 환경
    // 은 worker/node condition 으로 떨어져 server module 진입. testing
    // 시점에 browser condition 을 강제하여 mount 가 client API 로 동작.
    server: {
      deps: {
        inline: [/@testing-library\/svelte/]
      }
    }
  }
});
