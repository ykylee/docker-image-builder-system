"""contract-drift-checker skill tests.

TASK-030. 입력 검증 / TS enum 추출 / canonical 추출 / drift 계산 /
BuildRequest field / 실제 repo_root 통합 / cli 까지 검증한다.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apps.skill_mcp.skills.contract_drift_checker import cli, core


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _write(p: Path, content: str) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


def _make_repo(tmp: Path) -> Path:
    """테스트용 가짜 repo_root.
    packages/shared-contract/src/build/4개 + canonical 1개.
    drift 가 일부러 있게 만든다 (TS 가 canonical 의 subset).
    """
    repo = tmp
    contract = repo / "packages" / "shared-contract" / "src" / "build"
    _write(contract / "status.ts", (
        "export const buildStatuses = [\n"
        "  \"QUEUED\",\n"
        "  \"BUILDING\",\n"  # canonical-only: PREPARING, VALIDATING, IMAGE_BUILT, TEST_DEPLOYING, COMPLETED, FAILED, CANCELLED
        "  \"CLAIMED\",\n"   # TS-only
        "  \"COMPLETED\"\n"
        "] as const;\n"
        "\n"
        """
    ))
    _write(contract / "phase.ts", (
        "export const buildPhases = [\n"
        "  \"REQUEST_ACCEPTED\",\n"
        "  \"FAILED\"\n"
        "] as const;\n"
    ))
    _write(contract / "errors.ts", (
        "export const errorCodes = [\n"
        "  \"INVALID_REQUEST\",\n"
        "  \"INTERNAL_ERROR\",\n"  # canonical-only 도 같이

        "  \"DOCKER_BUILD_FAILED\",\n"
        "  \"MY_CUSTOM_ERROR\"\n"  # TS-only
        "] as const;\n"
    ))
    _write(contract / "request.ts", (
        "export const buildRequestSchema = z.object({\n"
        "  projectId: z.string().min(1),\n"
        "  repositoryId: z.string().min(1),\n"
        "  requestedBy: z.string().min(1),\n"
        "  sourceArchive: sourceArchiveSchema,\n"
        "  entrypointPath: z.string().min(1),\n"
        "  metadata: z.record(z.string(), z.string()).default({})\n"
        "});\n"
    ))
    canonical = repo / "docs" / "sdlc" / "contracts" / "01-shared-build-contract-baseline.md"
    _write(canonical, _CANONICAL_SAMPLE)
    return repo


_CANONICAL_SAMPLE = """# Shared Build Contract Baseline

## 3. 최소 Build Request Payload

### 3.1 필수 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | build ownership 기준 사용자 식별자 |
| `appName` | string | 사용자 범위 내 앱 식별 이름 |
| `sourceArchiveRef` | string | Build Server가 읽을 source archive 참조값 |

### 3.2 권장 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `dockerfileMode` | string | `provided` 등 Dockerfile 처리 정책 값 |
| `runtimePort` | integer | 앱의 기대 listening port |

## 4. Canonical Identifier Rules

...

## 5. Build Status Enum

```text
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
TEST_READY
COMPLETED
FAILED
CANCELLED
```

## 6. Phase Key Baseline

```text
REQUEST_ACCEPTED
SOURCE_PREPARING
INPUT_VALIDATING
DOCKER_BUILDING
IMAGE_REGISTERED
PREVIEW_QUEUEING
PREVIEW_STARTING
CONTAINER_TEST_PASSED
FAILED
```

## 8. Error Code Baseline

```text
INVALID_REQUEST
SOURCE_ARCHIVE_NOT_FOUND
DOCKERFILE_NOT_FOUND
INVALID_RUNTIME_PORT
INVALID_BUILD_INPUT
DOCKER_BUILD_FAILED
PREVIEW_PORT_UNAVAILABLE
PREVIEW_CONTAINER_START_FAILED
PREVIEW_HEALTHCHECK_FAILED
INTERNAL_ERROR
```
"""


