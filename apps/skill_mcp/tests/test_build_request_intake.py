"""build-request-intake core / cli 단위 테스트.

`python3 -m unittest apps.skill_mcp.tests.test_build_request_intake` 로 실행.
"""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from apps.skill_mcp.skills.build_request_intake import ShapeResult, shape
from apps.skill_mcp.skills.build_request_intake.cli import main as cli_main


class ShapeCoreTests(unittest.TestCase):
    def test_minimal_valid_input(self) -> None:
        result = shape(
            {
                "userId": "u-1",
                "appName": "demo-app",
                "sourceRef": "git+ssh://example/repo.git@v1",
                "env": {},
            }
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.warnings, [])
        self.assertEqual(result.errors, [])
        self.assertEqual(
            result.payload,
            {
                "userId": "u-1",
                "appName": "demo-app",
                "sourceRef": "git+ssh://example/repo.git@v1",
                "env": {},
            },
        )
        # key 순서 고정
        self.assertEqual(
            list(result.payload.keys()),
            ["userId", "appName", "sourceRef", "env"],
        )

    def test_missing_required_fields_yield_errors(self) -> None:
        result = shape({})
        # SKILL.md §4: MISSING_FIELD 는 warnings 와 errors 양쪽에 표기, ok=false.
        self.assertFalse(result.ok)
        err_codes = {(e["code"], e["field"]) for e in result.errors}
        for field_name in ("userId", "appName", "sourceRef"):
            self.assertIn(("MISSING_FIELD", field_name), err_codes)
        warn_codes = {(w["code"], w["field"]) for w in result.warnings}
        for field_name in ("userId", "appName", "sourceRef"):
            self.assertIn(("MISSING_FIELD", field_name), warn_codes)

    def test_app_name_lowercased_normalization(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "Demo-App",
                "sourceRef": "x",
                "env": {},
            }
        )
        # 정규식 위반: 대문자 포함 → INVALID_APP_NAME
        self.assertFalse(result.ok)
        self.assertTrue(any(e["code"] == "INVALID_APP_NAME" for e in result.errors))

    def test_app_name_invalid_chars(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo_app!",
                "sourceRef": "x",
                "env": {},
            }
        )
        self.assertFalse(result.ok)
        self.assertTrue(any(e["code"] == "INVALID_APP_NAME" for e in result.errors))

    def test_env_value_must_be_string(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {"PORT": 8080},  # type: ignore[dict-item]
            }
        )
        self.assertTrue(result.ok)  # warning 만, error 아님
        self.assertTrue(any(w["code"] == "INVALID_ENV_VALUE" for w in result.warnings))
        self.assertEqual(result.payload["env"]["PORT"], "8080")

    def test_env_key_lowercase_warns_but_kept(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {"port": "8080"},
            }
        )
        self.assertTrue(result.ok)
        self.assertTrue(any(w["code"] == "INVALID_ENV_KEY" for w in result.warnings))
        self.assertIn("port", result.payload["env"])

    def test_env_must_be_object(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": "not-an-object",  # type: ignore[dict-item]
            }
        )
        self.assertFalse(result.ok)
        self.assertTrue(any(e["code"] == "INVALID_ENV" for e in result.errors))

    def test_service_database_connection_values_are_rejected(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {"DATABASE_URL": "postgres://user:password@db/app"},
            }
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "SERVICE_DATABASE_POLICY_VIOLATION" for e in result.errors)
        )

    def test_dockerfile_override_cannot_declare_service_database(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {},
                "dockerfileOverride": "FROM node:22\nENV DB_HOST=postgres\n",
            }
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "SERVICE_DATABASE_POLICY_VIOLATION" for e in result.errors)
        )

    def test_unknown_top_level_fields_go_to_extra(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {},
                "dockerfileOverride": "FROM node:20",
                "previewTtlSeconds": 3600,
            }
        )
        self.assertTrue(result.ok)
        self.assertIn("extra", result.payload)
        self.assertEqual(
            result.payload["extra"]["dockerfileOverride"], "FROM node:20"
        )
        self.assertEqual(result.payload["extra"]["previewTtlSeconds"], 3600)
        self.assertTrue(
            any(w["code"] == "UNKNOWN_FIELD" and w["field"] == "dockerfileOverride" for w in result.warnings)
        )

    def test_invalid_input_type(self) -> None:
        result = shape("not a dict")  # type: ignore[arg-type]
        self.assertFalse(result.ok)
        self.assertEqual(len(result.errors), 1)
        self.assertEqual(result.errors[0]["code"], "INVALID_INPUT")

    def test_string_trimming(self) -> None:
        result = shape(
            {
                "userId": "  u-1  ",
                "appName": "  demo-app  ",
                "sourceRef": "  ref  ",
                "env": {},
            }
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.payload["userId"], "u-1")
        self.assertEqual(result.payload["appName"], "demo-app")
        self.assertEqual(result.payload["sourceRef"], "ref")

    def test_to_dict_shape(self) -> None:
        result = shape(
            {
                "userId": "u",
                "appName": "demo-app",
                "sourceRef": "x",
                "env": {},
            }
        )
        d = result.to_dict()
        self.assertEqual(
            set(d.keys()),
            {"ok", "payload", "warnings", "errors", "ref"},
        )
        self.assertEqual(d["ref"]["contract_version"], "v1")
        self.assertEqual(
            d["ref"]["contract_doc"],
            "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
        )


class CliTests(unittest.TestCase):
    def test_cli_stdin_valid(self) -> None:
        # stdin 으로 JSON 을 받는 경로. sys.stdin 을 StringIO 로 패치.
        import sys as _sys
        payload_in = json.dumps(
            {
                "userId": "u-1",
                "appName": "demo-app",
                "sourceRef": "ref",
                "env": {"PORT": "8080"},
            }
        )
        original_stdin = _sys.stdin
        _sys.stdin = io.StringIO(payload_in)
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(["--input", "-"])
            out = buf.getvalue()
        finally:
            _sys.stdin = original_stdin
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])
        self.assertEqual(data["payload"]["userId"], "u-1")

    def test_cli_with_file_input(self) -> None:
        tmp_path = Path("apps/skill_mcp/tests/_tmp_input.json")
        tmp_path.write_text(
            json.dumps(
                {
                    "userId": "u-1",
                    "appName": "demo-app",
                    "sourceRef": "ref",
                    "env": {},
                }
            )
        )
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(["--input", str(tmp_path)])
            out = buf.getvalue()
            self.assertEqual(rc, 0)
            data = json.loads(out)
            self.assertTrue(data["ok"])
        finally:
            tmp_path.unlink(missing_ok=True)

    def test_cli_strict_mode_returns_2_on_error(self) -> None:
        tmp_path = Path("apps/skill_mcp/tests/_tmp_bad.json")
        tmp_path.write_text(json.dumps({}))
        try:
            with redirect_stdout(io.StringIO()):
                rc = cli_main(["--input", str(tmp_path), "--strict"])
            self.assertEqual(rc, 2)
        finally:
            tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
