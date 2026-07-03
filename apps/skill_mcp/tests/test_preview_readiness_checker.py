"""preview-readiness-checker skill tests.

TASK-033. 입력 검증 / readiness_state 분류 7종 / card 합성 / ttl / cli.
"""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apps.skill_mcp.skills.preview_readiness_checker import cli, core


# ---------------------------------------------------------------------------
# 1. Input validation
# ---------------------------------------------------------------------------

class InputValidationTests(unittest.TestCase):
    def test_non_dict_input(self):
        r = core.check_readiness("not a dict")
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_missing_build(self):
        r = core.check_readiness({})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")
        self.assertEqual(r.errors[0]["field"], "build")

    def test_build_without_status(self):
        r = core.check_readiness({"build": {"buildId": "b-1"}})
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")

    def test_build_non_dict_rejected(self):
        r = core.check_readiness({"build": "not a dict"})
        self.assertFalse(r.ok)

    def test_test_deployment_non_dict_warns(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": "not a dict",
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "testDeployment" for w in r.warnings))

    def test_health_probe_non_dict_warns(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "healthProbe": "not a dict",
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "healthProbe" for w in r.warnings))

    def test_ttl_non_dict_warns(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "ttl": "not a dict",
        })
        self.assertTrue(r.ok)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "ttl" for w in r.warnings))

    def test_build_id_must_be_string(self):
        r = core.check_readiness({
            "buildId": 12345,
            "build": {"status": "COMPLETED"},
        })
        self.assertTrue(r.ok)
        self.assertIsNone(r.build_id)
        self.assertTrue(any(w["code"] == "INVALID_INPUT" and w["field"] == "buildId" for w in r.warnings))


# ---------------------------------------------------------------------------
# 2. readiness_state classification
# ---------------------------------------------------------------------------

class ClassificationTests(unittest.TestCase):
    def test_queued_is_preparing(self):
        r = core.check_readiness({"build": {"status": "QUEUED"}})
        self.assertEqual(r.readiness_state, "PREPARING")
        self.assertEqual(r.card.next_action, "WAIT")

    def test_claimed_is_preparing(self):
        r = core.check_readiness({"build": {"status": "CLAIMED"}})
        self.assertEqual(r.readiness_state, "PREPARING")

    def test_building_with_phase_preparing(self):
        r = core.check_readiness({
            "build": {"status": "BUILDING", "currentPhase": "DOCKER_BUILD_STARTED"},
        })
        self.assertEqual(r.readiness_state, "PREPARING")

    def test_test_ready_no_test_deployment(self):
        r = core.check_readiness({"build": {"status": "TEST_READY"}})
        self.assertEqual(r.readiness_state, "STARTING")

    def test_completed_no_test_deployment_unknown(self):
        r = core.check_readiness({"build": {"status": "COMPLETED"}})
        self.assertEqual(r.readiness_state, "UNKNOWN")
        self.assertEqual(r.card.next_action, "NONE")

    def test_failed_build_is_degraded(self):
        r = core.check_readiness({"build": {"status": "FAILED"}})
        self.assertEqual(r.readiness_state, "DEGRADED")
        self.assertEqual(r.card.next_action, "RETRY")

    def test_cancelled_is_expired(self):
        r = core.check_readiness({"build": {"status": "CANCELLED"}})
        self.assertEqual(r.readiness_state, "EXPIRED")

    def test_preview_queued_is_waiting(self):
        r = core.check_readiness({
            "build": {"status": "TEST_READY"},
            "testDeployment": {"status": "QUEUED"},
        })
        self.assertEqual(r.readiness_state, "WAITING_FOR_SLOT")

    def test_preview_provisioning_is_starting(self):
        r = core.check_readiness({
            "build": {"status": "TEST_READY"},
            "testDeployment": {"status": "PROVISIONING"},
        })
        self.assertEqual(r.readiness_state, "STARTING")

    def test_preview_reserved_is_starting(self):
        r = core.check_readiness({
            "build": {"status": "TEST_READY"},
            "testDeployment": {"status": "RESERVED"},
        })
        self.assertEqual(r.readiness_state, "STARTING")

    def test_preview_ready_no_probe_is_ready(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {
                "status": "READY",
                "previewUrl": "http://preview.example.com:38124",
            },
        })
        self.assertEqual(r.readiness_state, "READY")
        # TASK-061: OPEN_PREVIEW → OPEN_DEPLOYMENT
        self.assertEqual(r.card.next_action, "OPEN_DEPLOYMENT")
        self.assertEqual(r.card.subtitle, "http://preview.example.com:38124")

    def test_preview_ready_with_unhealthy_probe_is_degraded(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
            "healthProbe": {"status": "unhealthy"},
        })
        self.assertEqual(r.readiness_state, "DEGRADED")
        self.assertEqual(r.card.next_action, "RETRY")

    def test_preview_ready_with_healthy_probe_is_ready(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
            "healthProbe": {"status": "healthy"},
        })
        self.assertEqual(r.readiness_state, "READY")

    def test_preview_failed_is_degraded(self):
        r = core.check_readiness({
            "build": {"status": "TEST_READY"},
            "testDeployment": {"status": "FAILED"},
        })
        self.assertEqual(r.readiness_state, "DEGRADED")

    def test_preview_expired(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "EXPIRED"},
        })
        self.assertEqual(r.readiness_state, "EXPIRED")

    def test_preview_stopped_is_expired(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "STOPPED"},
        })
        self.assertEqual(r.readiness_state, "EXPIRED")

    def test_preview_not_requested_is_expired(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "NOT_REQUESTED"},
        })
        self.assertEqual(r.readiness_state, "EXPIRED")

    def test_unknown_build_status_warns(self):
        r = core.check_readiness({"build": {"status": "WEIRD_STATE"}})
        self.assertEqual(r.readiness_state, "UNKNOWN")
        self.assertTrue(any(w["code"] == "UNKNOWN_ENUM" and w["field"] == "build.status" for w in r.warnings))


