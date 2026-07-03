/**
 * generate-openapi.ts — /openapi.json → ./.generated/openapi.d.ts
 *
 * `openapi-typescript` 가 backend 의 OpenAPI 3.1 document 를 fetch 해서
 * `paths` / `components` / `operations` 에 대한 정확한 TypeScript type
 * 으로 변환한다. predev / prebuild hook 으로 자동 실행되며, 본 스크립트
 * 의 output (./.generated/openapi.d.ts) 은 `lib/api.ts` 의 `openapi-fetch`
 * client 의 제네릭 인자로 사용된다.
 *
 * Backend 가 별도 머신 / port 에 있을 수 있어 URL 을 `BUILD_SERVER_URL`
 * env 로 override 가능. 기본값은 `http://127.0.0.1:3000` (memory 모드).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const URL = process.env.BUILD_SERVER_URL ?? "http://127.0.0.1:3000";
const OUT = "./.generated/openapi.d.ts";

async function main() {
  console.log(`[generate-openapi] fetch ${URL}/openapi.json`);
  const res = await fetch(`${URL}/openapi.json`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(
      `[generate-openapi] GET /openapi.json failed: ${res.status} ${res.statusText}. ` +
        `Is the Build Server running at ${URL}?`
    );
  }
  const doc = (await res.json()) as Record<string, unknown>;
  const ast = await openapiTS(doc as Parameters<typeof openapiTS>[0]);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, astToString(ast));
  console.log(`[generate-openapi] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
