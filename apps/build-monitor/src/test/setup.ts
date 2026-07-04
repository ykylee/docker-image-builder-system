import "@testing-library/jest-dom/vitest";

// TASK-064 운영 baseline: vite.config.ts 의 environmentOptions.jsdom.url
// 가 같은 효과를 내지 못할 때 (e.g. 환경 업그레이드, vitest/jsdom 변종) 의
// 안전망. jsdom 이 opaque origin (about:blank) 으로 띄워서 localStorage /
// sessionStorage 가 undefined 로 떨어지는 회귀를 차단한다.
//
// lazy: storage 가 이미 정의돼 있으면 JSDOM 인스턴스를 만들지 않는다. CI
// 환경에서 vitest 가 jsdom 을 정상적으로 띄울 때 JSDOM 초기화 비용
// (network resolver 등) 을 매 테스트 파일 setup 마다 지불하지 않게.
let fallbackDom: import("jsdom").JSDOM | undefined;

function ensureStorage(name: "localStorage" | "sessionStorage"): void {
  if (typeof globalThis[name] !== "undefined") return;
  if (fallbackDom === undefined) {
    // dynamic import — vitest/node 의 require 와 충돌 회피.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require("jsdom") as typeof import("jsdom");
    fallbackDom = new JSDOM("", { url: "http://localhost/" });
  }
  Object.defineProperty(globalThis, name, {
    value: fallbackDom.window[name],
    configurable: true,
    writable: true
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");