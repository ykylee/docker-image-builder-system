# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.common.auth — v0.7.3 SEC-AUTH-01~06 runtime evaluator.

AIDLC 차용 auth-baseline 의 6 rule runtime 검증:
1. SEC-AUTH-01: API Key Storage (macOS keyring + chmod 600)
2. SEC-AUTH-02: Session Token Rotation (≤ 30일)
3. SEC-AUTH-03: OAuth Scope 최소 권한 (≤ 5개)
4. SEC-AUTH-04: 2FA / MFA 강제 (admin action)
5. SEC-AUTH-05: Password / Token Strength (entropy ≥ 128 bit)
6. SEC-AUTH-06: Authentication Audit Log (4종 event_type)

Reference:
- workflow-source/extensions/security/auth/auth-baseline.md
- workflow-source/extensions/SCHEMA.md §6 Helper Contract
"""

from __future__ import annotations

import math
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from workflow_kit.common.paths import memory_active_dir

# Rule result types
Status = str  # "compliant" | "non_compliant" | "not_applicable" | "advisory"


@dataclass
class RuleResult:
    """단일 rule 의 평가 결과."""

    rule_id: str
    title: str
    status: Status
    notes: str = ""


def _entropy_bits(s: str) -> float:
    """문자열의 Shannon entropy 를 bit 단위로 반환."""
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(s)
    entropy = 0.0
    for count in freq.values():
        p = count / n
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy * n


def _chmod_600(path: Path) -> bool:
    """file 의 mode 가 600 (소유자만 read/write) 인지 확인."""
    if not path.exists():
        return False
    mode = path.stat().st_mode & 0o777
    return mode == 0o600


# --- 6 Rule evaluators ---


def check_api_key_storage(project_root: Path) -> RuleResult:
    """SEC-AUTH-01: macOS keyring 또는 env var 사용. plaintext file (chmod 600 미만) 금지."""
    # 우리 storage 위치: ~/.myharness/, ~/.aws/, ~/.config/gh/
    secret_paths = [
        Path.home() / ".myharness" / "providers.toml",
        Path.home() / ".aws" / "credentials",
        Path.home() / ".config" / "gh" / "hosts.yml",
    ]
    bad_perms = []
    for p in secret_paths:
        if p.exists() and not _chmod_600(p):
            bad_perms.append(f"{p} (mode={oct(p.stat().st_mode & 0o777)})")

    # git history secret check
    git_secret_leak = False
    try:
        proc = subprocess.run(
            ["git", "log", "-p", "--all"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            timeout=10,
        )
        # API key pattern (sk-, ghp_, glpat- etc.)
        if re.search(r"sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|glpat-[a-zA-Z0-9_-]{20,}", proc.stdout):
            git_secret_leak = True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    if not bad_perms and not git_secret_leak:
        return RuleResult(
            rule_id="SEC-AUTH-01",
            title="API Key Storage",
            status="compliant",
            notes="모든 secret file chmod 600 + git history leak 0",
        )
    elif git_secret_leak:
        return RuleResult(
            rule_id="SEC-AUTH-01",
            title="API Key Storage",
            status="non_compliant",
            notes=f"git history 에 API key pattern 발견: {bad_perms or []}",
        )
    else:
        return RuleResult(
            rule_id="SEC-AUTH-01",
            title="API Key Storage",
            status="advisory",
            notes=f"chmod 600 미만: {bad_perms}",
        )


def check_session_token_rotation(token_exp_seconds: int) -> RuleResult:
    """SEC-AUTH-02: token exp ≤ 30일 (2592000 sec)."""
    if token_exp_seconds <= 0:
        return RuleResult(
            rule_id="SEC-AUTH-02",
            title="Session Token Rotation",
            status="not_applicable",
            notes="token_exp 미설정",
        )
    if token_exp_seconds > 2592000:
        return RuleResult(
            rule_id="SEC-AUTH-02",
            title="Session Token Rotation",
            status="non_compliant",
            notes=f"token_exp {token_exp_seconds}s > 30일 ({2592000}s)",
        )
    return RuleResult(
        rule_id="SEC-AUTH-02",
        title="Session Token Rotation",
        status="compliant",
        notes=f"token_exp {token_exp_seconds}s ≤ 30일",
    )


def check_oauth_scope_minimal(scopes: list[str]) -> RuleResult:
    """SEC-AUTH-03: scope ≤ 5개, 광범위 scope (admin / *:all) 미포함."""
    if not scopes:
        return RuleResult(
            rule_id="SEC-AUTH-03",
            title="OAuth Scope 최소 권한",
            status="not_applicable",
        )
    if len(scopes) > 5:
        return RuleResult(
            rule_id="SEC-AUTH-03",
            title="OAuth Scope 최소 권한",
            status="non_compliant",
            notes=f"scope {len(scopes)}개 > 5개",
        )
    wide_scopes = [s for s in scopes if s in ("admin", "admin:full", "*:all", "read:all", "write:all")]
    if wide_scopes:
        return RuleResult(
            rule_id="SEC-AUTH-03",
            title="OAuth Scope 최소 권한",
            status="non_compliant",
            notes=f"광범위 scope: {wide_scopes}",
        )
    return RuleResult(
        rule_id="SEC-AUTH-03",
        title="OAuth Scope 최소 권한",
        status="compliant",
        notes=f"scope {len(scopes)}개 (≤ 5), fine-grained",
    )


def check_mfa_admin_action(audit_log_path: Path, action_type: str) -> RuleResult:
    """SEC-AUTH-04: admin action (release / state doc / hard constraint disable) 시 2FA verified."""
    if not audit_log_path.exists():
        return RuleResult(
            rule_id="SEC-AUTH-04",
            title="2FA / MFA 강제",
            status="not_applicable",
            notes="audit.md 미존재",
        )
    content = audit_log_path.read_text(encoding="utf-8", errors="ignore")
    if action_type in ("release", "state_doc_edit", "hard_constraint_disable"):
        if f"mfa_verified: true" in content and action_type in content:
            return RuleResult(
                rule_id="SEC-AUTH-04",
                title="2FA / MFA 강제",
                status="compliant",
                notes=f"admin action {action_type} 의 audit log 에 mfa_verified: true",
            )
        return RuleResult(
            rule_id="SEC-AUTH-04",
            title="2FA / MFA 강제",
            status="non_compliant",
            notes=f"admin action {action_type} 의 mfa_verified 누락",
        )
    return RuleResult(
        rule_id="SEC-AUTH-04",
        title="2FA / MFA 강제",
        status="compliant",
        notes=f"non-admin action {action_type} (MFA 불필요)",
    )


def check_secret_strength(secret: str) -> RuleResult:
    """SEC-AUTH-05: secret entropy ≥ 128 bit."""
    if not secret:
        return RuleResult(
            rule_id="SEC-AUTH-05",
            title="Password / Token Strength",
            status="not_applicable",
        )
    entropy = _entropy_bits(secret)
    if entropy < 128:
        return RuleResult(
            rule_id="SEC-AUTH-05",
            title="Password / Token Strength",
            status="non_compliant",
            notes=f"entropy {entropy:.1f} bit < 128 bit (length={len(secret)})",
        )
    return RuleResult(
        rule_id="SEC-AUTH-05",
        title="Password / Token Strength",
        status="compliant",
        notes=f"entropy {entropy:.1f} bit ≥ 128 bit (length={len(secret)})",
    )


def check_auth_audit_log(audit_log_path: Path) -> RuleResult:
    """SEC-AUTH-06: 4종 event_type (auth_login / auth_logout / auth_token_refresh / auth_mfa_challenge) audit log."""
    if not audit_log_path.exists():
        return RuleResult(
            rule_id="SEC-AUTH-06",
            title="Authentication Audit Log",
            status="advisory",
            notes="audit.md 미존재",
        )
    content = audit_log_path.read_text(encoding="utf-8", errors="ignore")
    events = ["auth_login", "auth_logout", "auth_token_refresh", "auth_mfa_challenge"]
    missing = [e for e in events if e not in content]
    if len(missing) == 4:
        return RuleResult(
            rule_id="SEC-AUTH-06",
            title="Authentication Audit Log",
            status="advisory",
            notes="4종 event_type 모두 0 회",
        )
    if missing:
        return RuleResult(
            rule_id="SEC-AUTH-06",
            title="Authentication Audit Log",
            status="advisory",
            notes=f"event_type 누락: {missing}",
        )
    return RuleResult(
        rule_id="SEC-AUTH-06",
        title="Authentication Audit Log",
        status="compliant",
        notes="4종 event_type 모두 audit log 에 존재",
    )


# --- Public API ---


def evaluate_compliance(
    project_root: Path,
    audit_log_path: Path | None = None,
    oauth_scopes: list[str] | None = None,
    token_exp_seconds: int = 0,
    secret: str = "",
    admin_action: str = "",
) -> dict[str, Any]:
    """6 SEC-AUTH rule 의 compliance 평가."""
    if audit_log_path is None:
        audit_log_path = memory_active_dir(project_root) / "audit.md"
    if oauth_scopes is None:
        oauth_scopes = []

    results = [
        check_api_key_storage(project_root),
        check_session_token_rotation(token_exp_seconds),
        check_oauth_scope_minimal(oauth_scopes),
        check_mfa_admin_action(audit_log_path, admin_action),
        check_secret_strength(secret),
        check_auth_audit_log(audit_log_path),
    ]

    # overall: 1+ non_compliant → non_compliant
    if any(r.status == "non_compliant" for r in results):
        overall = "non_compliant"
    elif all(r.status in ("compliant", "not_applicable") for r in results):
        overall = "compliant"
    else:
        overall = "advisory"

    return {
        "baseline": "security-auth",
        "status": overall,
        "results": [
            {"rule_id": r.rule_id, "title": r.title, "status": r.status, "notes": r.notes}
            for r in results
        ],
    }
