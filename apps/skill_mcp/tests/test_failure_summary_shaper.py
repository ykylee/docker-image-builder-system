"""failure-summary-shaper skill tests.

TASK-031. 입력 검증 / 4-구조 합성 / errorCode / nextAction 매핑 /
previewFailure 병합 / logs_excerpt / OI-009 미결 코멘트 / cli.
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

    def test_no_failure_no_preview(self):
        r = core.shape({})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")
        self.assertEqual(r.errors[0]["field"], "failure")

    def test_failure_non_dict_treated_as_missing(self):
        r = core.shape({"failure": "string-not-dict"})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")

    def test_preview_only_works(self):
        r = core.shape({"previewFailure": {"errorCode": "PREVIEW_CONTAINER_START_FAILED"}})
        self.assertTrue(r.ok)
        self.assertEqual(r.source, "unknown")  # default

    def test_build_id_must_be_string(self):
        r = core.shape({
            "buildId": 12345,
            "failure": {"errorCode": "INTERNAL_ERROR"},
        })
        self.assertTrue(r.ok)
        # 비-string buildId 는 무시 + warning
        self.assertIsNone(r.build_id)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "buildId" for w in r.warnings))


# ---------------------------------------------------------------------------
# 2. 4-structure assembly
# ---------------------------------------------------------------------------

class AssemblyTests(unittest.TestCase):
    def test_basic_build_failure(self):
        r = core.shape({
            "buildId": "b-1",
            "failure": {
                "source": "build",
                "errorCode": "DOCKER_BUILD_FAILED",
                "nextAction": "FIX_DOCKERFILE",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.summary, "배포가 완료되지 않았습니다.")
        self.assertIn("이미지", r.cause)
        self.assertIn("Dockerfile", r.next_step)
        self.assertEqual(r.build_id, "b-1")
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")
        self.assertEqual(r.source, "build")

    def test_preview_only(self):
        r = core.shape({
            "previewFailure": {
                "source": "preview",
                "errorCode": "PREVIEW_PORT_UNAVAILABLE",
                "nextAction": "FIX_PORT",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.summary, "미리보기 환경이 준비되지 않았습니다.")
        self.assertIn("포트", r.cause)
        self.assertIn("포트", r.next_step)
        self.assertEqual(r.next_action, "FIX_PORT")
        self.assertEqual(r.source, "preview")

    def test_unknown_source_falls_back(self):
        r = core.shape({
            "failure": {
                "source": "weird",
                "errorCode": "INTERNAL_ERROR",
                "nextAction": "CONTACT_OPERATOR",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.source, "unknown")
        self.assertEqual(r.summary, "빌드/미리보기 진행이 끝나지 않았습니다.")
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "source" for w in r.warnings))

    def test_next_action_none_fallback(self):
        r = core.shape({"failure": {"errorCode": "DOCKER_BUILD_FAILED"}})
        self.assertEqual(r.next_action, "NONE")
        self.assertIn("원인을 확인", r.next_step)


# ---------------------------------------------------------------------------
# 3. errorCode mapping (all 10 canonical)
# ---------------------------------------------------------------------------

class ErrorCodeMappingTests(unittest.TestCase):
    CODES = [
        ("INVALID_REQUEST", "FIX_PORT", "잘못된 필드"),
        ("SOURCE_ARCHIVE_NOT_FOUND", "CHECK_SOURCE", "소스 아카이브"),
        ("DOCKERFILE_NOT_FOUND", "CHECK_SOURCE", "Dockerfile"),
        ("INVALID_RUNTIME_PORT", "FIX_PORT", "실행 포트"),
        ("INVALID_BUILD_INPUT", "FIX_DOCKERFILE", "빌드 입력"),
        ("DOCKER_BUILD_FAILED", "FIX_DOCKERFILE", "이미지"),
        ("PREVIEW_PORT_UNAVAILABLE", "FIX_PORT", "미리보기 포트"),
        ("PREVIEW_CONTAINER_START_FAILED", "RETRY", "컨테이너"),
        ("PREVIEW_HEALTHCHECK_FAILED", "RETRY", "응답"),
        ("INTERNAL_ERROR", "CONTACT_OPERATOR", "내부 오류"),
    ]

    def test_all_canonical_codes(self):
        for code, action, hint in self.CODES:
            with self.subTest(code=code):
                r = core.shape({
                    "failure": {"errorCode": code, "nextAction": action},
                })
                self.assertTrue(r.ok, msg=str(r.to_dict()))
                self.assertEqual(r.next_action, action)
                self.assertIn(hint, r.cause)
                self.assertEqual(r.errors, [])

    def test_unknown_code_uses_generic_phrase(self):
        r = core.shape({
            "failure": {"errorCode": "MYSTERY_CODE_9999", "nextAction": "NONE"},
        })
        self.assertTrue(r.ok)
        self.assertIn("MYSTERY_CODE_9999", r.cause)
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "errorCode" for w in r.warnings))

    def test_error_summary_fallback_when_code_missing(self):
        r = core.shape({
            "failure": {
                "errorSummary": "사용자 정의 원인 설명",
                "nextAction": "NONE",
            },
        })
        self.assertEqual(r.cause, "사용자 정의 원인 설명")

    def test_error_summary_truncated(self):
        long = "x" * 200
        r = core.shape({
            "failure": {"errorSummary": long, "nextAction": "NONE"},
        })
        # 100자 + …
        self.assertLessEqual(len(r.cause), 101)
        self.assertTrue(r.cause.endswith("\u2026"))


# ---------------------------------------------------------------------------
# 4. previewFailure merge
# ---------------------------------------------------------------------------

class PreviewMergeTests(unittest.TestCase):
    def test_both_present_build_priority(self):
        r = core.shape({
            "failure": {
                "source": "build",
                "errorCode": "DOCKER_BUILD_FAILED",
                "nextAction": "FIX_DOCKERFILE",
            },
            "previewFailure": {
                "source": "preview",
                "errorCode": "PREVIEW_CONTAINER_START_FAILED",
                "nextAction": "RETRY",
            },
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.source, "build")
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")
        # cause 에 preview 부가 라인 포함
        self.assertIn("이미지", r.cause)
        self.assertIn("미리보기", r.cause)


# ---------------------------------------------------------------------------
# 5. logs_excerpt
# ---------------------------------------------------------------------------

class LogsExcerptTests(unittest.TestCase):
    def test_empty_tail(self):
        r = core.shape({"failure": {"errorCode": "DOCKER_BUILD_FAILED"},
                        "logs": {"tail": []}})
        self.assertIsNone(r.logs_excerpt)

    def test_single_line(self):
        r = core.shape({"failure": {"errorCode": "DOCKER_BUILD_FAILED"},
                        "logs": {"tail": ["only line"]}})
        self.assertEqual(r.logs_excerpt, "only line")

    def test_two_lines(self):
        r = core.shape({
            "failure": {"errorCode": "DOCKER_BUILD_FAILED"},
            "logs": {"tail": ["first", "last"]},
        })
        self.assertIn("first", r.logs_excerpt)
        self.assertIn("last", r.logs_excerpt)
        self.assertIn("\u00b7\u00b7\u00b7", r.logs_excerpt)

    def test_long_line_truncated(self):
        long = "a" * 200
        r = core.shape({
            "failure": {"errorCode": "DOCKER_BUILD_FAILED"},
            "logs": {"tail": [long, "last"]},
        })
        self.assertLessEqual(len(r.logs_excerpt), 60 * 2 + 10)
        self.assertIn("\u2026", r.logs_excerpt)

    def test_logs_must_be_object(self):
        r = core.shape({"failure": {"errorCode": "DOCKER_BUILD_FAILED"},
                        "logs": "not a dict"})
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "logs" for w in r.warnings))

    def test_tail_must_be_list(self):
        r = core.shape({"failure": {"errorCode": "DOCKER_BUILD_FAILED"},
                        "logs": {"tail": "not a list"}})
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "logs.tail" for w in r.warnings))


# ---------------------------------------------------------------------------
# 6. result envelope
# ---------------------------------------------------------------------------

class ResultEnvelopeTests(unittest.TestCase):
    def test_to_dict_shape(self):
        r = core.shape({
            "buildId": "b-1",
            "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
        })
        d = r.to_dict()
        for k in ("ok", "summary", "cause", "next_step", "buildId",
                  "logs_excerpt", "next_action", "ref"):
            self.assertIn(k, d)
        self.assertEqual(d["ref"]["design_doc"], "docs/sdlc/design/06-user-messaging-and-failure-handling.md")
        self.assertEqual(d["ref"]["skill_version"], "v1")


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
            "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
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
            "failure": {"errorCode": "INTERNAL_ERROR", "nextAction": "CONTACT_OPERATOR"},
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