# ---------------------------------------------------------------------------
# 3. card content per state
# ---------------------------------------------------------------------------

class CardContentTests(unittest.TestCase):
    def test_ready_card_has_url_subtitle(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {
                "status": "READY",
                "previewUrl": "http://example.com:12345",
            },
        })
        # TASK-061: card title evolved from "미리보기 주소" to "테스트 컨테이너"
        self.assertIn("테스트 컨테이너", r.card.title)
        self.assertEqual(r.card.subtitle, "http://example.com:12345")
        self.assertIn("결과", r.card.body)

    def test_non_ready_card_has_empty_subtitle(self):
        r = core.check_readiness({
            "build": {"status": "QUEUED"},
        })
        self.assertEqual(r.card.subtitle, "")

    def test_subtitle_only_when_url_string(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": 12345},
        })
        # previewUrl 이 string 아니면 subtitle 빈
        self.assertEqual(r.card.subtitle, "")

    def test_all_states_have_card(self):
        cases = [
            {"build": {"status": "QUEUED"}},
            {"build": {"status": "CLAIMED"}},
            {"build": {"status": "BUILDING"}},
            {"build": {"status": "TEST_READY"}},
            {"build": {"status": "FAILED"}},
            {"build": {"status": "CANCELLED"}},
            {"build": {"status": "COMPLETED"}},
            {"build": {"status": "COMPLETED"}, "testDeployment": {"status": "QUEUED"}},
            {"build": {"status": "COMPLETED"}, "testDeployment": {"status": "READY"}},
            {"build": {"status": "COMPLETED"}, "testDeployment": {"status": "EXPIRED"}},
        ]
        for c in cases:
            with self.subTest(c=c):
                r = core.check_readiness(c)
                self.assertTrue(r.card.title, msg=f"empty title for {c}")
                self.assertTrue(r.card.body, msg=f"empty body for {c}")
                self.assertIn(r.card.next_action, core.NEXT_ACTIONS)
                self.assertIn(r.readiness_state, core.READINESS_STATES)


