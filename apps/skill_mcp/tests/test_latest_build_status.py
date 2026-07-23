"""latest-build-status core / cli 단위 테스트.

`python3 -m unittest apps.skill_mcp.tests.test_latest_build_status` 로 실행.

HTTP 호출은 dryRun=true + fixture 로만 검증한다. live 호출은
unittest.mock 으로 urllib.request.urlopen 을 패치해 본다.
"""

from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from apps.skill_mcp.mcp_servers.latest_build_status import (
    LatestBuildResult,
    fetch_latest,
)
from apps.skill_mcp.mcp_servers.latest_build_status.cli import main as cli_main
from apps.skill_mcp.mcp_servers.latest_build_status.core import (
    _normalize_build,
    _pick_latest_build,
)


def _build_payload(**overrides):
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


def _list_response(*builds):
    """목록 endpoint 가 `{ "builds": [...] }` 형태라고 가정."""
    return {"builds": list(builds)}


class NormalizeBuildTests(unittest.TestCase):
    def test_unwrap_data_key(self) -> None:
        wrapped = {"data": _build_payload(), "traceId": "t-1"}
        out = _normalize_build(wrapped)
        self.assertEqual(out["buildId"], "b-1")
        self.assertNotIn("traceId", out)

    def test_unwrap_build_key(self) -> None:
        out = _normalize_build({"build": _build_payload()})
        self.assertEqual(out["status"], "BUILDING")

    def test_top_level_passthrough(self) -> None:
        out = _normalize_build(_build_payload())
        self.assertEqual(out["buildId"], "b-1")
        self.assertEqual(out["status"], "BUILDING")

    def test_non_dict_returns_none(self) -> None:
        self.assertIsNone(_normalize_build(None))
        self.assertIsNone(_normalize_build("not a dict"))
        self.assertIsNone(_normalize_build(123))


class PickLatestBuildTests(unittest.TestCase):
    def test_pick_active_over_terminal(self) -> None:
        builds = [
            _build_payload(buildId="b-old", status="FAILED"),
            _build_payload(buildId="b-new", status="BUILDING", createdAt="2026-07-03T02:00:00Z"),
            _build_payload(buildId="b-mid", status="COMPLETED", createdAt="2026-07-03T01:00:00Z"),
        ]
        chosen = _pick_latest_build(builds)
        self.assertEqual(chosen["buildId"], "b-new")

    def test_fallback_to_terminal_when_no_active(self) -> None:
        builds = [
            _build_payload(buildId="b-1", status="FAILED", createdAt="2026-07-03T01:00:00Z"),
            _build_payload(buildId="b-2", status="COMPLETED", createdAt="2026-07-03T02:00:00Z"),
        ]
        chosen = _pick_latest_build(builds)
        self.assertEqual(chosen["buildId"], "b-2")

    def test_empty_list_returns_none(self) -> None:
        self.assertIsNone(_pick_latest_build([]))


