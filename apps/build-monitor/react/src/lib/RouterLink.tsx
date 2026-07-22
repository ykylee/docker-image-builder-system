// TASK-144: Astryx 링크 ↔ react-router 어댑터.
//
// Astryx 의 링크 컴포넌트(TopNavItem / TopNavHeading / Link 등)는 `as` 로
// 넘긴 컴포넌트에 **`href`** 를 전달한다 (native `<a>` 규약). 그러나
// react-router `Link` 는 `to` 를 읽으므로 그대로는 맞지 않는다.
//
// 이 어댑터는 `href` 를 받아 `<Link to={href}>` 로 바꾼다. `LinkProvider` 에
// `component={RouterLink}` 로 한 번 등록하면 (main.tsx) **모든 Astryx 링크가
// SPA 내비게이션**을 쓴다 — 매 항목에 `as={RouterLink}` 를 붙일 필요가 없다.
//
// 외부 링크(`http`, `mailto:`, `//`)와 앵커(`#`)는 react-router 로 넘기지
// 않고 네이티브 `<a>` 로 둔다 — SPA 라우터가 앱 밖 주소를 가로채면 안 된다.

import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link } from "react-router-dom";

function isExternal(href: string): boolean {
  return (
    /^https?:\/\//.test(href) ||
    href.startsWith("//") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  );
}

export const RouterLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }
>(function RouterLink({ href, children, ...rest }, ref) {
  if (href === undefined || isExternal(href) || rest.target === "_blank") {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link ref={ref} to={href} {...rest}>
      {children}
    </Link>
  );
});