# ---------------------------------------------------------------------------
# 4. ttl
# ---------------------------------------------------------------------------

class TtlTests(unittest.TestCase):
    def test_ttl_from_ttl_block(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
            "ttl": {"ttl_remaining_seconds": 3300},
        })
        self.assertEqual(r.card.ttl_remaining_seconds, 3300)

    def test_ttl_invalid_ignored(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
            "ttl": {"ttl_remaining_seconds": -10},
        })
        self.assertIsNone(r.card.ttl_remaining_seconds)

    def test_ttl_non_int_ignored(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
            "ttl": {"ttl_remaining_seconds": "3300"},
        })
        self.assertIsNone(r.card.ttl_remaining_seconds)

    def test_expires_at_only_does_not_compute(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://...", "expiresAt": "2026-07-03T02:03:00Z"},
        })
        # now 가 없으면 ttl 계산 X
        self.assertIsNone(r.card.ttl_remaining_seconds)


# ---------------------------------------------------------------------------
# 5. buildId propagation
# ---------------------------------------------------------------------------

class BuildIdTests(unittest.TestCase):
    def test_build_id_from_top_level(self):
        r = core.check_readiness({
            "buildId": "b-top",
            "build": {"status": "COMPLETED"},
        })
        self.assertEqual(r.build_id, "b-top")

    def test_build_id_from_build_object(self):
        r = core.check_readiness({
            "build": {"buildId": "b-build", "status": "COMPLETED"},
        })
        self.assertEqual(r.build_id, "b-build")

    def test_top_level_overrides_build_object(self):
        r = core.check_readiness({
            "buildId": "b-top",
            "build": {"buildId": "b-build", "status": "COMPLETED"},
        })
        self.assertEqual(r.build_id, "b-top")


# ---------------------------------------------------------------------------
# 6. Result envelope
# ---------------------------------------------------------------------------

class ResultEnvelopeTests(unittest.TestCase):
    def test_to_dict_shape(self):
        r = core.check_readiness({
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://..."},
        })
        d = r.to_dict()
        for k in ("ok", "readiness_state", "card", "buildId", "warnings", "errors", "ref"):
            self.assertIn(k, d)
        for ck in ("title", "subtitle", "body", "ttl_remaining_seconds", "next_action"):
            self.assertIn(ck, d["card"])
        self.assertEqual(d["ref"]["contract_doc"], "docs/sdlc/contracts/01-shared-build-contract-baseline.md")
        self.assertEqual(d["ref"]["design_doc"], "docs/sdlc/design/06-user-messaging-and-failure-handling.md")
        self.assertEqual(d["ref"]["skill_version"], "v2")


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
            "build": {"status": "COMPLETED"},
            "testDeployment": {"status": "READY", "previewUrl": "http://example.com:38124"},
        }))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), mock.patch("sys.stdin", stdin):
            rc = cli.main(["--input", "-"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertEqual(out["readiness_state"], "READY")
        self.assertEqual(out["card"]["subtitle"], "http://example.com:38124")

    def test_cli_strict_exits_2_on_invalid(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main(["--strict"])  # stdin = {} → MISSING_FIELD
        self.assertEqual(rc, 2)
        out = json.loads(buf.getvalue())
        self.assertFalse(out["ok"])

    def test_cli_output_file(self):
        inp = self._write("in.json", json.dumps({
            "build": {"status": "FAILED"},
        }))
        out_p = Path(self.tmp.name) / "out.json"
        rc = cli.main(["--input", str(inp), "--output", str(out_p)])
        self.assertEqual(rc, 0)
        data = json.loads(out_p.read_text(encoding="utf-8"))
        self.assertEqual(data["readiness_state"], "DEGRADED")
        self.assertEqual(data["card"]["next_action"], "RETRY")

    def test_cli_invalid_input_json_exits_nonzero(self):
        inp = self._write("bad.json", "{not json")
        with self.assertRaises(SystemExit):
            cli.main(["--input", str(inp)])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
