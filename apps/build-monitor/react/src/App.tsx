// TASK-088 Astryx 부트스트랩 PoC — React + Astryx 첫 컴포넌트.
//
// React 19 + Astryx v0.1.4 + @vitejs/plugin-react + @testing-library/react
// 정합 검증. Build Server 영향 0 — 이 파일은 apps/build-monitor/src/react/
// 하위에만 존재하고 빌드 결과는 apps/build-monitor/dist-react/ 로 떨어지며
// Build Server 의 mountBuildMonitorDist (apps/build-monitor/dist/) 와 격리.
//
// 향후 PR (TASK-089~094) 에서:
//   - StatusPill (colorFor 매핑) → Astryx Badge / Tag
//   - Header → Astryx TopNav / AppShell
//   - Login / BuildsList / BuildDetail / BuildRequest / ApiConsole / Admin* → 페이지 단위 마이그레이션
//   - 디자인 토큰 (tokens.css light/dark) → Astryx CSS variable cascade 통합

import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <VStack gap={4}>
      <h1>Build Monitor — React + Astryx PoC</h1>
      <p>
        Astryx v0.1.4 (Meta, MIT, 10일 된 베타) 가 우리 build-monitor 에
        부트스트랩 됐다. 이 페이지는 <code>dist-react/</code> 로 빌드되며
        기존 Svelte 빌드 (Build Server 가 mount) 와 격리되어 있다.
      </p>
      <p data-testid="poc-status">
        <strong>상태:</strong> React 19 + @astryxdesign/core + theme-neutral
        모두 정상 로드.
      </p>
      <Button
        label="Astryx Button (PoC)"
        variant="primary"
        onClick={() => {
          // eslint-disable-next-line no-alert
          window.alert("Astryx Button click — PoC OK");
        }}
      />
    </VStack>
  );
}