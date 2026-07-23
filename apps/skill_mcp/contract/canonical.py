"""Canonical contract enums (single source of truth for skill/MCP layer).

This Python module is the **only** place where skill/MCP code may declare
literal enum values that come from the shared canonical contract. The
typescript source is `packages/shared-contract/src/build/{status,errors,phase}.ts`.
Both sides MUST be kept in sync; `contract-drift-checker` verifies them.

The drift checker has been extended (TASK-061) to:

1. Cross-check these Python frozenset literals against the TypeScript
   source so accidental additions/removals are caught.
2. Cross-check any literal status / phase / error-code reference in any
   `apps/skill_mcp/**/core.py` against the frozensets in this module —
   so skills can't quietly re-introduce legacy pre-canonical values.

Anything outside this contract is a `legacy_*` shim with an explicit
migration window marker (see `LEGACY_*` constants below).
"""

from __future__ import annotations

# Canonical lifecycle statuses. Mirrors packages/shared-contract/src/build/status.ts
# `canonicalBuildStatuses`. 12 values aligned with the SDLC docs:
# build (PREPARING_SOURCE / BUILDING / BUILD_SUCCESS) ->
# container test (TESTING / TEST_SUCCESS) ->
# external deployment (DEPLOYING / DEPLOY_SUCCESS) ->
# terminal (COMPLETED / FAILED / CANCELLED).
CANONICAL_BUILD_STATUSES: frozenset[str] = frozenset({
    "RECEIVED",
    "QUEUED",
    "PREPARING_SOURCE",
    "BUILDING",
    "BUILD_SUCCESS",
    "TESTING",
    "TEST_SUCCESS",
    "DEPLOYING",
    "DEPLOY_SUCCESS",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
})

# Generic step/result status used by BuildStatusResponse.lifecycle /
# .image / .test / .deploy / .resultDelivery blocks. Mirrors
# packages/shared-contract/src/build/status.ts `executionStatuses`.
EXECUTION_STATUSES: frozenset[str] = frozenset({
    "NOT_STARTED",
    "IN_PROGRESS",
    "SUCCESS",
    "FAILED",
    "SKIPPED",
})

# Legacy adapter statuses still emitted by the current build-server
# during the migration window. Mirrors `legacyBuildStatuses` in
# status.ts. Skills should accept these as inputs but never produce
# them in user-facing messages — they map into canonical terminal
# states instead.
LEGACY_BUILD_STATUSES: frozenset[str] = frozenset({
    "CLAIMED",
    "TEST_READY",
})

# Public union: what skills accept as a `build.status` input.
PUBLIC_BUILD_STATUSES: frozenset[str] = frozenset(
    CANONICAL_BUILD_STATUSES | LEGACY_BUILD_STATUSES
)

# Legacy preview/test-deployment states. The TS contract (`previewStatuses`
# in status.ts) lists 6 values; the Python migration shim keeps 3 additional
# PKG-006-era historical statuses that the build-server emitted in earlier
# versions but that the canonical contract dropped during the rename
# refactor (TASK-052):
#
#   - "RESERVED"   — PKG-006 reservation phase
#   - "STARTING"   — pre-canonical starting alias for PROVISIONING
#   - "STOPPED"    — older teardown state (now superseded by EXPIRED)
#
# These three are Python-only legacy extras; the contract-drift-checker
# reports them under the `extra_in_code` group (Python canonical vs TS).
# Skills keep accepting them for caller forward-compat during the
# migration window. New code MUST prefer the canonical `test` / `deploy`
# blocks (ContainerTestResult / DeploymentResult) in BuildStatusResponse.
LEGACY_PREVIEW_STATUSES: frozenset[str] = frozenset({
    # TS-mirror subset (6)
    "NOT_REQUESTED",
    "QUEUED",
    "PROVISIONING",
    "READY",
    "FAILED",
    "EXPIRED",
    # Python-only legacy extras (3) — PKG-006-era historical.
    "RESERVED",
    "STARTING",
    "STOPPED",
})

# Forward-map legacy preview-status to canonical execution-status.
# Mirrors the live build-status-explainer / latest-build-status /
# preview-readiness-checker mapping. Single source-of-truth so the three
# skills/MCPs that consume `testDeployment` stay aligned.
LEGACY_PREVIEW_TO_EXECUTION: dict[str, str] = {
    "READY": "SUCCESS",
    "NOT_REQUESTED": "SKIPPED",
    "QUEUED": "NOT_STARTED",
    "PROVISIONING": "IN_PROGRESS",
    # FAILED / EXPIRED / RESERVED / STARTING / STOPPED fall through as
    # `execution = raw` — they're either canonical EXECUTION_STATUSES
    # member (FAILED) or shim values handled per-case.
}

# TASK-069: Runner registry status enum. Mirrors
# `packages/shared-contract/src/build/runner-registry.ts` `runnerStatusSchema`
# 와 `apps/runner/internal/contract/runner_registry.go` `RunnerStatuses`.
# Admin menu 가 이 enum 으로 DISABLE / REACTIVATE 토글하며, Build Server 가
# POST /builds/claim 응답 reason=RUNNER_DISABLED 로 거부 여부를 결정.
RUNNER_STATUSES: frozenset[str] = frozenset({
    "ACTIVE",
    "DISABLED",
})

