// TASK-144: AppHeader — Astryx `TopNav` 기반 (Header 대체, 도입 3-5).
//
// TASK-095 의 손수 만든 <header> + <nav> + 142줄 CSS 를 Astryx TopNav 로 교체.
// AppShell 의 topNav 슬롯에 들어간다 (App.tsx).
//
// ── 로직은 그대로 ─────────────────────────────────────────────────────
// admin allow-list auto-enable / logout / prefetch 는 Header 와 동일하다 —
// 마크업만 TopNav 슬롯(heading / startContent / endContent)으로 재배치했다.
//
// ── react-router 통합 ─────────────────────────────────────────────────
// 링크는 그냥 `href` 로 쓴다. main.tsx 의 `<LinkProvider component={RouterLink}>`
// 가 Astryx 링크의 href 를 react-router `<Link to>` 로 바꿔 SPA 내비게이션을
// 시킨다 (외부 링크·target=_blank 는 네이티브 <a> 유지). 그래서 여기서
// `as={Link}` 를 매번 붙일 필요가 없다.

import { useEffect, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  TopNav,
  TopNavHeading,
  TopNavItem
} from "@astryxdesign/core";

import { setUserId, useUserId } from "@/lib/useUserId";
import { clearAccessToken } from "@/lib/api";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppHeader(): ReactElement {
  const [userId] = useUserId();
  const admins = useAdminAllowListStore((s) => s.admins);
  const refreshAllowList = useAdminAllowListStore((s) => s.refresh);
  const navigate = useNavigate();

  // userId 가 admin allow-list 에 속하면 admin 진입점을 노출한다.
  const autoAdminEnabled =
    !!userId && admins.length > 0 && admins.includes(userId);
  const effectiveAdminId = autoAdminEnabled ? userId : null;

  useEffect(() => {
    if (userId && admins.length === 0) {
      refreshAllowList(userId).catch(() => {
        // stale cache — admin 메뉴는 다음 성공 refresh 까지 숨김.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function logout(): void {
    // userId 가 null 이 되면 autoAdminEnabled 도 false 가 되어 admin
    // 진입점이 자연히 사라진다.
    setUserId(null);
    clearAccessToken();
    navigate("/");
  }

  return (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          logo={
            <span aria-hidden="true" style={{ fontSize: "1.25rem" }}>
              ⬢
            </span>
          }
          heading="Build Monitor"
          headingHref="/"
        />
      }
      // startContent = 탐색 링크 전부. 모바일(<md)에서 AppShell 이 TopNav 를
      // mobile-bar 모드로 바꾸면 이 항목들은 숨겨지고 toggle → drawer 로
      // 접근한다. API Console/OpenAPI/Docs 도 탐색이므로 여기 둔다 —
      // endContent 에 두면 mobile-bar 가 숨기지 않아 모바일에서 넘친다
      // (그것이 이관 직후의 가로 스크롤 원인이었다).
      startContent={
        <>
          {userId ? (
            <>
              <TopNavItem href="/builds" label="Builds" />
              <TopNavItem href="/services" label="Services" />
              <TopNavItem href="/build-request" label="New Build" />
              {effectiveAdminId ? (
                <TopNavItem href="/admin/builds" label="Admin" />
              ) : null}
            </>
          ) : null}
          <TopNavItem href="/api-console" label="API Docs" />
        </>
      }
      // endContent = 세션 컨트롤만 (user 식별 + logout + theme). mobile-bar
      // 에서도 유지되므로 소수로 제한한다.
      endContent={
        <>
          {userId ? (
            <span className="mono" data-testid="hdr-user-id">
              @{userId}
            </span>
          ) : null}
          {effectiveAdminId ? (
            <span
              className="mono"
              title="Admin session active"
              data-testid="hdr-admin-id"
            >
              🛡 @{effectiveAdminId}
            </span>
          ) : null}
          {userId ? (
            <Button
              variant="ghost"
              label="Logout"
              onClick={logout}
              data-testid="hdr-logout"
            />
          ) : null}
          <ThemeToggle />
        </>
      }
    />
  );
}
