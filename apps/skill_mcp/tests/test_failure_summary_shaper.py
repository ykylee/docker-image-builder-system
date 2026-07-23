"""failure-summary-shaper skill tests (v2 — canonical contract).

TASK-061 contract rename aligned the skill to:
- canonical 8-code `ERROR_CODES` (from `apps.skill_mcp.contract.canonical`)
- canonical `stage: BUILD/TEST/DEPLOY/DELIVERY` (replaces `source: build/preview/unknown`)
- canonical `next_action: OPEN_DEPLOYMENT` (replaces `OPEN_PREVIEW`)
- canonical input shape `{ stage, error, logs }` (with legacy `failure` /
  `previewFailure` kept as forward-compat shims)
"""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apps.skill_mcp.skills.failure_summary_shaper import cli, core


# ---------------------------------------------------------------------------
# 1. Input validation
# ---------------------------------------------------------------------------

class InputValidationTests(unittest.TestCase):
    def test_non_dict_input(self):
        r = core.shape("not a dict")
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_no_error_no_failure(self):
        r = core.shape({})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")

    def test_failure_non_dict_treated_as_missing(self):
        r = core.shape({"failure": "string-not-dict"})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")

    def test_canonical_error_only_works(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "BUILD")

    def test_build_id_must_be_string(self):
        r = core.shape({
            "buildId": 12345,
            "error": {"code": "UNKNOWN_ERROR", "message": "..."},
        })
        self.assertTrue(r.ok)
        self.assertIsNone(r.build_id)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "buildId" for w in r.warnings))


# ---------------------------------------------------------------------------
# 2. 4-structure assembly (canonical stage)
# ---------------------------------------------------------------------------

class AssemblyTests(unittest.TestCase):
    def test_basic_build_failure(self):
        r = core.shape({
            "buildId": "b-1",
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "nextAction": "FIX_DOCKERFILE",
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "BUILD")
        self.assertIn("이미지", r.cause)
        self.assertIn("Dockerfile", r.next_step)
        self.assertEqual(r.build_id, "b-1")
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")

    def test_test_stage_failure(self):
        r = core.shape({
            "stage": "TEST",
            "error": {"code": "CONTAINER_TEST_FAILED", "message": "..."},
            "nextAction": "FIX_PORT",
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "TEST")
        self.assertEqual(r.summary, "컨테이너 테스트 단계가 끝나지 않았어요.")
        self.assertIn("포트", r.cause)

    def test_deploy_stage_failure(self):
        r = core.shape({
            "stage": "DEPLOY",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "nextAction": "FIX_DOCKERFILE",
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "DEPLOY")
        self.assertEqual(r.summary, "외부 배포 단계가 끝나지 않았어요.")

    def test_unknown_stage_falls_back(self):
        r = core.shape({
            "error": {"code": "UNKNOWN_ERROR", "message": "..."},
            "nextAction": "CONTACT_OPERATOR",
        })
        self.assertTrue(r.ok)
        # stage 가 명시 안 됐으면 BUILD 로 default
        self.assertEqual(r.stage, "BUILD")

    def test_next_action_none_fallback(self):
        r = core.shape({"stage": "BUILD", "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."}})
        self.assertEqual(r.next_action, "NONE")
        self.assertIn("원인을 확인", r.next_step)


# ---------------------------------------------------------------------------
# 3. canonical 8-code errorCode mapping
# ---------------------------------------------------------------------------

class ErrorCodeMappingTests(unittest.TestCase):
    CODES = [
        ("INVALID_REQUEST", "CHECK_SOURCE", "잘못된 필드"),
        ("BUILD_NOT_FOUND", "CONTACT_OPERATOR", "식별자"),
        ("LOGS_NOT_FOUND", "RETRY", "로그"),
        ("QUEUE_CLAIM_FAILED", "RETRY", "빌드 큐"),
        ("DOCKER_BUILD_FAILED", "FIX_DOCKERFILE", "이미지"),
        ("CONTAINER_TEST_FAILED", "FIX_PORT", "준비"),
        ("DEPLOYMENT_FAILED", "CONTACT_OPERATOR", "외부 배포"),
        ("ACTIVE_BUILD_EXISTS", "WAIT", "진행 중"),
        ("UNKNOWN_ERROR", "CONTACT_OPERATOR", "내부 오류"),
    ]

    def test_all_canonical_codes(self):
        for code, action, hint in self.CODES:
            with self.subTest(code=code):
                r = core.shape({
                    "stage": "BUILD",
                    "error": {"code": code, "message": "..."},
                    "nextAction": action,
                })
                self.assertTrue(r.ok, msg=str(r.to_dict()))
                self.assertEqual(r.next_action, action, code)
                self.assertIn(hint, r.cause, code)
                self.assertEqual(r.errors, [], code)

    def test_unknown_code_uses_generic_phrase(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "MYSTERY_CODE_9999", "message": "..."},
            "nextAction": "NONE",
        })
        self.assertTrue(r.ok)
        self.assertIn("MYSTERY_CODE_9999", r.cause)
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "errorCode" for w in r.warnings))

    def test_error_summary_fallback_when_code_missing(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"message": "사용자 정의 원인 설명"},
        })
        self.assertEqual(r.cause, "사용자 정의 원인 설명")

    def test_error_summary_truncated(self):
        long = "x" * 200
        # code 가 없으면 errorSummary fallback path 로 들어가서 truncate 된다.
        r = core.shape({
            "stage": "BUILD",
            "error": {"message": long},
        })
        # 100자 + …
        self.assertLessEqual(len(r.cause), 101)
        self.assertTrue(r.cause.endswith("\u2026"))


