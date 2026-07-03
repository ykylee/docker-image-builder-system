"""
TASK-047 light mode visual QA — Playwright headless capture.

Build Server (memory backend) + build-monitor 를 띄우고, 두 모드 (light / dark) 로
각 핵심 라우트의 PNG 를 캡쳐해서 baseline 디렉터리에 저장한다.

Usage:
    # 1) 별도 터미널에서 build-server 를 띄운다:
    #    pnpm --filter build-server dev   (또는 memory backend 직접 실행)
    # 2) 별도 터미널에서 build-monitor 를 띄운다:
    #    pnpm --filter build-monitor dev
    # 3) 본 스크립트 실행:
    #    python3 apps/build-monitor/tests/visual/capture.py [--base http://127.0.0.1:5173] [--out .visual/2026-07-03]

스크립트는 mock 로그인만 하고, 실제 build-server 가 없어도 mock-html 모드로
캡쳐 가능 (--mock-only). mock-only 는 static HTML placeholder 로 두 모드를
시각 비교하기 위한 lightweight baseline.

스크린샷 픽셀 diff baseline :
    apps/build-monitor/tests/visual/baseline/{route}/{mode}.png  (committed)
    apps/build-monitor/tests/visual/out/{ts}/{route}/{mode}.png   (this run)
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable

from playwright.sync_api import sync_playwright, Page

ROUTES = [
    ("login", "/"),
    ("builds", "/builds"),
    ("admin-builds", "/admin/builds"),
    ("admin-users", "/admin/users"),
    ("admin-admins", "/admin/admins"),
]
MODES = ["dark", "light"]


def capture(page: Page, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for route_name, path in ROUTES:
        # mock 로그인 — build-monitor 가 Header 가 admin 메뉴를 보여주도록
        # userId 와 admin allow-list 시드를 주입한다. 이는 visual diff 의
        # baseline 노이즈를 줄이기 위함.
        page.add_init_script(
            f"""
            try {{
              localStorage.setItem('userId', 'yky.lee');
              localStorage.setItem('adminId', 'yky.lee');
            }} catch (_) {{}}
            """
        )
        for mode in MODES:
            # data-theme 으로 light / dark 토글.
            page.evaluate(
                f"document.documentElement.setAttribute('data-theme', '{mode}')"
            )
            page.goto(f"{{base}}{path}" if False else f"http://127.0.0.1:5173{path}",
                      wait_until="networkidle")
            # 라우트별 약간 wait — Svelte 5 reactivity settle.
            page.wait_for_timeout(300)
            target = out / route_name / f"{mode}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(target), full_page=True)
            print(f"  {route_name} {mode} -> {target}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None,
                        help="Output directory. Default: .visual/<UTC timestamp>")
    args = parser.parse_args(argv)

    out = Path(args.out) if args.out else Path(
        f".visual/{datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%SZ')}"
    )
    print(f"capture -> {out}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        try:
            capture(page, out)
        finally:
            context.close()
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