# ---------------------------------------------------------------------------
# 1. Input validation
# ---------------------------------------------------------------------------

class InputValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = _make_repo(Path(self.tmp.name))

    def test_non_dict_input(self):
        r = core.check_drift("not a dict", repo_root=self.repo)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")

    def test_missing_contract_dir(self):
        bad = Path(self.tmp.name) / "no-such"
        r = core.check_drift({}, repo_root=bad)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")
        self.assertEqual(r.errors[0]["field"], "contractPath")

    def test_missing_canonical_file(self):
        # contract 디렉터리만 있고 canonical 없는 경우
        bare = Path(self.tmp.name) / "bare"
        (bare / "packages" / "shared-contract" / "src" / "build").mkdir(parents=True)
        r = core.check_drift({}, repo_root=bare)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "MISSING_FIELD")
        self.assertEqual(r.errors[0]["field"], "canonicalPath")

    def test_unknown_enum_name(self):
        r = core.check_drift({"enums": ["buildStatuses", "fakeEnum"]}, repo_root=self.repo)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")
        self.assertEqual(r.errors[0]["field"], "enums")

    def test_enums_not_a_list(self):
        r = core.check_drift({"enums": "buildStatuses"}, repo_root=self.repo)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors[0]["code"], "INVALID_INPUT")
        self.assertEqual(r.errors[0]["field"], "enums")


# ---------------------------------------------------------------------------
# 2. TS enum extraction
# ---------------------------------------------------------------------------

class TsEnumExtractionTests(unittest.TestCase):
    def test_extract_basic(self):
        src = 'export const buildStatuses = [\n  "QUEUED",\n  "BUILDING"\n] as const;'
        self.assertEqual(
            core._extract_ts_enum(src, "buildStatuses"),
            ["QUEUED", "BUILDING"],
        )

    def test_extract_no_match(self):
        src = 'export const other = ["X"] as const;'
        self.assertIsNone(core._extract_ts_enum(src, "buildStatuses"))

    def test_extract_filters_non_upper_words(self):
        src = (
            "export const x = [\n"
            "  \"QUEUED\",\n"
            "  \"mixedCase\",\n"
            "  \"lower\",\n"
            "  \"OK_NAME\",\n"
            "  42\n"
            "] as const;"
        )
        self.assertEqual(
            core._extract_ts_enum(src, "x"),
            ["QUEUED", "OK_NAME"],
        )


# ---------------------------------------------------------------------------
# 2.5 Go const extraction (TASK-062)
# ---------------------------------------------------------------------------

