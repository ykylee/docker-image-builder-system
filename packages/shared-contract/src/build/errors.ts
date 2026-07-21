import { z } from "zod";

export const errorCodes = [
  "ACTIVE_BUILD_EXISTS",
  "INVALID_REQUEST",
  "BUILD_NOT_FOUND",
  "LOGS_NOT_FOUND",
  "QUEUE_CLAIM_FAILED",
  "DOCKER_BUILD_FAILED",
  "PREVIEW_PROVISION_FAILED",
  // TASK-062: deployment adapter failure surfaced by Runner during the
  // external deployment phase. Parallel to PREVIEW_PROVISION_FAILED
  // (test environment provisioning) but at the deployment step.
  "DEPLOYMENT_FAILED",
  "UNKNOWN_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];

// TASK-130: canonical error response envelope.
//
// 배경 — 이 스키마가 없던 동안 서버와 프론트의 에러 계약은 암묵적이었고,
// TASK-127 → TASK-129 에서 실제로 어긋났다. build-server 가 `POST /builds`
// 의 검증 실패 응답을 500(ZodError 누수) 에서 400 `{ message, issues }` 로
// 정렬했는데, 프론트의 `parseApiError` 는 옛 500 형태(`message` 안에 zod
// 배열이 JSON 문자열로 박힌 모양)만 파싱하고 있었다. 그 결과 **양쪽 테스트가
// 모두 통과하는 채로** UI 의 field-level 에러 표시가 조용히 사라졌다 —
// 프론트 테스트가 서버 응답을 mock 했기 때문에 계약 변화가 보이지 않았다.
//
// 그래서 envelope 을 여기 한 곳에 정의하고, 서버는 이 타입으로 응답을
// 만들고 프론트는 생성된 OpenAPI 타입(`components.schemas.ApiErrorResponse`)
// 으로 소비한다. 계약이 어긋나면 런타임이 아니라 **컴파일 타임**에 깨진다.

// zod issue 의 최소 구조. 서버가 내보내는 zod v4 issue 는 이보다 많은
// 필드(`expected` / `received` / `code` 등)를 담지만, 계약이 보장하는 것은
// "어느 필드가(path) 왜(message) 실패했는가" 두 가지다. 나머지는 진단용
// 부가 정보로 통과시킨다.
export const apiErrorIssueSchema = z
  .object({
    path: z
      .array(z.union([z.string(), z.number()]))
      .meta({ description: "Field path of the failing value (dot-joinable)." }),
    message: z.string().meta({ description: "Human-readable reason." }),
    code: z.string().optional().meta({ description: "zod issue code, when present." })
  })
  .loose()
  .meta({
    id: "ApiErrorIssue",
    description:
      "One field-level validation failure. Mirrors a zod issue narrowed to the fields the API contract guarantees."
  });

export type ApiErrorIssue = z.infer<typeof apiErrorIssueSchema>;

// 에러 응답 envelope.
//
// `.loose()` 인 이유: 라우트들이 상황별 진단 필드를 함께 실어 보낸다
// (`header` / `callerId` / `expected` / `actual` / `reason` / `runnerId` …).
// 그것들까지 스키마로 닫으면 기존 응답 20여 종이 깨지고, 진단 정보를 줄이는
// 방향은 운영에 손해다. 계약이 고정하는 것은 **모든 에러에 `message` 가 있고,
// 검증 실패에는 `issues` 가 있다** 는 두 가지다.
export const apiErrorResponseSchema = z
  .object({
    message: z
      .string()
      .min(1)
      .meta({ description: "Human-readable summary. Always present." }),
    issues: z
      .array(apiErrorIssueSchema)
      .optional()
      .meta({
        description:
          "Field-level validation failures. Present when the request failed schema validation (HTTP 400)."
      })
  })
  .loose()
  .meta({
    id: "ApiErrorResponse",
    description:
      "Canonical error envelope for 4xx responses. `issues` is populated on schema-validation failures so clients can render field-level errors."
  });

// zod 가 추론하는 타입. `.loose()` 때문에 index signature
// (`& { [key: string]: unknown }`) 가 붙어 있어 **오타나 필드명 변경을
// 잡지 못한다** — 어떤 키를 읽어도 `unknown` 으로 통과한다.
export type ApiErrorResponseLoose = z.infer<typeof apiErrorResponseSchema>;

// 그래서 계약이 실제로 고정하는 부분만 담은 좁은 타입을 따로 둔다.
// index signature 가 없으므로 `envelope.problems` 같은 접근은 컴파일
// 에러가 된다. 서버의 응답 helper 와 프론트의 파서는 **이 타입**을 쓴다.
//
// (진단용 부가 필드는 여전히 런타임에 실려 나간다 — 스키마가 `.loose()`
//  이므로. 타입으로 고정하는 것은 "모든 에러에 message 가 있고, 검증
//  실패에는 issues 가 있다" 는 계약의 핵심뿐이다.)
export interface ApiErrorResponse {
  message: string;
  issues?: ApiErrorIssue[];
}

// 좁은 타입이 zod 스키마와 어긋나면 컴파일이 깨지도록 고정한다.
// (스키마에서 `issues` 를 지우거나 이름을 바꾸면 이 줄이 먼저 실패한다.)
type AssertEnvelopeMatchesSchema =
  ApiErrorResponse extends Pick<ApiErrorResponseLoose, "message" | "issues">
    ? true
    : never;
const _assertEnvelopeMatchesSchema: AssertEnvelopeMatchesSchema = true;
void _assertEnvelopeMatchesSchema;

// 검증 실패 응답을 만드는 helper. 반환 타입이 `ApiErrorResponse` 이므로
// 호출부가 계약을 벗어나면 컴파일이 깨진다. `issues` 는 zod 의
// `error.issues` 를 그대로 받도록 구조적 타입으로 열어 둔다 (서버가 zod
// v4 issue 를 넘기고, 계약은 path/message 만 요구).
export function validationErrorBody(
  message: string,
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey>; readonly message: string }>,
  extra?: Record<string, unknown>
): ApiErrorResponse {
  return {
    ...extra,
    message,
    issues: issues.map((issue) => ({
      // 원본 issue 의 진단 필드(`code` / `expected` / `received` …)는 그대로
      // 통과시킨다. 계약이 보장하는 것은 path/message 두 가지지만, 나머지는
      // 운영자가 400 응답만 보고 원인을 좁힐 때 쓰이므로 버리지 않는다.
      ...issue,
      // path 만 정규화한다. zod 의 path 는 `PropertyKey[]` 라 symbol 이
      // 섞일 수 있는데 JSON 으로 직렬화되지 않아 조용히 사라진다. 계약은
      // string|number 로 좁혀 클라이언트가 dot-join 할 수 있게 보장한다.
      path: issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number"
      ),
      message: issue.message
    }))
  };
}
