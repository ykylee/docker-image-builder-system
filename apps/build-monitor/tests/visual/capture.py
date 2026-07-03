"""
TASK-047 light mode visual QA — Playwright headless capture.

Build Server (memory backend) + build-monitor 를 띄우고, 두 모드 (light / dark) 로
각 핵심 라우트의 PNG 를 캡쳐해서 baseline 디렉터리에 저장한다.

Usage:
    # 1) 별도 터미널에서 build-server 를 띄운다:
    #    pnpm --filter build-server dev   (port 3000)
    # 2) 별도 터미널에서 build-monitor 를 띄운다:
    #    pnpm --filter build-monitor dev  (port 5173)
    # 3) 본 스크립트 실행:
    #    python3 apps/build-monitor/tests/visual/capture.py \\
    #        --base http://127.0.0.1:5173 --out .visual/2026-07-03

스크린샷 픽셀 diff baseline :
    apps/build-monitor/tests/visual/baseline/{route}/{mode}.png  (committed)
    apps/build-monitor/tests/visual/out/{ts}/{route}/{mode}.png   (this run)

mock 로그인: `localStorage.userId` / `localStorage.adminId` 를 yky.lee 로 주입해
admin 메뉴가 노출되도록 한다. 데이터 fetch 자체는 비어있는 채로 캡쳐되므로,
시각 검증의 목적은 "토큰 / spacing 이 의도대로 적용됐는지" 라 데이터 의존성 없는
정적 surface 위주.
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROUTES = [
    ("login", "/"),
    ("builds", "/builds"),
    ("admin-builds", "/admin/builds"),
    ("admin-users", "/admin/users"),
    ("admin-admins", "/admin/admins"),
]
MODES = ["dark", "light"]


def capture(page: Page, base: str, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    # mock 로그인은 첫 navigation 전에 한 번만 주입. add_init_script 는
    # 매 navigation 마다 실행되므로, 라우트 루프 안에서 호출하면 매번
    # 누적되어 메모리에만 부담이 생긴다.
    page.add_init_script(
        """
        try {
          localStorage.setItem('userId', 'yky.lee');
          localStorage.setItem('adminId', 'yky.lee');
        } catch (_) {}
        """
    )
    for route_name, path in ROUTES:
        for mode in MODES:
            page.evaluate(
                f"document.documentElement.setAttribute('data-theme', '{mode}')"
            )
            page.goto(f"{base}{path}", wait_until="networkidle")
            # Svelte 5 reactivity settle. 두 모드 visual diff 의 핵심은
            # 토큰 적용 결과이므로, 데이터 fetch 가 끝나지 않아도 캡쳐는 OK.
            page.wait_for_timeout(300)
            target = out / route_name / f"{mode}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(target), full_page=True)
            print(f"  {route_name} {mode} -> {target}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        default="http://127.0.0.1:5173",
        help="build-monitor dev server base URL (default: http://127.0.0.1:5173)."
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output directory. Default: .visual/<UTC timestamp>."
    )
    args = parser.parse_args(argv)

    out = Path(args.out) if args.out else Path(
        f".visual/{datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%SZ')}"
    )
    print(f"capture -> {out} (base: {args.base})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        try:
            capture(page, args.base, out)
        finally:
            context.close()
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