class GoEnumExtractionTests(unittest.TestCase):
    def test_extract_basic(self):
        # Go 식별자 CamelCase 도 허용 (StatusReceived, PhaseDockerBuildStarted 등).
        src = (
            'const (\n'
            '\tStatusReceived           = "RECEIVED"\n'
            '\tStatusQueued             = "QUEUED"\n'
            '\tPhaseDockerBuildStarted  = "DOCKER_BUILD_STARTED"\n'
            '\tErrorCodeBuildFailed     = "BUILD_FAILED"\n'
            ')\n'
        )
        consts = core._extract_go_consts(src)
        self.assertEqual(consts, {
            "StatusReceived": "RECEIVED",
            "StatusQueued": "QUEUED",
            "PhaseDockerBuildStarted": "DOCKER_BUILD_STARTED",
            "ErrorCodeBuildFailed": "BUILD_FAILED",
        })

    def test_extract_no_match(self):
        # const 블록에 매칭 가능한 줄이 전혀 없으면 None.
        src = (
            'package contract\n'
            '\n'
            '// StatusFoo = "FOO" — quoted as a comment, no matching const.\n'
            'var Status = "RECEIVED"  // plain assign, no `=` surrounded value.\n'
        )
        self.assertIsNone(core._extract_go_consts(src))

    def test_extract_filters_non_upper_values(self):
        # value 가 UPPER_SNAKE 가 아니면 매칭 X (예: lowercase, number, mixed).
        src = (
            'const (\n'
            '\tStatusOK = "ok"\n'                 # lowercase value
            '\tStatusNum = "STATUS_42"\n'          # 숫자 섞임 → 정상
            '\tStatusMix = "StatusMixed"\n'       # mixed case
            '\tStatusBare = RECEIVED\n'           # 따옴표 없음
            ')\n'
        )
        consts = core._extract_go_consts(src)
        # 매칭은 UPPER_SNAKE_CASE 만 — mixed/lowercase/bare 는 매칭 X.
        # STATUS_42 는 매칭됨 (숫자 허용).
        self.assertEqual(consts, {"StatusNum": "STATUS_42"})

    def test_extract_resolves_fixtures(self):
        # 실제 Go contract 모듈을 read 해서 const map 가 정상 매핑되는지.
        repo = Path(__file__).resolve().parents[3]
        for rel in (
            "apps/runner/internal/contract/status.go",
            "apps/runner/internal/contract/phase.go",
            "apps/runner/internal/contract/errors.go",
        ):
            self.assertTrue((repo / rel).is_file(), f"missing fixture: {rel}")
            src = (repo / rel).read_text(encoding="utf-8")
            consts = core._extract_go_consts(src)
            self.assertIsNotNone(consts, f"no consts parsed from {rel}")
            self.assertGreaterEqual(len(consts), 5, f"too few consts in {rel}")

    def test_resolve_go_value_set_filters_unknown_idents(self):
        # _extract_go_consts 결과 dict 에 없는 ident 는 무시 (drift 표면).
        consts = {"StatusA": "A_VALUE", "StatusB": "B_VALUE"}
        self.assertEqual(core._resolve_go_value_set(consts, ("StatusA", "StatusMISSING")), {"A_VALUE"})
        self.assertEqual(
            core._resolve_go_value_set(consts, ("StatusC", "StatusD")),
            None,
            "all-missing idents 는 None 반환",
        )
        self.assertIsNone(
            core._resolve_go_value_set(None, ("StatusA",)),
            "dict 자체가 None 이면 None",
        )


# ---------------------------------------------------------------------------
# 3. canonical extraction
# ---------------------------------------------------------------------------

class CanonicalExtractionTests(unittest.TestCase):
    def test_extract_enums(self):
        text = _CANONICAL_SAMPLE
        enums = core._extract_canonical_enums(text)
        # TASK-161 (P2-M2 Step 5): §6 previewStatuses 제거 → 3개 block.
        self.assertIn("buildStatuses", enums)
        self.assertIn("buildPhases", enums)
        self.assertIn("errorCodes", enums)
        # §5 BuildStatus 10종
        self.assertEqual(len(enums["buildStatuses"]), 10)
        self.assertIn("CANCELLED", enums["buildStatuses"])
        # §7 ErrorCode 10종
        self.assertEqual(len(enums["errorCodes"]), 10)
        self.assertIn("INTERNAL_ERROR", enums["errorCodes"])

    def test_extract_request_fields(self):
        fields = core._extract_canonical_request_fields(_CANONICAL_SAMPLE)
        # §3.1 + §3.2 의 5종: userId, appName, sourceArchiveRef, dockerfileMode, runtimePort
        self.assertEqual(fields, [
            "userId",
            "appName",
            "sourceArchiveRef",
            "dockerfileMode",
            "runtimePort",
        ])


# ---------------------------------------------------------------------------
# 4. Drift computation (canonical-only and TS-only)
# ---------------------------------------------------------------------------

class DriftComputationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = _make_repo(Path(self.tmp.name))

    def test_drift_summary_counts(self):
        r = core.check_drift({}, repo_root=self.repo)
        # 가짜 repo 의 _make_repo 에서 의도적으로 drift 를 심어둠
        self.assertFalse(r.ok)
        # TASK-161 (P2-M2 Step 5): §6 previewStatuses 제거.
        # buildStatuses: TS=4(QUEUED, BUILDING, CLAIMED, COMPLETED) / canonical=10
        # shared: QUEUED, BUILDING, COMPLETED
        # missing: 7 (PREPARING, VALIDATING, IMAGE_BUILT, TEST_DEPLOYING, TEST_READY, FAILED, CANCELLED)
        # extra: 1 (CLAIMED)
        # buildPhases: TS=2 / canonical=9
        # shared: REQUEST_ACCEPTED, FAILED
        # missing: 7
        # extra: 0
        # errorCodes: TS=4 / canonical=10
        # shared: INVALID_REQUEST, INTERNAL_ERROR, DOCKER_BUILD_FAILED
        # missing: 7
        # extra: 1 (MY_CUSTOM_ERROR)
        # request fields: TS=6 / canonical=5
        # shared: 0
        # missing: 5 (userId, appName, sourceArchiveRef, dockerfileMode, runtimePort)
        # extra: 6 (projectId, repositoryId, requestedBy, sourceArchive, entrypointPath, metadata)

        s = r.summary
        self.assertEqual(s.missing_in_code, 7 + 7 + 7 + 5)
        self.assertEqual(s.extra_in_code, 1 + 0 + 1 + 6)
        self.assertEqual(s.total, s.missing_in_code + s.extra_in_code)

        by_enum = s.by_enum
        self.assertEqual(by_enum["buildStatuses"]["missing"], 7)
        self.assertEqual(by_enum["buildStatuses"]["extra"], 1)
        self.assertEqual(by_enum["buildStatuses"]["shared"], 3)
        self.assertEqual(by_enum["buildPhases"]["missing"], 7)
        self.assertEqual(by_enum["errorCodes"]["missing"], 7)
        self.assertEqual(by_enum["errorCodes"]["extra"], 1)
        self.assertEqual(by_enum["buildRequestFields"]["missing"], 5)
        self.assertEqual(by_enum["buildRequestFields"]["extra"], 6)

    def test_drift_items_kind_enum_value(self):
        r = core.check_drift({}, repo_root=self.repo)
        # 첫 몇 개 drift 의 kind/enum/value 검증
        kinds = {d.kind for d in r.drift_items}
        self.assertIn("missing_in_code", kinds)
        self.assertIn("extra_in_code", kinds)

        # canonical-only 항목은 §N 표기
        for d in r.drift_items:
            if d.kind == "missing_in_code":
                self.assertTrue(d.canonical_section.startswith("§"))

    def test_enums_subset_filter(self):
        r = core.check_drift(
            {"enums": ["buildStatuses"], "checkRequest": False},
            repo_root=self.repo,
        )
        # buildStatuses 만 검사 → by_enum 에 buildStatuses 만
        self.assertIn("buildStatuses", r.summary.by_enum)
        self.assertNotIn("buildPhases", r.summary.by_enum)
        self.assertNotIn("errorCodes", r.summary.by_enum)
        self.assertNotIn("buildRequestFields", r.summary.by_enum)

    def test_check_request_false_skips_request_fields(self):
        r = core.check_drift({"checkRequest": False}, repo_root=self.repo)
        self.assertNotIn("buildRequestFields", r.summary.by_enum)
        # request drift 가 빠져서 total 이 줄어들어야 함
        with_req = core.check_drift({}, repo_root=self.repo)
        self.assertLess(r.summary.total, with_req.summary.total)

    def test_no_drift_when_sets_match(self):
        # 가짜 repo 의 status.ts 를 canonical 과 동일 set 으로 덮어쓰기
        status_ts = (
            self.repo / "packages" / "shared-contract" / "src" / "build" / "status.ts"
        )
        status_ts.write_text(
            "export const buildStatuses = [\n"
            "  \"QUEUED\", \"PREPARING\", \"VALIDATING\", \"BUILDING\",\n"
            "  \"IMAGE_BUILT\", \"TEST_DEPLOYING\", \"TEST_READY\",\n"
            "  \"COMPLETED\", \"FAILED\", \"CANCELLED\"\n"
            "] as const;\n"
            # TASK-161 (P2-M2 Step 5): previewStatuses 가 canonical 흡수되어
            # TS 정의가 사라졌다. 본 테스트는 buildStatuses 만 본 drift 0 검증.
            encoding="utf-8",
        )
        r = core.check_drift(
            {
                "enums": ["buildStatuses"],
                "checkRequest": False,
            },
            repo_root=self.repo,
        )
        # buildStatuses 만 본 경우 drift 0
        s = r.summary
        self.assertEqual(s.total, 0)
        self.assertTrue(r.ok)