class FetchLatestCoreTests(unittest.TestCase):
    def test_dry_run_with_buildId(self) -> None:
        result = fetch_latest(
            {"buildId": "b-1", "dryRun": True, "fixture": _build_payload()}
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.build["buildId"], "b-1")
        self.assertEqual(result.explanation["next_action"], "WAIT")
        self.assertEqual(result.explanation["user"].startswith("지금"), True)

    def test_dry_run_with_userId_appName_picks_active(self) -> None:
        fixture = _list_response(
            _build_payload(buildId="b-1", status="FAILED", createdAt="2026-07-03T01:00:00Z"),
            _build_payload(buildId="b-2", status="BUILDING", createdAt="2026-07-03T02:00:00Z"),
        )
        result = fetch_latest(
            {"userId": "u-1", "appName": "demo-app", "dryRun": True, "fixture": fixture}
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.build["buildId"], "b-2")

    def test_dry_run_with_only_terminal_picks_latest_terminal(self) -> None:
        fixture = _list_response(
            _build_payload(buildId="b-1", status="FAILED", createdAt="2026-07-03T01:00:00Z"),
            _build_payload(buildId="b-2", status="COMPLETED", createdAt="2026-07-03T02:00:00Z"),
        )
        result = fetch_latest(
            {"userId": "u-1", "appName": "demo-app", "dryRun": True, "fixture": fixture}
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.build["buildId"], "b-2")

    def test_missing_buildId_and_user_app(self) -> None:
        result = fetch_latest({})
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "MISSING_FIELD" and e["field"] == "<root>" for e in result.errors)
        )

    def test_build_id_priority_over_user_app(self) -> None:
        # 둘 다 주어지면 buildId 가 단건 호출로 사용되어야 함. fixture 로 검증.
        result = fetch_latest(
            {
                "buildId": "b-1",
                "userId": "u-1",
                "appName": "demo-app",
                "dryRun": True,
                "fixture": _build_payload(
                    buildId="b-1",
                    status="COMPLETED",
                    testDeployment={"status": "READY", "previewUrl": "https://p/x"},
                ),
            }
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.build["buildId"], "b-1")
        # TASK-061: legacy testDeployment { status: READY } forward-maps to
        # canonical { test: { status: SUCCESS } } which under
        # COMPLETED+test.SUCCESS yields next_action=NONE (terminal posture).
        # The legacy OPEN_PREVIEW emit is retired.
        self.assertNotEqual(result.explanation["next_action"], "OPEN_PREVIEW")

    def test_dry_run_without_fixture_errors(self) -> None:
        result = fetch_latest({"buildId": "b-1", "dryRun": True})
        self.assertFalse(result.ok)
        self.assertTrue(any(e["field"] == "fixture" for e in result.errors))

    def test_build_not_found_via_http_404(self) -> None:
        fake_resp = mock.MagicMock()
        fake_resp.getcode.return_value = 404
        fake_resp.read.return_value = b""
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = lambda s, *a: False
        with mock.patch(
            "urllib.request.urlopen", return_value=fake_resp
        ):
            result = fetch_latest(
                {"buildId": "b-404", "buildServerUrl": "https://x"}
            )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "BUILD_NOT_FOUND" for e in result.errors)
        )

    def test_build_server_5xx_errors(self) -> None:
        fake_resp = mock.MagicMock()
        fake_resp.getcode.return_value = 503
        fake_resp.read.return_value = b"oops"
        fake_resp.__enter__ = lambda s: s
        fake_resp.__exit__ = lambda s, *a: False
        with mock.patch(
            "urllib.request.urlopen", return_value=fake_resp
        ):
            result = fetch_latest(
                {"buildId": "b-1", "buildServerUrl": "https://x"}
            )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "BUILD_SERVER_ERROR" for e in result.errors)
        )

    def test_unreachable_build_server(self) -> None:
        with mock.patch(
            "urllib.request.urlopen", side_effect=OSError("dns fail")
        ):
            result = fetch_latest(
                {"buildId": "b-1", "buildServerUrl": "https://x"}
            )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(e["code"] == "BUILD_SERVER_UNREACHABLE" for e in result.errors)
        )

    def test_url_encodes_userId_and_appName(self) -> None:
        captured: dict = {}

        class _Resp:
            def getcode(self_inner) -> int:
                return 200

            def read(self_inner) -> bytes:
                return json.dumps({"builds": [_build_payload()]}).encode("utf-8")

            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a) -> bool:
                return False

        def _fake_urlopen(req, timeout=None):  # noqa: ARG001
            captured["url"] = req.full_url
            return _Resp()

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
            result = fetch_latest(
                {"userId": "u with space", "appName": "demo app", "buildServerUrl": "https://x"}
            )
        self.assertTrue(result.ok)
        self.assertIn("userId=u+with+space", captured["url"])
        self.assertIn("appName=demo+app", captured["url"])

    def test_to_dict_ref_has_mcp_version(self) -> None:
        result = fetch_latest(
            {"buildId": "b-1", "dryRun": True, "fixture": _build_payload()}
        )
        d = result.to_dict()
        # TASK-061: MCP_VERSION bumped to v2.
        self.assertEqual(d["ref"]["mcp_version"], "v2")
        self.assertEqual(
            d["ref"]["contract_doc"],
            "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
        )


