"""build-log-tail MCP tests.

TASK-029. stdio transport 가 아직 없으므로 core.tail() / cli.main() 만 검증한다.
분기 커버리지:
- 입력 검증: buildId 누락, tail 음수/5000 초과/비정수, since 빈 문자열 무시
- dry-run + fixture list / str(dict-JSON) / dict / str(NDJSON) / str(plain) 처리
- 응답 형식: JSON {lines:[]}, JSON top-level array, NDJSON, plain text
- tail 자르기: 200줄 fixture에서 tail=10 -> 마지막 10줄
- next_since 합성: Build Server 응답에 없을 때 sha1[:8]:N 포맷
- HTTP 404 -> BUILD_NOT_FOUND, 5xx -> BUILD_SERVER_ERROR,
  URLError/OSError/TimeoutError -> BUILD_SERVER_UNREACHABLE
- URL 인코딩: buildId / since / tail query string 검증
- since 가 query string 으로 전달되는지
- live 응답에서 next_since 가 있으면 그대로 사용
- dry-run 에서 buildId 가 dict fixture 와 함께 잘못 호출되어도 dry-run 분기 우선
- cli: --input / --output / --dry-run / --fixture / --tail / --since / --build-server-url / --strict
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from apps.skill_mcp.mcp_servers.build_log_tail import cli, core


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _ok_input(**overrides):
    base = {
        "buildId": "b-1",
        "buildServerUrl": "https://build.example.com",
    }
    base.update(overrides)
    return base


def _fake_resp(status: int, body: bytes):
    """urllib response context manager mock."""

    class _R:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def getcode(self):
            return status

        def read(self):
            return body

    return _R()


# ---------------------------------------------------------------------------
# 1. input validation
# ---------------------------------------------------------------------------

class InputValidationTests(unittest.TestCase):
    def test_non_dict_input_returns_invalid(self):
        r = core.tail("not a dict")
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_missing_build_id(self):
        r = core.tail({"buildServerUrl": "https://build.example.com"})
        self.assertFalse(r.ok)
        codes = [e["code"] for e in r.errors]
        self.assertIn("MISSING_FIELD", codes)

    def test_missing_build_server_url_when_live(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            r = core.tail({"buildId": "b-1"})
        self.assertFalse(r.ok)
        codes = [e["code"] for e in r.errors]
        self.assertIn("MISSING_FIELD", codes)
        self.assertEqual(r.errors[0]["field"], "buildServerUrl")

    def test_env_url_fallback(self):
        with mock.patch.dict(os.environ, {"LATEST_BUILD_STATUS_DEFAULT_BASE_URL": "https://env.example.com"}):
            r = core.tail({"buildId": "b-1", "dryRun": True, "fixture": ["a", "b"]})
        self.assertTrue(r.ok, msg=str(r.to_dict()))

    def test_tail_negative_rejected(self):
        r = core.tail(_ok_input(tail=-1, dryRun=True, fixture=["x"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "tail" for e in r.errors))

    def test_tail_too_large_rejected(self):
        r = core.tail(_ok_input(tail=5001, dryRun=True, fixture=["x"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "tail" for e in r.errors))

    def test_tail_boundary_zero_allowed(self):
        # tail=0 이면 슬라이싱이 일어나지 않고 lines 가 그대로 유지된다.
        r = core.tail(_ok_input(tail=0, dryRun=True, fixture=["a", "b"]))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b"])

    def test_tail_boundary_5000_allowed(self):
        big = [f"line-{i}" for i in range(5000)]
        r = core.tail(_ok_input(tail=5000, dryRun=True, fixture=big))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(len(r.lines), 5000)

    def test_tail_non_integer_string_rejected(self):
        r = core.tail(_ok_input(tail="abc", dryRun=True, fixture=["x"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "tail" for e in r.errors))

    def test_tail_float_rejected(self):
        # float 타입은 core.py 에서 명시적으로 거부한다.
        r = core.tail(_ok_input(tail=10.5, dryRun=True, fixture=["x"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "tail" for e in r.errors))

    def test_tail_boolean_rejected(self):
        r = core.tail(_ok_input(tail=True, dryRun=True, fixture=["x"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "tail" for e in r.errors))

    def test_since_empty_string_treated_as_none(self):
        r = core.tail(_ok_input(since="", dryRun=True, fixture=["a", "b"]))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b"])

    def test_since_non_string_rejected(self):
        r = core.tail(_ok_input(since=123, dryRun=True, fixture=["a", "b"]))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "since" for e in r.errors))


# ---------------------------------------------------------------------------
# 2. dry-run + fixture shapes
# ---------------------------------------------------------------------------

class DryRunFixtureTests(unittest.TestCase):
    def test_list_fixture(self):
        r = core.tail(_ok_input(dryRun=True, fixture=["l1", "l2", "l3"]))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["l1", "l2", "l3"])
        # list fixture 는 next_since 가 없으므로 합성.
        self.assertIsNotNone(r.next_since)
        self.assertIn(":", r.next_since)

    def test_str_fixture_is_dict_json(self):
        r = core.tail(_ok_input(
            dryRun=True,
            fixture='{"lines": ["a", "b"], "next_since": "tok-1", "truncated": false}',
        ))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b"])
        self.assertEqual(r.next_since, "tok-1")
        self.assertFalse(r.truncated)

    def test_str_fixture_is_ndjson(self):
        nd = "\n".join([
            json.dumps({"line": "alpha"}),
            json.dumps({"message": "beta"}),
            json.dumps({"text": "gamma"}),
            "raw line without json",
        ])
        r = core.tail(_ok_input(dryRun=True, fixture=nd))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["alpha", "beta", "gamma", "raw line without json"])

    def test_str_fixture_is_plain_text(self):
        r = core.tail(_ok_input(dryRun=True, fixture="one\ntwo\nthree"))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["one", "two", "three"])

    def test_dict_fixture_with_lines(self):
        r = core.tail(_ok_input(
            dryRun=True,
            fixture={"lines": ["x", "y"], "next_since": "n-1"},
        ))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["x", "y"])
        self.assertEqual(r.next_since, "n-1")

    def test_dict_fixture_missing_lines_rejected(self):
        r = core.tail(_ok_input(dryRun=True, fixture={"foo": "bar"}))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "fixture" for e in r.errors))

    def test_invalid_fixture_type(self):
        r = core.tail(_ok_input(dryRun=True, fixture=12345))
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "INVALID_INPUT" and e["field"] == "fixture" for e in r.errors))


# ---------------------------------------------------------------------------
# 3. tail slicing + next_since synthesis
# ---------------------------------------------------------------------------

class TailSlicingTests(unittest.TestCase):
    def test_tail_truncates_from_end(self):
        lines = [f"line-{i}" for i in range(200)]
        r = core.tail(_ok_input(tail=10, dryRun=True, fixture=lines))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, lines[-10:])
        self.assertEqual(r.total_returned, 10)
        self.assertTrue(r.truncated)

    def test_tail_no_truncation_when_short(self):
        r = core.tail(_ok_input(tail=100, dryRun=True, fixture=["a", "b", "c"]))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b", "c"])
        self.assertFalse(r.truncated)
        self.assertEqual(r.total_returned, 3)

    def test_next_since_synth_format(self):
        r = core.tail(_ok_input(tail=10, dryRun=True, fixture=["l1", "l2", "l3"]))
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        # 마지막 라인 "l3" 의 sha1[:8] + ":3"
        import hashlib
        expected_digest = hashlib.sha1(b"l3").hexdigest()[:8]
        self.assertEqual(r.next_since, f"{expected_digest}:3")


# ---------------------------------------------------------------------------
# 4. response format parsing
# ---------------------------------------------------------------------------

class ResponseFormatTests(unittest.TestCase):
    def test_json_dict_with_lines(self):
        body = json.dumps({"lines": ["a", "b"], "next_since": "tok", "truncated": True}).encode()
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b"])
        self.assertEqual(r.next_since, "tok")
        self.assertTrue(r.truncated)

    def test_json_top_level_array(self):
        body = json.dumps(["x", "y", "z"]).encode()
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["x", "y", "z"])

    def test_ndjson_response(self):
        body = b'{"line":"a"}\n{"line":"b"}\nplain\n'
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["a", "b", "plain"])

    def test_plain_text_response(self):
        body = b"alpha\nbeta\ngamma"
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, ["alpha", "beta", "gamma"])

    def test_empty_response(self):
        body = b""
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        self.assertEqual(r.lines, [])

    def test_live_synthesizes_next_since_when_absent(self):
        body = json.dumps({"lines": ["a", "b", "c"]}).encode()
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(200, body)):
            r = core.tail(_ok_input())
        self.assertTrue(r.ok, msg=str(r.to_dict()))
        import hashlib
        expected = f"{hashlib.sha1(b'c').hexdigest()[:8]}:3"
        self.assertEqual(r.next_since, expected)


# ---------------------------------------------------------------------------
# 5. HTTP error mapping
# ---------------------------------------------------------------------------

class HttpErrorMappingTests(unittest.TestCase):
    def test_404_maps_to_build_not_found(self):
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(404, b"{}")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_NOT_FOUND" and e["field"] == "buildId" for e in r.errors))

    def test_500_maps_to_build_server_error(self):
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(500, b"oops")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_SERVER_ERROR" for e in r.errors))

    def test_503_maps_to_build_server_error(self):
        with mock.patch("urllib.request.urlopen", return_value=_fake_resp(503, b"oops")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_SERVER_ERROR" for e in r.errors))

    def test_urlerror_maps_to_unreachable(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("dns")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_SERVER_UNREACHABLE" for e in r.errors))

    def test_oserror_maps_to_unreachable(self):
        with mock.patch("urllib.request.urlopen", side_effect=OSError("conn refused")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_SERVER_UNREACHABLE" for e in r.errors))

    def test_timeout_maps_to_unreachable(self):
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("slow")):
            r = core.tail(_ok_input())
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "BUILD_SERVER_UNREACHABLE" for e in r.errors))


# ---------------------------------------------------------------------------
# 6. URL construction
# ---------------------------------------------------------------------------

class UrlConstructionTests(unittest.TestCase):
    def test_basic_url(self):
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            captured["method"] = req.method
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
            core.tail(_ok_input())
        self.assertEqual(captured["method"], "GET")
        self.assertTrue(captured["url"].startswith("https://build.example.com/builds/b-1/logs?"))
        self.assertIn("tail=200", captured["url"])

    def test_url_encodes_build_id(self):
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
            core.tail(_ok_input(buildId="b with space"))
        url = captured["url"]
        # buildId 는 path segment 이므로 percent-escape 되어야 한다.
        self.assertIn("/builds/b%20with%20space/logs", url)

    def test_tail_and_since_in_query(self):
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
            core.tail(_ok_input(tail=50, since="cursor-abc"))
        from urllib.parse import parse_qs, urlparse
        qs = parse_qs(urlparse(captured["url"]).query)
        self.assertEqual(qs["tail"], ["50"])
        self.assertEqual(qs["since"], ["cursor-abc"])

    def test_since_url_encoded(self):
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
            core.tail(_ok_input(since="a/b c"))
        # urlencode 는 path-safe 문자 (/) 는 %2F 로, 공백은 + 로 escape 한다.
        self.assertIn("a%2Fb+c", captured["url"])


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

    def test_cli_dry_run_with_dict_fixture(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps({"lines": ["a", "b"], "next_since": "tok"}))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main([
                "--input", str(inp),
                "--dry-run",
                "--fixture", str(fix),
            ])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertTrue(out["ok"])
        self.assertEqual(out["lines"], ["a", "b"])
        self.assertEqual(out["next_since"], "tok")

    def test_cli_dry_run_with_list_fixture_via_file(self):
        # list fixture 는 JSON array 이므로 --fixture 에 array 를 쓴 파일을 줘야 함.
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps(["x", "y", "z"]))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = cli.main([
                "--input", str(inp),
                "--dry-run",
                "--fixture", str(fix),
            ])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertEqual(out["lines"], ["x", "y", "z"])

    def test_cli_tail_override(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps({"lines": [f"l{i}" for i in range(50)]}))
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            cli.main([
                "--input", str(inp),
                "--dry-run",
                "--fixture", str(fix),
                "--tail", "5",
            ])
        out = json.loads(buf.getvalue())
        self.assertEqual(out["lines"], ["l45", "l46", "l47", "l48", "l49"])
        self.assertTrue(out["truncated"])

    def test_cli_since_override(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps({"lines": ["a"]}))
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen), \
                contextlib.redirect_stdout(io.StringIO()):
            cli.main([
                "--input", str(inp),
                "--build-server-url", "https://b.example.com",
                "--since", "cursor-xyz",
            ])
        from urllib.parse import parse_qs, urlparse
        qs = parse_qs(urlparse(captured["url"]).query)
        self.assertEqual(qs["since"], ["cursor-xyz"])

    def test_cli_output_file(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps({"lines": ["a"]}))
        out_p = Path(self.tmp.name) / "out.json"
        rc = cli.main([
            "--input", str(inp),
            "--dry-run",
            "--fixture", str(fix),
            "--output", str(out_p),
        ])
        self.assertEqual(rc, 0)
        data = json.loads(out_p.read_text(encoding="utf-8"))
        self.assertTrue(data["ok"])
        self.assertEqual(data["lines"], ["a"])

    def test_cli_strict_exits_2_on_error(self):
        inp = self._write("in.json", json.dumps({}))  # buildId missing
        with contextlib.redirect_stdout(io.StringIO()):
            rc = cli.main(["--input", str(inp), "--strict"])
        self.assertEqual(rc, 2)

    def test_cli_strict_exits_0_on_ok(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        fix = self._write("fix.json", json.dumps({"lines": ["a"]}))
        with contextlib.redirect_stdout(io.StringIO()):
            rc = cli.main([
                "--input", str(inp),
                "--dry-run",
                "--fixture", str(fix),
                "--strict",
            ])
        self.assertEqual(rc, 0)

    def test_cli_stdin_input(self):
        fix = self._write("fix.json", json.dumps({"lines": ["hello"]}))
        buf = io.StringIO()
        stdin = io.StringIO(json.dumps({"buildId": "b-1"}))
        with contextlib.redirect_stdout(buf), \
                mock.patch("sys.stdin", stdin):
            rc = cli.main(["--input", "-", "--dry-run", "--fixture", str(fix)])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertEqual(out["lines"], ["hello"])

    def test_cli_invalid_input_json_exits_nonzero(self):
        inp = self._write("bad.json", "{not json")
        with self.assertRaises(SystemExit):
            cli.main(["--input", str(inp)])

    def test_cli_build_server_url_override(self):
        inp = self._write("in.json", json.dumps({"buildId": "b-1"}))
        captured = {}

        def _fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            return _fake_resp(200, json.dumps({"lines": []}).encode())

        with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen), \
                contextlib.redirect_stdout(io.StringIO()):
            cli.main([
                "--input", str(inp),
                "--build-server-url", "https://override.example.com",
            ])
        self.assertTrue(captured["url"].startswith("https://override.example.com/builds/b-1/logs"))


# ---------------------------------------------------------------------------
# 8. result envelope
# ---------------------------------------------------------------------------

class ResultEnvelopeTests(unittest.TestCase):
    def test_to_dict_shape(self):
        r = core.tail(_ok_input(dryRun=True, fixture=["a", "b"]))
        d = r.to_dict()
        for k in ("ok", "lines", "next_since", "truncated", "total_returned", "warnings", "errors", "ref"):
            self.assertIn(k, d)
        self.assertEqual(d["ref"]["contract_doc"], "docs/sdlc/contracts/01-shared-build-contract-baseline.md")
        self.assertEqual(d["ref"]["mcp_version"], "v1")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