# Canonical 4-stage enum for failure-summary-shaper. Marks at which
# build/test/deploy/result-delivery step a failure happened. Mirrors
# the new narrative in docs/sdlc/02-concept-refinement.md and the
# failure-shaper SKILL §1.2.
CANONICAL_STAGES: frozenset[str] = frozenset({
    "BUILD",
    "TEST",
    "DEPLOY",
    "DELIVERY",
})

# Backward-compat: legacy `failure.source` (`build` / `preview` /
# `deploy` / `delivery` / `unknown`) → canonical stage. "unknown"
# defaults to BUILD (worst-case prior step) and surfaces a warning.
LEGACY_SOURCE_TO_STAGE: dict[str, str] = {
    "build": "BUILD",
    "preview": "TEST",
    "deploy": "DEPLOY",
    "delivery": "DELIVERY",
    "unknown": "BUILD",
}

# Build phase enum. Mirrors packages/shared-contract/src/build/phase.ts
# `buildPhases`. Drives host-side status transitions.
BUILD_PHASES: frozenset[str] = frozenset({
    "REQUEST_ACCEPTED",
    "QUEUE_CLAIMED",
    "SOURCE_PREPARED",
    "DOCKER_BUILD_STARTED",
    "DOCKER_BUILD_COMPLETED",
    "CONTAINER_TEST_STARTED",
    "CONTAINER_TEST_PASSED",
    "DEPLOYMENT_STARTED",
    "DEPLOYMENT_COMPLETED",
    "COMPLETED",
    "FAILED",
})

# Canonical error codes. Mirrors packages/shared-contract/src/build/errors.ts
# `errorCodes`. 9 values (TASK-062 added DEPLOYMENT_FAILED to parallel the
# existing PREVIEW_PROVISION_FAILED at the deployment step).
ERROR_CODES: frozenset[str] = frozenset({
    "ACTIVE_BUILD_EXISTS",
    "INVALID_REQUEST",
    "BUILD_NOT_FOUND",
    "LOGS_NOT_FOUND",
    "QUEUE_CLAIM_FAILED",
    "DOCKER_BUILD_FAILED",
    "PREVIEW_PROVISION_FAILED",
    "DEPLOYMENT_FAILED",
    "UNKNOWN_ERROR",
})

# Canonical next_action enum surfaced by build-status-explainer /
# failure-summary-shaper / preview-readiness-checker.
#
# Note the rename vs the legacy `OPEN_PREVIEW`: under the
# build/test/deploy/result-delivery model, the success path now ends
# at a deployment (or a test deployment). `OPEN_PREVIEW` is replaced by
# `OPEN_DEPLOYMENT` so the action matches what the user actually does
# next: open the deployed artifact (test deployment in MVP, real
# deployment in production).
NEXT_ACTIONS: frozenset[str] = frozenset({
    "WAIT",
    "OPEN_DEPLOYMENT",
    "RETRY",
    "FIX_DOCKERFILE",
    "FIX_PORT",
    "CHECK_SOURCE",
    "CONTACT_OPERATOR",
    "NONE",
})

# Canonical readiness_state enum surfaced by
# preview-readiness-checker (skill name retained for stability — the
# internal model is container-test readiness now). 7 values.
READINESS_STATES: frozenset[str] = frozenset({
    "READY",
    "PREPARING",
    "WAITING_FOR_SLOT",
    "STARTING",
    "DEGRADED",
    "EXPIRED",
    "UNKNOWN",
})

CANONICAL_CONTRACT_VERSION = "v2"
"""Bumped from v1 to v2 in TASK-061 when the skill/MCP surface switched
from preview-era enums to canonical blocks (`lifecycle`/`image`/`test`/
`deploy`/`resultDelivery`). Bump on the next contract-shape change.
"""


def is_canonical_build_status(value: object) -> bool:
    """True if `value` is a canonical build status (not a legacy shim)."""
    return isinstance(value, str) and value in CANONICAL_BUILD_STATUSES


def is_public_build_status(value: object) -> bool:
    """True if `value` is in the public build-status union (canonical +
    legacy shims). Use this when accepting user/server inputs.
    """
    return isinstance(value, str) and value in PUBLIC_BUILD_STATUSES


def is_execution_status(value: object) -> bool:
    return isinstance(value, str) and value in EXECUTION_STATUSES


def is_legacy_preview_status(value: object) -> bool:
    return isinstance(value, str) and value in LEGACY_PREVIEW_STATUSES


def is_build_phase(value: object) -> bool:
    return isinstance(value, str) and value in BUILD_PHASES


def is_error_code(value: object) -> bool:
    return isinstance(value, str) and value in ERROR_CODES


def is_next_action(value: object) -> bool:
    return isinstance(value, str) and value in NEXT_ACTIONS


def is_readiness_state(value: object) -> bool:
    return isinstance(value, str) and value in READINESS_STATES
