# standard-ai-workflow-kit: v1.0.0-beta

"""workflow_kit.lfu_config — V-R10 v3 LFU tuning config (v0.7.43+).

ADR-021 follow-up: LFU eviction strategy 의 *tuning* 의 *operational* 보강.
- frequency_weight: 0.0 (no frequency) to 1.0 (frequency only)
- recency_weight: 0.0 (no recency) to 1.0 (recency only)
- decay_seconds: time constant for access_count decay (default 86400 = 1 day)

Composite score = frequency_weight * (access_count / decay_factor) + recency_weight * (1 / age)
Lower composite score = more likely to evict.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LFUConfig:
    """LFU tuning config (v0.7.43+, ADR-021 follow-up)."""

    frequency_weight: float = 0.5
    recency_weight: float = 0.5
    decay_seconds: float = 86400.0


def compute_lfu_score(
    access_count: int,
    age_seconds: float,
    config: LFUConfig | None = None,
) -> float:
    """Compute LFU composite score (v0.7.43+, ADR-021 follow-up).

    Returns the higher-is-better composite score. Eviction logic should pick the
    entry with the LOWEST score.

    Args:
        access_count: number of cache hits
        age_seconds: time since entry creation
        config: LFUConfig (default: LFUConfig())
    """
    cfg = config or LFUConfig()
    decay_factor = max(1.0, age_seconds / cfg.decay_seconds)
    freq_score = access_count / decay_factor
    recency_score = 1.0 / max(1.0, age_seconds)
    return cfg.frequency_weight * freq_score + cfg.recency_weight * recency_score


def compute_lfu_score_with_decay(
    access_count: int,
    age_seconds: float,
    config: LFUConfig | None = None,
    half_life_seconds: float = 86400.0,
) -> float:
    """Compute LFU composite score with temporal decay (v0.7.46+, ADR-021 follow-up).

    Extends compute_lfu_score with exponential temporal decay applied to access_count:
    - effective_count = access_count * exp(-ln(2) * age_seconds / half_life_seconds)
    - This is the "radioactive decay" formula: every `half_life_seconds`, the count halves.

    Useful for cache freshness: an entry with 1000 hits 1 week ago is less valuable
    than an entry with 100 hits 1 hour ago.

    Args:
        access_count: number of cache hits
        age_seconds: time since entry creation
        config: LFUConfig (default: LFUConfig())
        half_life_seconds: time for access_count to halve (default 86400 = 1 day)

    Returns:
        Higher-is-better composite score with temporal decay applied.
    """
    import math
    cfg = config or LFUConfig()
    if half_life_seconds <= 0:
        raise ValueError("half_life_seconds must be > 0")
    # Exponential decay: count * 2^(-age / half_life) = count * exp(-ln(2) * age / half_life)
    decay_factor = math.exp(-math.log(2) * age_seconds / half_life_seconds)
    effective_count = access_count * decay_factor
    freq_score = effective_count / max(1.0, age_seconds / cfg.decay_seconds)
    recency_score = 1.0 / max(1.0, age_seconds)
    return cfg.frequency_weight * freq_score + cfg.recency_weight * recency_score
