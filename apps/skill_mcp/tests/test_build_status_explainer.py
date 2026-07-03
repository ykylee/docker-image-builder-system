"""build-status-explainer core / cli 단위 테스트 (v2 — canonical contract).

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
    """Build a canonical BuildStatusResponse payload.

    Default `build.status = "BUILDING"` (an in-flight canonical status).
    Pass `test=...` for the canonical test block, `error=...` for the
    canonical error, `logs=...` for log tail. `currentPhase` is also at
    the canonical BuildPhase union.
    """
    base = {
        "build": {
            "buildId": "b-1",
            "userId": "u-1",
            "appName": "demo-app",
            "status": "BUILDING",
            "phase": "DOCKER_BUILDING",
            "lifecycleStatus": "BUILDING",
            "currentPhase": "DOCKER_BUILDING",
            "createdAt": "2026-07-03T01:00:00Z",
            "updatedAt": "2026-07-03T01:00:10Z",
        },
        "lastError": None,
        "phaseHistory": [],
        "currentPhase": None,
        "lifecycle": None,
        "image": None,
        "test": None,
        "deploy": None,
        "resultDelivery": None,
    }
    base.update(overrides)
    return base


def _legacy_payload(**overrides):
    """Build a legacy preview-era payload (forward-compat input).

    Skill still accepts legacy keys to keep integrators working during
    the migration window. These tests stay aligned with that guarantee.
    """
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


class CanonicalPayloadTests(unittest.TestCase):
    """Canonical BuildStatusResponse payload path (lifecycle/image/test/deploy)."""

    def test_minimal_building_response(self) -> None:
        r = explain(_payload())
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["system"]["status"], "BUILDING")
        self.assertEqual(r.explanation["next_action"], "WAIT")
        self.assertFalse(r.explanation["is_terminal"])
        self.assertIsNone(r.explanation["error_summary"])
        self.assertTrue(len(r.explanation["user"]) > 0)
        self.assertTrue(len(r.explanation["agent"]) > 0)

    def test_all_in_flight_canonical_statuses_yield_wait(self) -> None:
        for s in (
            "RECEIVED",
            "QUEUED",
            "PREPARING_SOURCE",
            "BUILDING",
            "BUILD_SUCCESS",
            "TESTING",
            "DEPLOYING",
        ):
            r = explain(_payload(**{"build": {"status": s}}))
            self.assertTrue(r.ok, s)
            self.assertEqual(r.explanation["next_action"], "WAIT", s)
            self.assertFalse(r.explanation["is_terminal"], s)

    def test_test_success_yields_wait_with_runtime_url(self) -> None:
        # canonical TEST_SUCCESS block with a runtime hint in test.containerRef
        r = explain(
            _payload(
                **{"build": {"status": "TEST_SUCCESS"}},
                test={
                    "status": "SUCCESS",
                    "containerRunning": True,
                    "healthCheckPassed": True,
                    "portOpen": True,
                    "stabilityWindowPassed": True,
                    "containerRef": "test-deploy://b-1",
                },
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["system"]["status"], "TEST_SUCCESS")
        self.assertEqual(r.explanation["next_action"], "WAIT")
        self.assertIn("test-deploy://b-1", r.explanation["user"])

    def test_deploy_success_yields_open_deployment(self) -> None:
        r = explain(
            _payload(
                **{"build": {"status": "DEPLOY_SUCCESS"}},
                deploy={
                    "status": "SUCCESS",
                    "targetType": "HTTP_API",
                    "resultRef": "https://prod.example.com/b-1",
                },
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["system"]["status"], "DEPLOY_SUCCESS")
        self.assertEqual(r.explanation["next_action"], "OPEN_DEPLOYMENT")

    def test_completed_is_terminal_with_none_action(self) -> None:
        r = explain(_payload(**{"build": {"status": "COMPLETED"}}))
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "NONE")
        self.assertTrue(r.explanation["is_terminal"])

    def test_cancelled_is_terminal_with_none_action(self) -> None:
        r = explain(_payload(**{"build": {"status": "CANCELLED"}}))
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "NONE")
        self.assertTrue(r.explanation["is_terminal"])

    def test_test_failed_yields_retry(self) -> None:
        r = explain(
            _payload(
                **{"build": {"status": "TEST_SUCCESS"}},
                test={
                    "status": "FAILED",
                    "containerRunning": True,
                    "healthCheckPassed": False,
                    "portOpen": False,
                    "stabilityWindowPassed": False,
                },
            )
        )
        self.assertEqual(r.explanation["next_action"], "RETRY")
        self.assertIn("테스트", r.explanation["user"])


class FailedTerminalTests(unittest.TestCase):
    def test_failed_with_docker_build_failed_yields_fix_dockerfile(self) -> None:
        r = explain(
            _payload(
                **{
                    "build": {"status": "FAILED"},
                    "lastError": {"code": "DOCKER_BUILD_FAILED", "message": "build fail"},
                },
                logs={"tail": ["Step 1/3 : FROM node:20", "returned non-zero code: 1"]},
            )
        )
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "FIX_DOCKERFILE")
        self.assertTrue(r.explanation["is_terminal"])
        self.assertIsNotNone(r.explanation["error_summary"])
        self.assertIn("FROM node:20", r.explanation["error_summary"])

    def test_failed_with_preview_provision_failed_yields_fix_port(self) -> None:
        r = explain(
            _payload(
                **{
                    "build": {"status": "FAILED"},
                    "lastError": {"code": "PREVIEW_PROVISION_FAILED", "message": "..."},
                },
            )
        )
        self.assertEqual(r.explanation["next_action"], "FIX_PORT")
        self.assertTrue(r.explanation["is_terminal"])

    def test_failed_with_source_or_request_issue_yields_check_source(self) -> None:
        # INVALID_REQUEST 만 canonical error code 으로 남았고, SOURCE_ARCHIVE_NOT_FOUND
        # / DOCKERFILE_NOT_FOUND 는 legacy 10종 세트로 통합되지 않은 canonical 그룹.
        # canonical 코드 이름 매핑이 CHECK_SOURCE 가 되는 케이스만 검증한다.
        for code in ("INVALID_REQUEST",):
            r = explain(
                _payload(
                    **{
                        "build": {"status": "FAILED"},
                        "lastError": {"code": code, "message": "..."},
                    },
                )
            )
            self.assertEqual(r.explanation["next_action"], "CHECK_SOURCE", code)

    def test_failed_with_unknown_error_yields_contact_operator(self) -> None:
        r = explain(
            _payload(
                **{
                    "build": {"status": "FAILED"},
                    "lastError": {"code": "UNKNOWN_ERROR", "message": "..."},
                },
            )
        )
        self.assertEqual(r.explanation["next_action"], "CONTACT_OPERATOR")

    def test_failed_without_error_code_yields_contact_operator(self) -> None:
        r = explain(
            _payload(**{"build": {"status": "FAILED"}}, lastError=None)
        )
        self.assertEqual(r.explanation["next_action"], "CONTACT_OPERATOR")
        self.assertIsNone(r.explanation["error_summary"])


class LegacyCompatTests(unittest.TestCase):
    """Legacy preview-era payload path. Forward-compat shims must still work."""

    def test_legacy_status_in_flight_yields_wait(self) -> None:
        r = explain(_legacy_payload())
        self.assertTrue(r.ok)
        self.assertEqual(r.explanation["next_action"], "WAIT")

    def test_legacy_test_ready_with_ready_yields_open_deployment_alias(self) -> None:
        # TEST_READY (legacy) 는 canonical TEST_SUCCESS 로 forward-mapped 되어도
        # OPEN_DEPLOYMENT 는 아직 emit 하지 않는다 — TEST_SUCCESS 이므로 WAIT.
        # legacy `previewUrl` 도 user 메시지에 노출되어야 한다.
        r = explain(
            _legacy_payload(
                status="TEST_READY",
                testDeployment={"status": "READY", "previewUrl": "https://preview.example.com/x"},
            )
        )
        self.assertEqual(r.explanation["next_action"], "WAIT")
        self.assertIn("https://preview.example.com/x", r.explanation["user"])

    def test_legacy_completed_with_expired_preview_yields_retry(self) -> None:
        r = explain(
            _legacy_payload(
                status="COMPLETED",
                testDeployment={"status": "EXPIRED"},
            )
        )
        self.assertEqual(r.explanation["next_action"], "RETRY")
        self.assertTrue(r.explanation["is_terminal"])

    def test_legacy_test_deployment_invalid_type_errors(self) -> None:
        r = explain(_legacy_payload(testDeployment="not a dict"))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["field"] == "testDeployment" for e in r.errors))


class InputValidationTests(unittest.TestCase):
    def test_invalid_root_type(self) -> None:
        r = explain("not a dict")  # type: ignore[arg-type]
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_missing_status(self) -> None:
        data = _payload()
        del data["build"]["status"]
        r = explain(data)
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "MISSING_FIELD" and e["field"] == "status" for e in r.errors))

    def test_unknown_enum_status_yields_warning_and_not_ok(self) -> None:
        r = explain(_payload(**{"build": {"status": "MAGIC_STATE"}}))
        self.assertFalse(r.ok)
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "status" for w in r.warnings))
        self.assertEqual(r.explanation["next_action"], "NONE")

    def test_to_dict_has_ref_v2(self) -> None:
        r = explain(_payload())
        d = r.to_dict()
        self.assertEqual(
            set(d.keys()),
            {"ok", "explanation", "warnings", "errors", "ref"},
        )
        # TASK-061 bumped both contract_version and explanation_version to v2.
        self.assertEqual(d["ref"]["contract_version"], "v2")
        self.assertEqual(d["ref"]["explanation_version"], "v2")
        self.assertEqual(Explanation.explanation_version, "v2")


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
