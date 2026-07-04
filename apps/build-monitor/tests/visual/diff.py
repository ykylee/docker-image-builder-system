"""
TASK-064 visual QA baseline — PNG baseline diff.

`capture.py` 가 생성한 run 디렉터리 (e.g. `.visual/2026-07-04T.../`) 의
PNG 들을 `baseline/` 디렉터리의 같은 경로 PNG 와 pixel-level 로 비교한다.
Pillow 의 ImageChops.difference 로 per-pixel 차이를 계산하고, threshold
(기본 0.1%) 초과 시 exit 1.

Usage:
    # baseline 캡쳐 후 비교
    python3 apps/build-monitor/tests/visual/diff.py \\
        --baseline apps/build-monitor/tests/visual/baseline \\
        --run .visual/2026-07-04T...

    # threshold 조정 (default 0.1%)
    ... --threshold 0.5

    # diff PNG 도 저장 (어디서 어긋났는지 시각화)
    ... --out-diff .visual/diff/2026-07-04T...

    # baseline 이 없는 PNG 도 보고만 하고 통과 (초기 도입 시)
    ... --allow-missing

exit code:
    0 — 모든 라우트/모드 baseline 과 diff 가 threshold 이내
    1 — threshold 초과 또는 missing 또는 diff PNG 저장 실패
    2 — 잘못된 인자 / baseline 경로 없음
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, UnidentifiedImageError


def find_pngs(root: Path) -> dict[Path, Path]:
    """root 아래의 모든 PNG 를 재귀 수집. 키는 baseline 기준 상대 경로."""
    if not root.exists():
        return {}
    result: dict[Path, Path] = {}
    for png in sorted(root.rglob("*.png")):
        result[png.relative_to(root)] = png
    return result


def pixel_diff_ratio(a: Image.Image, b: Image.Image) -> tuple[float, int]:
    """
    두 PNG 의 픽셀 차이 비율을 반환 (0.0~1.0). 사이즈가 다르면 1.0.
    RGB 로 정규화 후 채널별 histogram 합산 — 어느 채널이든 0 초과인
    픽셀을 'different' 로 본다 (anti-aliasing 노이즈 무시, 시각적으로
    의미 있는 차이만 검출).

    채널별 max 사용은 union 의 정확한 계산이 아닌 upper bound 추정이다.
    UI 가 RGB 전체가 함께 차이나는 경향이라 max 가 union 에 가깝지만,
    한 채널만 차이나는 케이스에선 undercount 가 날 수 있다. 후속 TASK
    에서 numpy 도입 시 boolean OR 로 정밀화 검토.
    """
    if a.size != b.size:
        return 1.0, a.size[0] * a.size[1]
    rgb_a = a.convert("RGB")
    rgb_b = b.convert("RGB")
    diff = ImageChops.difference(rgb_a, rgb_b)
    if diff.getbbox() is None:
        return 0.0, 0
    hist = diff.histogram()
    bins_per_channel = 256
    diff_per_channel = [
        sum(hist[i * bins_per_channel + 1 : (i + 1) * bins_per_channel])
        for i in range(3)
    ]
    diff_pixels = max(diff_per_channel)
    total_area = a.size[0] * a.size[1]
    ratio = diff_pixels / total_area if total_area else 0.0
    return ratio, diff_pixels


def _safe_open(path: Path) -> Image.Image:
    """Pillow 가 못 읽는 PNG 면 어떤 파일인지 명시해 종료."""
    try:
        return Image.open(path)
    except (UnidentifiedImageError, OSError) as error:
        print(
            f"FATAL: cannot read PNG: {path} ({error})",
            file=sys.stderr
        )
        sys.exit(1)


def compare(
    baseline_dir: Path,
    run_dir: Path,
    threshold: float,
    out_diff: Path | None,
    allow_missing: bool
) -> tuple[int, int, int, list[str]]:
    """(matched, missing, exceeded, messages) 를 반환."""
    baselines = find_pngs(baseline_dir)
    runs = find_pngs(run_dir)
    if not runs:
        return 0, 0, 0, [f"no PNG found in run dir: {run_dir}"]

    matched = 0
    missing = 0
    exceeded = 0
    messages: list[str] = []

    keys: Iterable[Path] = sorted(set(baselines) | set(runs))
    for key in keys:
        baseline_path = baselines.get(key)
        run_path = runs.get(key)
        if baseline_path is None:
            if allow_missing:
                messages.append(f"  [missing] {key} (baseline 없음 — skip)")
                continue
            missing += 1
            messages.append(f"  [missing] {key}")
            continue
        if run_path is None:
            missing += 1
            messages.append(f"  [missing] {key} (run 에 없음)")
            continue

        baseline_img = _safe_open(baseline_path)
        run_img = _safe_open(run_path)
        ratio, diff_pixels = pixel_diff_ratio(baseline_img, run_img)

        if ratio > threshold:
            exceeded += 1
            messages.append(
                f"  [exceeded] {key}: ratio={ratio:.4f} > {threshold} "
                f"({diff_pixels} pixels, size={run_img.size})"
            )
            if out_diff is not None:
                diff_target = out_diff / key
                diff_target.parent.mkdir(parents=True, exist_ok=True)
                diff_img = ImageChops.difference(
                    baseline_img.convert("RGBA"),
                    run_img.convert("RGBA")
                )
                diff_img.save(diff_target)
        else:
            matched += 1
            messages.append(
                f"  [ok] {key}: ratio={ratio:.4f} ≤ {threshold}"
            )

    return matched, missing, exceeded, messages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline",
        default="apps/build-monitor/tests/visual/baseline",
        help="Baseline PNG 루트 (default: apps/build-monitor/tests/visual/baseline)."
    )
    parser.add_argument(
        "--run",
        required=True,
        help="capture.py 가 생성한 run 디렉터리."
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.001,
        help="허용 픽셀 차이 비율 (default: 0.001 = 0.1%%)."
    )
    parser.add_argument(
        "--out-diff",
        default=None,
        help="diff PNG 저장 디렉터리. 초과한 항목만 저장."
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="baseline 이 없는 PNG 는 skip (초기 도입 시)."
    )
    args = parser.parse_args(argv)

    baseline_dir = Path(args.baseline)
    run_dir = Path(args.run)
    if not baseline_dir.exists():
        print(f"baseline dir 없음: {baseline_dir}", file=sys.stderr)
        return 2
    if not run_dir.exists():
        print(f"run dir 없음: {run_dir}", file=sys.stderr)
        return 2

    out_diff = Path(args.out_diff) if args.out_diff else None
    matched, missing, exceeded, messages = compare(
        baseline_dir,
        run_dir,
        args.threshold,
        out_diff,
        args.allow_missing
    )

    print(f"baseline: {baseline_dir}")
    print(f"run:      {run_dir}")
    print(f"threshold: {args.threshold:.4f}")
    print("")
    for m in messages:
        print(m)
    print("")
    print(f"matched: {matched}")
    print(f"missing: {missing}")
    print(f"exceeded: {exceeded}")
    if out_diff:
        print(f"diff PNG: {out_diff}")

    if exceeded > 0:
        print(f"\nFAIL: {exceeded} PNG exceeded threshold")
        return 1
    if missing > 0 and not args.allow_missing:
        print(f"\nFAIL: {missing} PNG missing in run")
        return 1
    print("\nPASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())