"""
TASK-152 — Visual QA baseline 캡쳐 (React 19 + Astryx 정합).

Svelte 5 시절의 v1 capture.py (TASK-047) 를 React 19 + Astryx baseline
으로 갱신. 변경점:
  - 채널 `chrome` (설치된 Chrome) — B층 가드와 동일. playwright 번들
    chromium 은 우리 네트워크에서 cdn.playwright.dev ETIMEDOUT.
  - 라우트 셋 현 정합: login / builds / build-detail / build-request /
    api-console / admin-builds / admin-users / admin-admins / admin-runners
    (9개 × 2 모드 = 18 PNG + 모달 1개).
  - localStorage init: userId='admin' (admin 가드 통과) + theme='dark|light'.
    v1 의 `adminId` 는 우리 admin 가드 모델과 안 맞음 (TASK-084).
  - viewport 1440×900 (TASK-144 AppShell 가정한 데스크톱 폭).

Usage:
    # 1) build-server (memory backend) + vite dev 동시 기동.
    # 2) 본 스크립트 실행:
    #    python3 apps/build-monitor/tests/visual/capture.py \\
    #        --base http://127.0.0.1:5174 \\
    #        --out .visual/2026-07-22T13-30-00Z

스크린샷 픽셀 diff baseline:
    apps/build-monitor/tests/visual/baseline/{route}/{mode}.png
    apps/build-monitor/tests/visual/out/{ts}/{route}/{mode}.png

mock 로그인: localStorage.userId='admin' (admin 가드 자동-enable), theme
를 dark/light 양 모드 순회. RegisterRunnerModal 은 /admin/runners 진입
후 "+ Register Runner" 클릭으로 자동 오픈.
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

# 현 App.tsx 라우트 셋과 1:1 정합 (TASK-152).
ROUTES = [
    ("login", "/login"),
    ("builds", "/builds"),
    ("build-detail", "/builds/test-build-0001-1111-2222-333344445555"),
    ("build-request", "/build-request"),
    ("api-console", "/api-console"),
    ("admin-builds", "/admin/builds"),
    ("admin-users", "/admin/users"),
    ("admin-admins", "/admin/admins"),
    ("admin-runners", "/admin/runners"),
]
MODES = ["dark", "light"]


def capture(browser, base: str, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)

    # 비-Login 라우트용 page. 운영 userId='yky.lee' (ADMIN_IDS 의 첫 멤버)
    # 으로 admin 가드 통과. addInitScript 가 매 navigation 마다 실행되므로
    # localStorage 누수 방지를 위해 한 페이지로 운용.
    page = browser.new_context(
        viewport={"width": 1440, "height": 900}
    ).new_page()
    page.add_init_script(
        """
        try {
          localStorage.setItem('userId', 'yky.lee');
        } catch (_) {}
        """
    )

    # Login 페이지는 userId 가 없을 때만 Welcome 카드가 노출됨
    # (Login.tsx useEffect: userId !== null 이면 /builds 로 즉시 redirect).
    # addInitScript 가 매 navigation 마다 재실행되니, 다른 라우트의
    # userId 와 격리하기 위해 **Login 라우트만 별도 context + page** 로
    # 캡쳐한다.
    def set_theme_and_reload(p: Page, mode: str) -> None:
        """themeStore 가 localStorage 만 보고 mode 가 init-time 1회만 읽는다.
        SPA navigate (page.goto 가 같은 origin 의 다른 path 라 history 만 push)
        는 store 를 reset 하지 않으므로, localStorage 만 setItem 해서는
        theme 가 안 바뀐다. **page.reload** 가 정답 — store 가 module
        scope 라 reload 시 fresh import, init() 이 localStorage 의 새
        theme 를 읽는다. 현재 path 가 그대로 유지되니 capture 의 다음
        단계(page.goto) 가 필요 없음.

        admin-runners 의 경우 admin 가드 (ensureAdminAccess) 가 async 이므로
        reload 직후 button 이 Loading 상태일 수 있어 wait_for_selector 로
        button 가 visible 해질 때까지 기다린다 (route_name 으로 분기)."""
        p.evaluate(
            f"() => {{ try {{ localStorage.setItem('theme', '{mode}'); }} catch (_) {{}} }}"
        )
        # admin 가드 fetch 가 page load 시 일어나므로 networkidle 가 그걸
        # 기다리도록. 30s 까지 여유 — vite dev 첫 HMR 요청이 늦을 수 있음.
        p.reload(wait_until="networkidle", timeout=30000)
        # <Theme> 컴포넌트가 useEffect 에서 mode 를 동기화할 시간 여유.
        p.wait_for_timeout(500)

    def capture_modal(browser, base: str, out_path: Path, mode: str) -> None:
        """TASK-148 1호 오버레이 — RegisterRunnerModal 을 **별도 격리 컨텍스트** 로
        캡처. 메인 capture_route 의 admin-runners 루프에서 cold start +
        이전 라우트의 누적 page state 가 admin 가드 fetch 를 늦추는 영향을
        차단한다. 새 context + 새 page + localStorage 만 set + reload
        로 themeStore init() 이 localStorage 의 mode 를 정확히 읽게 한 후
        navigate — modal 가 가장 안정적으로 그려진다.
        """
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.add_init_script(
            """
            try {
              localStorage.setItem('userId', 'yky.lee');
            } catch (_) {}
            """
        )
        try:
            page.evaluate(
                f"() => {{ try {{ localStorage.setItem('theme', '{mode}'); }} catch (_) {{}} }}"
            )
            # theme 가 정확히 mode 로 set 된 상태에서 main.tsx 가 처음 실행
            # 되도록 **첫 navigate 에서 reload**. 이후 button click 만 하면 됨.
            page.goto(
                f"{base}/login",  # /login 으로 가서 main mount + themeStore init
                wait_until="networkidle",
                timeout=30000,
            )
            page.wait_for_timeout(500)
            page.goto(
                f"{base}/admin/runners",
                wait_until="networkidle",
                timeout=30000,
            )
            # admin 가드 (ensureAdminAccess) 가 fetch 끝내고 isAdmin=true 가
            # 되어 "+ Register Runner" 가 그려질 때까지 wait.
            page.locator("[data-testid='admin-runners-register']").wait_for(
                state="visible", timeout=20000
            )
            # 클릭 → 모달 open → StyleX 적용까지 안정화.
            page.locator("[data-testid='admin-runners-register']").click()
            page.wait_for_function(
                "() => !!document.querySelector(\"[data-testid='register-runner-modal']\")",
                timeout=10000,
            )
            page.wait_for_timeout(800)
            # modal 도 mode 강제 적용 — <Theme> 가 모달 내부 StyleX 도 reset
            # 할 수 있어 screenshot 직전 evaluate.
            page.evaluate(
                f"""(() => {{
                  const r = document.documentElement;
                  if ('{mode}' === 'light') {{
                    r.setAttribute('data-theme', 'light');
                  }} else {{
                    r.removeAttribute('data-theme');
                  }}
                  r.style.colorScheme = '{mode}';
                }})()"""
            )
            page.wait_for_timeout(200)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out_path), full_page=True)
        finally:
            ctx.close()

    def capture_admin_runners_isolated(browser, base: str, out_path: Path, mode: str) -> None:
        """admin-runners 의 baseline PNG (button 이 그려진 상태) 를 별도 컨텍스트로
        캡처. 메인 루프의 cold-start + 누적 page state 가 admin 가드 fetch
        를 늦추는 영향을 차단. capture_modal() 과 동일 패턴 — /login 으로
        먼저 가서 themeStore init() 한 후 /admin/runners 로 navigate."""
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.add_init_script(
            """
            try {
              localStorage.setItem('userId', 'yky.lee');
            } catch (_) {}
            """
        )
        try:
            page.evaluate(
                f"() => {{ try {{ localStorage.setItem('theme', '{mode}'); }} catch (_) {{}} }}"
            )
            page.goto(
                f"{base}/login",
                wait_until="networkidle",
                timeout=30000,
            )
            page.wait_for_timeout(500)
            page.goto(
                f"{base}/admin/runners",
                wait_until="networkidle",
                timeout=30000,
            )
            page.locator("[data-testid='admin-runners-register']").wait_for(
                state="visible", timeout=20000
            )
            page.wait_for_timeout(800)
            # screenshot 직전: data-theme 강제 적용.
            page.evaluate(
                f"""(() => {{
                  const r = document.documentElement;
                  if ('{mode}' === 'light') {{
                    r.setAttribute('data-theme', 'light');
                  }} else {{
                    r.removeAttribute('data-theme');
                  }}
                  r.style.colorScheme = '{mode}';
                }})()"""
            )
            page.wait_for_timeout(200)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out_path), full_page=True)
        finally:
            ctx.close()

    def capture_route(p: Page, route_name: str, path: str, is_isolated: bool = False) -> None:
        """한 라우트 × 두 모드를 캡쳐. themeStore 가 init 시 localStorage 만
        읽으므로 mode 마다 reload 가 필수. 첫 navigate 가 dark, 그 다음
        reload 가 light 순서로 진행 — store 가 localStorage 의 mode 를
        매번 새로 읽는다.

        admin-runners 의 RegisterRunnerModal 은 capture_modal() 로 분리.
        """
        for mode in MODES:
            set_theme_and_reload(p, mode)
            # admin-runners 의 경우 reload 후 admin 가드 (ensureAdminAccess)
            # 가 끝나고 button 이 그려질 때까지 wait. 다른 라우트는 위의
            # wait_for_selector("h1, main, [role='main']") 가 충분.
            if route_name == "admin-runners":
                # admin-runners 는 **별도 격리 컨텍스트** 로 캡처 (cold start
                # + 누적 page state 영향 차단). capture_admin_runners_isolated
                # 가 admin 가드 끝날 때까지 wait → button 이 그려진 상태로
                # PNG 캡처.
                try:
                    target = out / route_name / f"{mode}.png"
                    capture_admin_runners_isolated(browser, base, target, mode)
                    print(f"  {route_name:14} {mode:5} -> {target}  (separate ctx)")
                except Exception as exc:
                    print(f"  ! admin-runners baseline failed mode={mode}: {exc}")
            else:
                p.wait_for_timeout(800)
                try:
                    p.wait_for_selector("h1, main, [role='main']", timeout=5000)
                except Exception:
                    pass
                p.wait_for_timeout(400)
                target = out / route_name / f"{mode}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                # screenshot 직전: themeStore 가 reset 해도 강제로 data-theme
                # attribute 를 mode 에 맞게 박는다. light 면 setAttribute, dark
                # 면 removeAttribute (themeStore.applyMode 와 동일). 직후
                # screenshot 이므로 <Theme> 가 useEffect 로 reset 하기 전에
                # 캡쳐된다.
                p.evaluate(
                    f"""(() => {{
                      const r = document.documentElement;
                      if ('{mode}' === 'light') {{
                        r.setAttribute('data-theme', 'light');
                      }} else {{
                        r.removeAttribute('data-theme');
                      }}
                      r.style.colorScheme = '{mode}';
                    }})()"""
                )
                p.wait_for_timeout(200)
                p.screenshot(path=str(target), full_page=True)
                tag = "  (isolated ctx)" if is_isolated else ""
                print(f"  {route_name:14} {mode:5} -> {target}{tag}")

            # RegisterRunnerModal — TASK-148 1호 오버레이. capture_route
            # 의 메인 루프에서 분리된 capture_modal() 로 캡처 — admin-runners
            # 의 admin 가드 (ensureAdminAccess) 가 cold start 일 때 button 이
            # 늦게 그려지는 영향이 modal 캡처에 전파되지 않게 격리.
            if route_name == "admin-runners":
                try:
                    modal_target = out / route_name / f"{mode}-modal.png"
                    capture_modal(browser, base, modal_target, mode)
                    print(f"  {route_name:14} {mode:5}-modal -> {modal_target}  (separate ctx)")
                except Exception as exc:
                    print(f"  ! modal capture failed for {route_name} {mode}: {exc}")

    for route_name, path in ROUTES:
        # Login 라우트는 userId 가 없는 격리 컨텍스트.
        if route_name == "login":
            with browser.new_context(
                viewport={"width": 1440, "height": 900}
            ) as login_ctx:
                login_page = login_ctx.new_page()
                capture_route(login_page, route_name, path, is_isolated=True)
            continue

        # 그 외 라우트 — 위 page (userId='yky.lee') 재사용.
        capture_route(page, route_name, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        default="http://127.0.0.1:5174",
        help="build-monitor dev server base URL (default: http://127.0.0.1:5174).",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output directory. Default: .visual/<UTC timestamp>.",
    )
    parser.add_argument(
        "--routes",
        default=None,
        help="Comma-separated route names to capture. Default: all 9 + 1 modal.",
    )
    args = parser.parse_args(argv)

    if args.routes:
        wanted = set(args.routes.split(","))
        selected = [(n, p) for n, p in ROUTES if n in wanted]
    else:
        selected = ROUTES

    # 모듈 전역 ROUTES 를 선택 셋으로 교체 (capture 가 ROUTES 를 다시 안 읽게)
    ROUTES[:] = selected  # type: ignore[index]

    out = (
        Path(args.out)
        if args.out
        else Path(f".visual/{datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%SZ')}")
    )
    print(f"capture -> {out}  (base: {args.base}, routes: {[n for n, _ in selected]})")

    with sync_playwright() as p:
        # B층 가드와 동일 — channel: "chrome" (설치된 Chrome).
        # playwright-core 번들 chromium 은 우리 네트워크에서 ETIMEDOUT.
        browser = p.chromium.launch(channel="chrome", headless=True)
        try:
            capture(browser, args.base, out)
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
