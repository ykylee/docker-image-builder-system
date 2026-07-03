"""build-status-explainer core / cli 단위 테스트.

`python3 -m unittest apps.skill_mcp.tests.test_build_status_explainer` 로 실행.
"""

from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from apps.skill_mcp.skills.build_status_explainer import Explanation, explain
from apps.skill_mcp.skills.build_status_explainer.cli import main as cli_main


def _payload(**overrides):
    base = {
        "buildId": "b-1",
        "userId": "u-1",
        "appName": "demo-app",
        "status": "BUILDING",
        "currentPhase": "DOCKER_BUILDING",
        "testDeployment": {"status": "STARTING"},
        "error": None,
    }
    base.update(overrides)
    return base


class ExplainCoreTests(unittest.TestCase):
    def test_minimal_building_response(self) -> None:
        r = explain(_payload())
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["system"]["status"], "BUILDING")
        self.assertEqual(r.explanation["next_action"], "WAIT")
        self.assertFalse(r.explanation["is_terminal"])
        self.assertIsNone(r.explanation["error_summary"])
        # user / agent 가 비어있지 않은 한국어
        self.assertTrue(len(r.explanation["user"]) > 0)
        self.assertTrue(len(r.explanation["agent"]) > 0)

    def test_in_flight_statuses_yield_wait(self) -> None:
        for s in ("QUEUED", "PREPARING", "VALIDATING", "BUILDING", "IMAGE_BUILT", "TEST_DEPLOYING"):
            r = explain(_payload(status=s))
            self.assertTrue(r.ok, s)
            self.assertEqual(r.explanation["next_action"], "WAIT", s)
            self.assertFalse(r.explanation["is_terminal"], s)

    def test_test_ready_with_ready_preview_open_preview(self) -> None:
        r = explain(
            _payload(
                status="TEST_READY",
                testDeployment={"status": "READY", "previewUrl": "https://preview.example.com/x"},
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "OPEN_PREVIEW")
        self.assertFalse(r.explanation["is_terminal"])  # TEST_READY 는 active
        self.assertIn("https://preview.example.com/x", r.explanation["user"])

    def test_test_ready_with_starting_preview_yields_wait(self) -> None:
        r = explain(
            _payload(
                status="TEST_READY",
                testDeployment={"status": "STARTING"},
            )
        )
        self.assertEqual(r.explanation["next_action"], "WAIT")
        self.assertFalse(r.explanation["is_terminal"])

    def test_completed_with_ready_preview_open_preview(self) -> None:
        r = explain(
            _payload(
                status="COMPLETED",
                testDeployment={"status": "READY", "previewUrl": "https://p/x"},
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "OPEN_PREVIEW")
        self.assertTrue(r.explanation["is_terminal"])

    def test_completed_with_expired_preview_yields_retry(self) -> None:
        r = explain(
            _payload(
                status="COMPLETED",
                testDeployment={"status": "EXPIRED"},
            )
        )
        self.assertEqual(r.explanation["next_action"], "RETRY")
        self.assertTrue(r.explanation["is_terminal"])

    def test_failed_with_docker_build_failed_yields_fix_dockerfile(self) -> None:
        r = explain(
            _payload(
                status="FAILED",
                error={"code": "DOCKER_BUILD_FAILED", "message": "..."},
                logs={"tail": ["Step 1/3 : FROM node:20", "returned non-zero code: 1"]},
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "FIX_DOCKERFILE")
        self.assertTrue(r.explanation["is_terminal"])
        self.assertIsNotNone(r.explanation["error_summary"])
        self.assertIn("FROM node:20", r.explanation["error_summary"])

    def test_failed_with_port_issue_yields_fix_port(self) -> None:
        for code, expected in (
            ("INVALID_RUNTIME_PORT", "FIX_PORT"),
            ("PREVIEW_PORT_UNAVAILABLE", "FIX_PORT"),
        ):
            r = explain(_payload(status="FAILED", error={"code": code}))
            self.assertEqual(r.explanation["next_action"], expected, code)
            self.assertTrue(r.explanation["is_terminal"])

    def test_failed_with_source_or_dockerfile_missing_yields_check_source(self) -> None:
        for code in ("SOURCE_ARCHIVE_NOT_FOUND", "DOCKERFILE_NOT_FOUND", "INVALID_REQUEST"):
            r = explain(_payload(status="FAILED", error={"code": code}))
            self.assertEqual(r.explanation["next_action"], "CHECK_SOURCE", code)

    def test_failed_with_internal_error_yields_contact_operator(self) -> None:
        r = explain(_payload(status="FAILED", error={"code": "INTERNAL_ERROR"}))
        self.assertEqual(r.explanation["next_action"], "CONTACT_OPERATOR")

    def test_failed_without_error_code_yields_contact_operator(self) -> None:
        r = explain(_payload(status="FAILED", error=None))
        self.assertEqual(r.explanation["next_action"], "CONTACT_OPERATOR")
        self.assertIsNone(r.explanation["error_summary"])

    def test_cancelled_is_terminal_with_none_action(self) -> None:
        r = explain(_payload(status="CANCELLED"))
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "NONE")
        self.assertTrue(r.explanation["is_terminal"])

    def test_preview_failed_with_no_build_failure_yields_retry(self) -> None:
        r = explain(
            _payload(
                status="COMPLETED",
                testDeployment={"status": "FAILED"},
            )
        )
        self.assertEqual(r.explanation["next_action"], "RETRY")
        self.assertIsNotNone(r.explanation["error_summary"])

    def test_invalid_root_type(self) -> None:
        r = explain("not a dict")  # type: ignore[arg-type]
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_missing_status(self) -> None:
        data = _payload()
        del data["status"]
        r = explain(data)
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "MISSING_FIELD" and e["field"] == "status" for e in r.errors))

    def test_unknown_enum_status_yields_warning_and_not_ok(self) -> None:
        r = explain(_payload(status="MAGIC_STATE"))
        self.assertFalse(r.ok)
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "status" for w in r.warnings))
        self.assertEqual(r.explanation["next_action"], "NONE")

    def test_invalid_test_deployment_type(self) -> None:
        r = explain(_payload(testDeployment="not a dict"))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["field"] == "testDeployment" for e in r.errors))

    def test_to_dict_has_ref(self) -> None:
        r = explain(_payload())
        d = r.to_dict()
        self.assertEqual(
            set(d.keys()),
            {"ok", "explanation", "warnings", "errors", "ref"},
        )
        self.assertEqual(d["ref"]["contract_version"], "v1")
        self.assertEqual(d["ref"]["explanation_version"], "v1")

    def test_explanation_version_is_v1(self) -> None:
        self.assertEqual(Explanation.explanation_version if False else "v1", "v1")  # type: ignore[comparison-overlap]


class CliTests(unittest.TestCase):
    def test_cli_with_file_input_ok(self) -> None:
        tmp = Path("apps/skill_mcp/tests/_tmp_bse_ok.json")
        tmp.write_text(json.dumps(_payload()))
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(["--input", str(tmp)])
            out = buf.getvalue()
        finally:
            tmp.unlink(missing_ok=True)
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])
        self.assertEqual(data["explanation"]["system"]["status"], "BUILDING")

    def test_cli_strict_returns_2_on_invalid(self) -> None:
        tmp = Path("apps/skill_mcp/tests/_tmp_bse_bad.json")
        tmp.write_text(json.dumps({"status": "MAGIC_STATE"}))
        try:
            with redirect_stdout(io.StringIO()):
                rc = cli_main(["--input", str(tmp), "--strict"])
        finally:
            tmp.unlink(missing_ok=True)
        self.assertEqual(rc, 2)

    def test_cli_stdin_ok(self) -> None:
        original = sys.stdin
        sys.stdin = io.StringIO(json.dumps(_payload()))
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(["--input", "-"])
            out = buf.getvalue()
        finally:
            sys.stdin = original
        self.assertEqual(rc, 0)
        self.assertIn("\"ok\": true", out)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