# ---------------------------------------------------------------------------
# 4. Legacy forward-compat (previewFailure, OPEN_PREVIEW)
# ---------------------------------------------------------------------------

class LegacyCompatTests(unittest.TestCase):
    def test_legacy_failure_with_source_build_routes_to_build_stage(self):
        r = core.shape({
            "failure": {
                "source": "build",
                "errorCode": "DOCKER_BUILD_FAILED",
                "nextAction": "FIX_DOCKERFILE",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "BUILD")
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")

    def test_failure_source_test_routes_to_test_stage(self):
        # TASK-163: 입력 어휘의 `preview` 를 canonical `test` 로 개명.
        r = core.shape({
            "failure": {
                "source": "test",
                "errorCode": "CONTAINER_TEST_FAILED",
                "nextAction": "FIX_PORT",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "TEST")

    def test_legacy_open_preview_next_action_is_mapped(self):
        r = core.shape({
            "failure": {
                "source": "preview",
                "errorCode": "CONTAINER_TEST_FAILED",
                "nextAction": "OPEN_PREVIEW",  # legacy value
            },
        })
        self.assertEqual(r.next_action, "OPEN_DEPLOYMENT")
        self.assertIn("결과 페이지를 확인", r.next_step)

    def test_legacy_previewFailure_becomes_secondary_line(self):
        r = core.shape({
            "failure": {
                "source": "build",
                "errorCode": "DOCKER_BUILD_FAILED",
                "nextAction": "FIX_DOCKERFILE",
            },
            "previewFailure": {
                "source": "preview",
                "errorCode": "CONTAINER_TEST_FAILED",
                "nextAction": "FIX_PORT",
            },
        })
        self.assertTrue(r.ok)
        # build priority — primary stage still BUILD
        self.assertEqual(r.stage, "BUILD")
        # cause has both lines (build + extra TEST stage mention)
        self.assertIn("이미지", r.cause)
        self.assertIn("테스트", r.cause)

    def test_build_status_response_shape_last_error(self):
        # `BuildStatusResponse.lastError` is the canonical error slot.
        r = core.shape({
            "buildId": "b-1",
            "lastError": {"code": "DOCKER_BUILD_FAILED", "message": "FROM node:20 fail"},
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "BUILD")
        self.assertEqual(r.error_code, "DOCKER_BUILD_FAILED")


# ---------------------------------------------------------------------------
# 5. logs_excerpt
# ---------------------------------------------------------------------------

class LogsExcerptTests(unittest.TestCase):
    def test_empty_tail(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": {"tail": []},
        })
        self.assertIsNone(r.logs_excerpt)

    def test_single_line(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": {"tail": ["only line"]},
        })
        self.assertEqual(r.logs_excerpt, "only line")

    def test_two_lines(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": {"tail": ["first", "last"]},
        })
        self.assertIn("first", r.logs_excerpt)
        self.assertIn("last", r.logs_excerpt)
        self.assertIn("\u00b7\u00b7\u00b7", r.logs_excerpt)

    def test_long_line_truncated(self):
        long = "a" * 200
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": {"tail": [long, "last"]},
        })
        self.assertLessEqual(len(r.logs_excerpt), 60 * 2 + 10)
        self.assertIn("\u2026", r.logs_excerpt)

    def test_logs_must_be_object(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": "not a dict",
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "logs" for w in r.warnings))

    def test_tail_must_be_list(self):
        r = core.shape({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "logs": {"tail": "not a list"},
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "logs.tail" for w in r.warnings))