# ---------------------------------------------------------------------------
# 5. File-level error / warning
# ---------------------------------------------------------------------------

class FileLevelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = _make_repo(Path(self.tmp.name))

    def test_missing_ts_file_warns(self):
        # phase.ts 를 지워서 warnings 가 발생하는 케이스
        (self.repo / "packages" / "shared-contract" / "src" / "build" / "phase.ts").unlink()
        r = core.check_drift({}, repo_root=self.repo)
        # ok=False 면서도 errors 는 0 (warnings 만)
        self.assertFalse(r.ok)
        self.assertEqual(r.errors, [])
        codes = [w["code"] for w in r.warnings]
        self.assertIn("PARSE_ERROR", codes)
        # buildPhases summary 는 0/0/0 으로 채워짐
        self.assertEqual(r.summary.by_enum["buildPhases"], {"missing": 0, "extra": 0, "shared": 0})

    def test_io_error_on_canonical(self):
        # canonical 을 읽을 수 없게 권한 박탈 (root 가 아니면 실패할 수 있어 mock)
        with mock.patch.object(core, "_read_text", side_effect=OSError("disk fail")):
            r = core.check_drift({}, repo_root=self.repo)
        self.assertFalse(r.ok)
        self.assertTrue(any(e["code"] == "IO_ERROR" for e in r.errors))


# ---------------------------------------------------------------------------
# 6. Real repo_root integration (current checkout)
# ---------------------------------------------------------------------------

