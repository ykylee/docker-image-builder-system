"""failure-summary MCP tests.

TASK-032. thin wrapper — shape() 위임 / dry-run / fixture / cli / envelope.
"""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apps.skill_mcp.mcp_servers.failure_summary import cli, core


# ---------------------------------------------------------------------------
# 1. Input validation
# ---------------------------------------------------------------------------

class InputValidationTests(unittest.TestCase):
    def test_non_dict_input(self):
        r = core.summarize("not a dict")
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_dry_run_without_failure(self):
        r = core.summarize({"dryRun": True, "fixture": {}})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")

    def test_dry_run_fixture_must_be_dict(self):
        r = core.summarize({"dryRun": True, "fixture": ["list", "not", "dict"]})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")
        self.assertEqual(r.errors[0]["field"], "fixture")

    def test_dry_run_fixture_str_rejected(self):
        r = core.summarize({"dryRun": True, "fixture": "not a json dict"})
        self.assertFalse(r.ok)


# ---------------------------------------------------------------------------
# 2. Delegation to failure-summary-shaper
# ---------------------------------------------------------------------------

class DelegationTests(unittest.TestCase):
    def test_delegates_basic_failure(self):
        r = core.summarize({
            "buildId": "b-1",
            "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")
        self.assertEqual(r.build_id, "b-1")
        self.assertIn("이미지", r.cause)

    def test_delegates_preview_only(self):
        # TASK-061: legacy `previewFailure` (preview-era) 은 canonical
        # `stage: TEST` 로 forward-mapped. PREVIEW_CONTAINER_START_FAILED
        # 같은 legacy error code 는 canonical ERROR_CODES 8종 union 밖 → warning.
        r = core.summarize({
            "previewFailure": {"errorCode": "PREVIEW_CONTAINER_START_FAILED", "nextAction": "RETRY"},
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.stage, "TEST")
        self.assertEqual(r.next_action, "RETRY")
        # unknown legacy errorCode 는 warning 으로 노출
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "errorCode" for w in r.warnings))

    def test_dry_run_with_dict_fixture(self):
        fixture = {
            "buildId": "b-fix",
            "failure": {"errorCode": "INTERNAL_ERROR", "nextAction": "CONTACT_OPERATOR"},
        }
        r = core.summarize({"dryRun": True, "fixture": fixture})
        self.assertTrue(r.ok)
        self.assertEqual(r.build_id, "b-fix")
        self.assertEqual(r.next_action, "CONTACT_OPERATOR")

    def test_dry_run_overrides_top_level_failure(self):
        # dryRun=true 면 fixture 가 본 입력. top-level failure 가 있어도 무시됨.
        r = core.summarize({
            "dryRun": True,
            "fixture": {
                "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
            },
            "failure": {"errorCode": "INTERNAL_ERROR", "nextAction": "CONTACT_OPERATOR"},
        })
        self.assertTrue(r.ok)
        self.assertEqual(r.next_action, "FIX_DOCKERFILE")

    def test_warnings_passthrough(self):
        r = core.summarize({
            "failure": {
                "source": "weird",
                "errorCode": "MYSTERY_CODE",
                "nextAction": "WEIRD_ACTION",
            },
        })
        self.assertTrue(r.ok)
        # unknown source + unknown errorCode + unknown nextAction → 3 warnings
        codes = [w["code"] for w in r.warnings]
        self.assertIn("UNKNOWN_ENUM", codes)

    def test_build_server_url_ignored_with_warning(self):
        r = core.summarize({
            "buildServerUrl": "https://example.com",
            "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "UNUSED_FIELD" for w in r.warnings))


# ---------------------------------------------------------------------------
# 3. Result envelope
# ---------------------------------------------------------------------------

class ResultEnvelopeTests(unittest.TestCase):
    def test_to_dict_shape(self):
        r = core.summarize({
            "stage": "BUILD",
            "error": {"code": "DOCKER_BUILD_FAILED", "message": "..."},
            "nextAction": "FIX_DOCKERFILE",
        })
        d = r.to_dict()
        for k in ("ok", "summary", "cause", "next_step", "buildId",
                  "logs_excerpt", "next_action", "stage", "error_code",
                  "warnings", "errors", "ref"):
            self.assertIn(k, d, msg=f"missing key {k}")
        self.assertEqual(d["ref"]["design_doc"], "docs/sdlc/design/06-user-messaging-and-failure-handling.md")
        self.assertEqual(d["ref"]["skill_doc"], "apps/skill_mcp/skills/failure_summary_shaper/SKILL.md")
        # TASK-061 bumped MCP_VERSION to v2.
        self.assertEqual(d["ref"]["mcp_version"], "v2")


# ---------------------------------------------------------------------------
# 4. cli.main
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
            "failure": {"errorCode": "DOCKER_BUILD_FAILED", "nextAction": "FIX_DOCKERFILE"},
        }))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), mock.patch("sys.stdin", stdin):
            rc = cli.main(["--input", "-"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertTrue(out["ok"])
        self.assertEqual(out["next_action"], "FIX_DOCKERFILE")

    def test_cli_dry_run_with_dict_fixture(self):
        inp = self._write("in.json", json.dumps({}))
        fix = self._write("fix.json", json.dumps({
            "failure": {"errorCode": "INTERNAL_ERROR", "nextAction": "CONTACT_OPERATOR"},
        }))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["--input", str(inp), "--dry-run", "--fixture", str(fix)])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertTrue(out["ok"])
        self.assertEqual(out["next_action"], "CONTACT_OPERATOR")

    def test_cli_dry_run_with_list_fixture_rejected(self):
        inp = self._write("in.json", json.dumps({}))
        fix = self._write("fix.json", json.dumps(["not", "a", "dict"]))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["--input", str(inp), "--dry-run", "--fixture", str(fix), "--strict"])
        self.assertEqual(rc, 2)
        out = json.loads(buf.getvalue())
        self.assertFalse(out["ok"])

    def test_cli_strict_exits_2_on_invalid(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["--strict"])  # stdin = {} → MISSING_FIELD
        self.assertEqual(rc, 2)

    def test_cli_output_file(self):
        inp = self._write("in.json", json.dumps({
            "failure": {"errorCode": "INTERNAL_ERROR", "nextAction": "CONTACT_OPERATOR"},
        }))
        out_p = Path(self.tmp.name) / "out.json"
        rc = cli.main(["--input", str(inp), "--output", str(out_p)])
        self.assertEqual(rc, 0)
        data = json.loads(out_p.read_text(encoding="utf-8"))
        self.assertEqual(data["next_action"], "CONTACT_OPERATOR")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