class CliTests(unittest.TestCase):
    def _write(self, path: Path, obj) -> None:
        path.write_text(json.dumps(obj))

    def test_cli_dry_run_with_fixture_ok(self) -> None:
        in_p = Path("apps/skill_mcp/tests/_tmp_lbs_in.json")
        fx_p = Path("apps/skill_mcp/tests/_tmp_lbs_fx.json")
        self._write(in_p, {"buildId": "b-1"})
        self._write(fx_p, _build_payload())
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(
                    ["--input", str(in_p), "--dry-run", "--fixture", str(fx_p)]
                )
            out = buf.getvalue()
        finally:
            in_p.unlink(missing_ok=True)
            fx_p.unlink(missing_ok=True)
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])
        self.assertEqual(data["build"]["buildId"], "b-1")

    def test_cli_strict_returns_2_on_build_not_found(self) -> None:
        # dry-run + 빈 목록 fixture: BUILD_NOT_FOUND 가 떠서 ok=false → strict exit=2.
        in_p = Path("apps/skill_mcp/tests/_tmp_lbs_in2.json")
        fx_p = Path("apps/skill_mcp/tests/_tmp_lbs_fx2.json")
        self._write(in_p, {"userId": "u-1", "appName": "demo-app"})
        self._write(fx_p, {"builds": []})
        try:
            with redirect_stdout(io.StringIO()):
                rc = cli_main(
                    [
                        "--input",
                        str(in_p),
                        "--dry-run",
                        "--fixture",
                        str(fx_p),
                        "--strict",
                    ]
                )
        finally:
            in_p.unlink(missing_ok=True)
            fx_p.unlink(missing_ok=True)
        self.assertEqual(rc, 2)

    def test_cli_stdin_dry_run(self) -> None:
        in_payload = {"buildId": "b-1", "dryRun": True, "fixture": _build_payload()}
        original = sys.stdin
        sys.stdin = io.StringIO(json.dumps(in_payload))
        try:
            with redirect_stdout(io.StringIO()) as buf:
                rc = cli_main(["--input", "-"])
            out = buf.getvalue()
        finally:
            sys.stdin = original
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])


class CanonicalEnvelopeTests(unittest.TestCase):
    """TASK-163 (P2-M4): 실서버가 주는 canonical BuildStatusResponse 모양.

    `verify-live-server.sh` 가 잡은 결함 2건의 회귀 가드다. 기존 단위
    테스트는 전부 **평평한** fixture 를 넣고 있어서 둘 다 못 잡았다.
    """

    CANONICAL = {
        "build": {
            "buildId": "b-canon",
            "appName": "demo",
            "status": "TEST_SUCCESS",
            "phase": "CONTAINER_TEST_PASSED",
            "runtimeUrl": "http://127.0.0.1:38124/",
            "createdAt": "2026-07-23T01:00:00.000Z",
            "updatedAt": "2026-07-23T01:03:00.000Z",
        },
        "lastError": None,
        "currentPhase": {
            "phase": "CONTAINER_TEST_PASSED",
            "startedAt": "2026-07-23T01:02:00.000Z",
        },
        "test": {
            "status": "SUCCESS",
            "containerRunning": True,
            "healthCheckPassed": True,
            "portOpen": True,
            "stabilityWindowPassed": True,
        },
        "deploy": {"status": "NOT_STARTED", "targetType": None, "resultRef": None},
        "resultDelivery": {"status": "NOT_STARTED", "mode": None},
    }

    def test_sibling_blocks_survive_normalization(self) -> None:
        # 이전 구현은 `build` 를 전송 envelope 처럼 unwrap 해서 형제 블록을
        # 전부 잃었다 — MCP 소비자가 test/deploy/lastError 를 볼 수 없었다.
        r = fetch_latest({
            "buildId": "b-canon",
            "dryRun": True,
            "fixture": self.CANONICAL,
        })
        self.assertTrue(r.ok, r.errors)
        build = r.build or {}
        self.assertEqual(build.get("buildId"), "b-canon")
        self.assertEqual(build.get("test", {}).get("status"), "SUCCESS")
        self.assertIn("deploy", build)
        self.assertIn("resultDelivery", build)

    def test_runtime_url_is_preserved(self) -> None:
        # `runtimeUrl` 이 보존 키 목록에 없어서 "앱이 어디서 도는지" 를
        # MCP 소비자가 영영 볼 수 없었다.
        r = fetch_latest({
            "buildId": "b-canon",
            "dryRun": True,
            "fixture": self.CANONICAL,
        })
        self.assertEqual((r.build or {}).get("runtimeUrl"), "http://127.0.0.1:38124/")

    def test_object_current_phase_does_not_crash(self) -> None:
        # canonical `currentPhase` 는 객체다. 문자열만 가정하던 explainer 가
        # TypeError 로 죽었고, MCP 가 그 필드를 버리고 있어 가려져 있었다.
        r = fetch_latest({
            "buildId": "b-canon",
            "dryRun": True,
            "fixture": self.CANONICAL,
        })
        self.assertTrue(r.ok, r.errors)
        self.assertFalse(
            [w for w in r.warnings if w.get("code") == "UNKNOWN_ENUM"],
            f"canonical payload should not produce UNKNOWN_ENUM warnings: {r.warnings}",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