class RealRepoTests(unittest.TestCase):
    """실제 저장소에서 check_drift() 가 drift 를 잡는지."""

    @classmethod
    def setUpClass(cls):
        cls.repo_root = Path(__file__).resolve().parents[3]
        # 위에서 만든 _make_repo 가 아닌, 실제 packages/shared-contract 와 canonical
        if not (cls.repo_root / "packages" / "shared-contract" / "src" / "build" / "status.ts").is_file():
            raise unittest.SkipTest("real shared-contract not present")
        if not (cls.repo_root / "docs" / "sdlc" / "contracts" / "01-shared-build-contract-baseline.md").is_file():
            raise unittest.SkipTest("real canonical not present")

    def test_real_drift_detected(self):
        r = core.check_drift({}, repo_root=self.repo_root)
        # 현재 시점에서:
        # - canonical §4 buildStatuses 는 14종 (RECEIVED, QUEUED, ..., CANCELLED, VALIDATING 포함 legacy 잔재).
        # - TASK-159(P2-M1 Step 2) 이후 TS buildStatuses = canonicalBuildStatuses(12). legacy 2종 제거됨.
        # - canonical-only: VALIDATING (legacy 잔재), TS-only: CLAIMED, TEST_READY.
        # - TASK-061 부터 Python-side 검사가 추가됨: skillBuildStatuses (CANONICAL_BUILD_STATUSES 12)
        #   가 TS canonicalBuildStatuses 와 1:1 매칭 → drift 0. ERROR_CODES 도 1:1 → 0.
        # - §5/§6/§7/§8 enum + BuildRequest field + Python canonical 4종 모두 sync 시 drift 0 이어야 함.
        # 본 테스트는 **drift 가 0 이 될 수 있다** OR **VALIDATING / CLAIMED / TEST_READY drift 가 잡힌다** 둘 다 허용.
        canonical_only_build = {d.value for d in r.drift_items if d.enum == "buildStatuses" and d.kind == "missing_in_code"}
        ts_only_build = {d.value for d in r.drift_items if d.enum == "buildStatuses" and d.kind == "extra_in_code"}
        canonical_only_combined = "VALIDATING" in canonical_only_build
        clean_sync = r.summary.by_enum.get("buildStatuses", {}).get("missing", 1) == 0 and \
                     r.summary.by_enum.get("buildStatuses", {}).get("extra", 1) == 0
        self.assertTrue(
            canonical_only_combined or clean_sync,
            msg=(
                f"buildStatuses drift is unexpected: canonical_only={canonical_only_build}, "
                f"ts_only={ts_only_build}, by_enum={r.summary.by_enum.get('buildStatuses')}"
            ),
        )
        # by_enum 에 3종 (TASK-161 로 previewStatuses 제거) + buildRequestFields
        # + Python canonical 4종 + Go canonical 4종 모두 들어 있어야 함
        # (TASK-061 / TASK-062 / P2-M2 Step 5).
        for k in (
            "buildStatuses", "buildPhases", "errorCodes",
            "buildRequestFields",
            "skillBuildStatuses", "executionStatuses", "skillPhases", "skillErrorCodes",
            # Go bridge (TASK-062; TASK-159 로 goLegacyBuildStatuses 제거)
            "goBuildStatuses",
            "goExecutionStatuses", "goBuildPhases", "goErrorCodes",
        ):
            self.assertIn(k, r.summary.by_enum)

        # TASK-062: Go ↔ TS sync 4종 모두 0 drift 여야 한다 (legacy 제거 후)
        # (Python TEST-061 의 4종에 더해 Go 5종 모두 검증).
        for k in (
            "goBuildStatuses",
            "goExecutionStatuses", "goBuildPhases", "goErrorCodes",
        ):
            stats = r.summary.by_enum[k]
            self.assertEqual(stats["missing"], 0, f"{k} has missing Go entries vs TS")
            self.assertEqual(stats["extra"], 0, f"{k} has extra TS entries not in Go")

    def test_real_summary_to_dict(self):
        r = core.check_drift({}, repo_root=self.repo_root)
        d = r.to_dict()
        for k in ("ok", "drift_items", "summary", "warnings", "errors", "ref"):
            self.assertIn(k, d)
        self.assertEqual(d["ref"]["contract_doc"], "docs/sdlc/contracts/01-shared-build-contract-baseline.md")
        # TASK-061 bumped the skill version when Python canonical source-of-truth
        # + extended drift checks landed.
        self.assertEqual(d["ref"]["skill_version"], "v2")


# ---------------------------------------------------------------------------
# 7. cli.main
# ---------------------------------------------------------------------------