# ---------------------------------------------------------------------------
# 6. result envelope (v2 skill_version, "stage" replaces "source")
# ---------------------------------------------------------------------------

class ResultEnvelopeTests(unittest.TestCase):
    def test_to_dict_shape_v3(self):
        r = core.shape({
            "buildId": "b-1",
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "nextAction": "FIX_DOCKERFILE",
        })
        d = r.to_dict()
        for k in ("ok", "summary", "cause", "next_step", "buildId",
                  "logs_excerpt", "stage", "next_action", "ref"):
            self.assertIn(k, d, msg=f"missing key {k}")
        self.assertEqual(d["ref"]["design_doc"], "docs/sdlc/design/06-user-messaging-and-failure-handling.md")
        # TASK-061 bumped skill_version to v2
        self.assertEqual(d["ref"]["skill_version"], "v3")
        # "stage" replaces legacy "source"
        self.assertEqual(d["stage"], "BUILD")


# ---------------------------------------------------------------------------
# 7. cli.main
# ---------------------------------------------------------------------------

class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _write(self, name, content):
        p = Path(self.tmp.name) / name
        p.write_text(content, encoding="utf-8")
        return p

    def test_cli_stdin_input(self):
        stdin = io.StringIO(json.dumps({
            "buildId": "b-1",
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "nextAction": "FIX_DOCKERFILE",
        }))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), mock.patch("sys.stdin", stdin):
            rc = cli.main(["--input", "-"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertTrue(out["ok"])
        self.assertIn("Dockerfile", out["next_step"])

    def test_cli_strict_exits_2_on_invalid(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["--strict"])  # stdin = {} → MISSING_FIELD
        self.assertEqual(rc, 2)
        out = json.loads(buf.getvalue())
        self.assertFalse(out["ok"])

    def test_cli_output_file(self):
        inp = self._write("in.json", json.dumps({
            "stage": "BUILD",
            "error": {"code": "UNKNOWN_ERROR", "message": "..."},
            "nextAction": "CONTACT_OPERATOR",
        }))
        out_p = Path(self.tmp.name) / "out.json"
        rc = cli.main(["--input", str(inp), "--output", str(out_p)])
        self.assertEqual(rc, 0)
        data = json.loads(out_p.read_text(encoding="utf-8"))
        self.assertEqual(data["next_action"], "CONTACT_OPERATOR")

    def test_cli_invalid_input_json_exits_nonzero(self):
        inp = self._write("bad.json", "{not json")
        with self.assertRaises(SystemExit):
            cli.main(["--input", str(inp)])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
