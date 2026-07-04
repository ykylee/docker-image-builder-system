"""
TASK-064 visual QA diff 단위 테스트.
임시 디렉터리에 baseline + run PNG 를 직접 생성해 compare() 의
matched / missing / exceeded 분기를 검증한다.
"""
from __future__ import annotations

import sys
from pathlib import Path

# diff.py 와 같은 디렉터리에 있어 sys.path 추가 불필요.
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from PIL import Image  # noqa: E402

import diff as diff_module  # noqa: E402


def make_png(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (100, 80), color)
    img.save(path)


def test_passes_when_identical(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline"
    run = tmp_path / "run"
    make_png(baseline / "login" / "dark.png", (10, 20, 30))
    make_png(run / "login" / "dark.png", (10, 20, 30))
    matched, missing, exceeded, _ = diff_module.compare(
        baseline, run, 0.001, None, False
    )
    assert matched == 1
    assert missing == 0
    assert exceeded == 0


def test_exceeds_when_one_pixel_differs_significantly(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline"
    run = tmp_path / "run"
    (baseline / "page").mkdir(parents=True, exist_ok=True)
    (run / "page").mkdir(parents=True, exist_ok=True)
    # 동일 사이즈, 한 픽셀만 다른 두 PNG.
    a = Image.new("RGB", (50, 50), (255, 255, 255))
    b = Image.new("RGB", (50, 50), (255, 255, 255))
    a.save(baseline / "page" / "light.png")
    b.save(run / "page" / "light.png")
    # 본 테스트는 "매우 다른" 케이스를 만들기 위해 1000 픽셀을 바꿈.
    for x in range(5, 45):
        for y in range(5, 25):
            b.putpixel((x, y), (0, 0, 255))
    b.save(run / "page" / "light.png")
    matched, missing, exceeded, _ = diff_module.compare(
        baseline, run, 0.001, None, False
    )
    assert exceeded == 1
    # matched 는 exceeded 와 함께 0 이 될 수도, 1 이 될 수도 있음 (구현에 따라)
    assert matched + exceeded == 1


def test_missing_when_baseline_absent(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline"
    run = tmp_path / "run"
    make_png(run / "new-route" / "dark.png", (1, 2, 3))
    matched, missing, exceeded, _ = diff_module.compare(
        baseline, run, 0.001, None, allow_missing=False
    )
    assert missing == 1
    assert matched == 0


def test_allow_missing_skips(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline"
    run = tmp_path / "run"
    make_png(run / "new-route" / "dark.png", (1, 2, 3))
    matched, missing, exceeded, _ = diff_module.compare(
        baseline, run, 0.001, None, allow_missing=True
    )
    assert missing == 0
    assert matched == 0  # skip 은 matched 도 missing 도 아닌 그냥 pass


def test_size_mismatch_is_max_diff(tmp_path: Path) -> None:
    baseline = tmp_path / "baseline"
    run = tmp_path / "run"
    (baseline / "p").mkdir(parents=True, exist_ok=True)
    (run / "p").mkdir(parents=True, exist_ok=True)
    a = Image.new("RGB", (100, 80), (10, 20, 30))
    b = Image.new("RGB", (200, 160), (10, 20, 30))
    a.save(baseline / "p" / "dark.png")
    b.save(run / "p" / "dark.png")
    matched, missing, exceeded, _ = diff_module.compare(
        baseline, run, 0.001, None, False
    )
    assert exceeded == 1


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        test_passes_when_identical(Path(tmp))
        print("✔ test_passes_when_identical")
    with tempfile.TemporaryDirectory() as tmp:
        test_exceeds_when_one_pixel_differs_significantly(Path(tmp))
        print("✔ test_exceeds_when_one_pixel_differs_significantly")
    with tempfile.TemporaryDirectory() as tmp:
        test_missing_when_baseline_absent(Path(tmp))
        print("✔ test_missing_when_baseline_absent")
    with tempfile.TemporaryDirectory() as tmp:
        test_allow_missing_skips(Path(tmp))
        print("✔ test_allow_missing_skips")
    with tempfile.TemporaryDirectory() as tmp:
        test_size_mismatch_is_max_diff(Path(tmp))
        print("✔ test_size_mismatch_is_max_diff")
    print("all visual diff tests passed")