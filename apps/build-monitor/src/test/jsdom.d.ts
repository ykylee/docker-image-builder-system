// jsdom 의 type definition 은 package 에 포함되지 않음 (jsdom 25.0.1 기준).
// setup.ts 에서 import 만 필요하므로 minimal declaration 으로 type check
// 회귀를 닫는다. JSDOM constructor 의 detail 한 사용은 vitest 환경에서만
// 일어나므로 surface 면적은 최소화한다.
declare module "jsdom" {
  export class JSDOM {
    constructor(html: string, options?: { url?: string });
    readonly window: {
      readonly localStorage: Storage;
      readonly sessionStorage: Storage;
    };
  }
}