class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = _make_repo(Path(self.tmp.name))

    def test_cli_no_args(self):
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"CONTRACT_DRIFT_REPO_ROOT": str(self.repo)}), \
                contextlib.redirect_stdout(buf):
            rc = cli.main([])
        self.assertEqual(rc, 0)  # drift 는 있지만 strict 가 아니므로 rc=0
        out = json.loads(buf.getvalue())
        self.assertFalse(out["ok"])
        self.assertGreater(out["summary"]["total"], 0)

    def test_cli_strict_exits_2_on_drift(self):
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"CONTRACT_DRIFT_REPO_ROOT": str(self.repo)}), \
                contextlib.redirect_stdout(buf):
            rc = cli.main(["--strict"])
        self.assertEqual(rc, 2)
        out = json.loads(buf.getvalue())
        self.assertFalse(out["ok"])

    def test_cli_strict_exits_0_when_no_drift(self):
        # 모든 enum 을 동일 set 으로 맞춰서 drift 0 만들기
        status_ts = (
            self.repo / "packages" / "shared-contract" / "src" / "build" / "status.ts"
        )
        status_ts.write_text(
            "export const buildStatuses = [\"QUEUED\",\"PREPARING\",\"VALIDATING\","
            "\"BUILDING\",\"IMAGE_BUILT\",\"TEST_DEPLOYING\",\"TEST_READY\","
            "\"COMPLETED\",\"FAILED\",\"CANCELLED\"] as const;\n"
            # TASK-161 (P2-M2 Step 5): previewStatuses 가 canonical 흡수되어
            # TS 정의에서 사라짐.
            encoding="utf-8",
        )
        phase_ts = (
            self.repo / "packages" / "shared-contract" / "src" / "build" / "phase.ts"
        )
        phase_ts.write_text(
            "export const buildPhases = [\"REQUEST_ACCEPTED\",\"SOURCE_PREPARING\","
            "\"INPUT_VALIDATING\",\"DOCKER_BUILDING\",\"IMAGE_REGISTERED\","
            "\"PREVIEW_QUEUEING\",\"PREVIEW_STARTING\",\"CONTAINER_TEST_PASSED\",\"FAILED\"] as const;\n",
            encoding="utf-8",
        )
        errors_ts = (
            self.repo / "packages" / "shared-contract" / "src" / "build" / "errors.ts"
        )
        errors_ts.write_text(
            "export const errorCodes = [\"INVALID_REQUEST\",\"SOURCE_ARCHIVE_NOT_FOUND\","
            "\"DOCKERFILE_NOT_FOUND\",\"INVALID_RUNTIME_PORT\",\"INVALID_BUILD_INPUT\","
            "\"DOCKER_BUILD_FAILED\",\"PREVIEW_PORT_UNAVAILABLE\","
            "\"PREVIEW_CONTAINER_START_FAILED\",\"PREVIEW_HEALTHCHECK_FAILED\","
            "\"INTERNAL_ERROR\"] as const;\n",
            encoding="utf-8",
        )
        # request 필드도 canonical 5종과 일치하도록
        request_ts = (
            self.repo / "packages" / "shared-contract" / "src" / "build" / "request.ts"
        )
        request_ts.write_text(
            "export const buildRequestSchema = z.object({\n"
            "  userId: z.string().min(1),\n"
            "  appName: z.string().min(1),\n"
            "  sourceArchiveRef: z.string().min(1),\n"
            "  dockerfileMode: z.string().default(\"provided\"),\n"
            "  runtimePort: z.int().positive()\n"
            "});\n",
            encoding="utf-8",
        )
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"CONTRACT_DRIFT_REPO_ROOT": str(self.repo)}), \
                contextlib.redirect_stdout(buf):
            rc = cli.main(["--strict"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertTrue(out["ok"])
        self.assertEqual(out["summary"]["total"], 0)

    def test_cli_input_filter_enums(self):
        buf = io.StringIO()
        stdin = io.StringIO(json.dumps({"enums": ["buildStatuses"]}))
        with mock.patch.dict(os.environ, {"CONTRACT_DRIFT_REPO_ROOT": str(self.repo)}), \
                contextlib.redirect_stdout(buf), \
                mock.patch("sys.stdin", stdin):
            rc = cli.main(["--input", "-"])
        self.assertEqual(rc, 0)
        out = json.loads(buf.getvalue())
        self.assertIn("buildStatuses", out["summary"]["by_enum"])
        self.assertNotIn("previewStatuses", out["summary"]["by_enum"])

    def test_cli_output_file(self):
        out_p = Path(self.tmp.name) / "out.json"
        with mock.patch.dict(os.environ, {"CONTRACT_DRIFT_REPO_ROOT": str(self.repo)}):
            rc = cli.main(["--output", str(out_p)])
        self.assertEqual(rc, 0)
        data = json.loads(out_p.read_text(encoding="utf-8"))
        self.assertIn("summary", data)

    def test_cli_invalid_input_json_exits_nonzero(self):
        p = Path(self.tmp.name) / "bad.json"
        p.write_text("{not json", encoding="utf-8")
        with self.assertRaises(SystemExit):
            cli.main(["--input", str(p)])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
