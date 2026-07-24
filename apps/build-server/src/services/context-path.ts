// Phase 3 / TASK-166 (P3-M1): 호스팅 context path 정규화 + 검증.
//
// context path 는 `http://<host>/<contextPath>/` 의 URL prefix 이자 그대로
// k8s 자원 이름 suffix(deploymentName) 의 근거가 되므로 DNS-1123 label 과
// 정합하는 URL-safe 형태로 정규화한다(소문자 / [a-z0-9-] / 양끝·연속 '-' 정리).

// build-server 자체 라우트 및 예약 경로 — 이들과 겹치는 context path 는 거부.
export const RESERVED_CONTEXT_PATHS = new Set([
  "api",
  "admin",
  "health",
  "openapi",
  "docs",
  "builds",
  "assets",
  "static"
]);

// normalizeContextPath 는 raw 입력(사용자 지정 또는 appName)을 URL-safe
// context path 로 정규화한다. 빈 결과는 "" 를 반환(호출자가 invalid 처리).
export function normalizeContextPath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-") // 비허용 문자 → '-'
    .replace(/-+/g, "-") // 연속 '-' 축약
    .replace(/^-+|-+$/g, "") // 양끝 '-' 제거
    .slice(0, 63); // DNS-1123 label 상한
}

export type ContextPathValidation =
  | { ok: true; contextPath: string }
  | { ok: false; reason: string };

// validateContextPath 는 정규화 + 비어있지 않음 + 예약어 회피를 검증한다.
// 유일성(다른 앱이 이미 점유했는지)은 registry 를 봐야 하므로 호출자(서비스)
// 가 별도로 확인한다.
export function validateContextPath(raw: string): ContextPathValidation {
  const contextPath = normalizeContextPath(raw);
  if (contextPath === "") {
    return {
      ok: false,
      reason: `Context path normalizes to empty from "${raw}".`
    };
  }
  if (RESERVED_CONTEXT_PATHS.has(contextPath)) {
    return {
      ok: false,
      reason: `Context path "${contextPath}" is reserved.`
    };
  }
  return { ok: true, contextPath };
}
