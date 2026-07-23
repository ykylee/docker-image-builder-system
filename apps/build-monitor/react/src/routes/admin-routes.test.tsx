// TASK-143: admin 라우트 통합 테스트 (4종 공통 가드 + 페이지 고유 회귀).
//
// ── 왜 신규인가 ───────────────────────────────────────────────────────
// admin 라우트 테스트는 **Svelte 트리에만** 있었고 (`src/routes/Admin*.test.ts`)
// TASK-101(`313ae2e`)이 Svelte scaffold 를 정리하며 삭제했다. React 트리로는
// 이관된 적이 없어서, TASK-084 가 만든 admin 가드 라우트 레벨 회귀가
// 2026-07-18 이래 없었다 (TASK-137 에서 발견).
//
// 그 공백의 대가를 TASK-142 에서 치렀다 — AdminBuilds 가 존재하지 않는
// `project`/`repository` 컬럼을 헤더에 선언한 **유령 헤더** 결함이 이 테스트가
// 있었다면 잡혔을 것이다. 그래서 그 회귀도 여기서 고정한다.
//
// ── 무엇을 검증하나 ───────────────────────────────────────────────────
// 살아있는 테스트가 이미 덮는 것 — `admin-guard.test.ts`(ensureAdminAccess
// 헬퍼 로직) / `AdminAccessDenied.test.tsx`(패널) / `AdminTabs.test.tsx`(탭) —
// 는 여기서 반복하지 않는다. 여기 초점은 **라우트가 실제로 가드를 호출하고
// 그 결과에 맞게 동작하는가** 라는 통합 계약이다:
//   1. userId 없음        → `/` 로 redirect + backend API 미호출
//   2. 비-admin (guard 거부) → AdminAccessDenied 렌더 + backend API 미호출
//   3. admin              → 정상 렌더 + 올바른 backend API 호출

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => navigateMock };
});

const ensureAdminAccessMock = vi.fn();
vi.mock("@/lib/admin-guard", () => ({
  ensureAdminAccess: (id: string) => ensureAdminAccessMock(id)
}));

// 각 admin 라우트가 호출하는 목록 API 를 모두 mock. 호출 여부가 곧 "가드를
// 통과했는가" 의 관찰점이다.
const listAdminBuildsMock = vi.fn();
const listAdminUsersMock = vi.fn();
const listAdminRunnersMock = vi.fn();
const listAdminAllowListMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listAdminBuilds: (...a: unknown[]) => listAdminBuildsMock(...a),
    listAdminUsers: (...a: unknown[]) => listAdminUsersMock(...a),
    listAdminRunners: (...a: unknown[]) => listAdminRunnersMock(...a),
    listAdminAllowList: (...a: unknown[]) => listAdminAllowListMock(...a)
  };
});

import { USER_ID_KEY } from "@/lib/useUserId";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";
import { AdminBuilds } from "@/routes/AdminBuilds";
import { AdminUsers } from "@/routes/AdminUsers";
import { AdminAdmins } from "@/routes/AdminAdmins";
import { AdminRunners } from "@/routes/AdminRunners";

const ADMIN_ID = "yky.lee";

function grantAdmin(): void {
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: true,
    allowList: [ADMIN_ID],
    reason: "NOT_IN_ALLOW_LIST"
  });
}

function denyAdmin(reason: "FORBIDDEN" | "NOT_IN_ALLOW_LIST"): void {
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: false,
    allowList: [],
    reason
  });
}

/** 각 라우트의 성공 렌더 앵커 + 그 라우트가 통과 시 호출해야 하는 목록 API. */
const ROUTES = [
  {
    name: "AdminBuilds",
    Component: AdminBuilds,
    testId: "admin-builds",
    listMock: () => listAdminBuildsMock,
    seed: () => listAdminBuildsMock.mockResolvedValue({ builds: [] })
  },
  {
    name: "AdminUsers",
    Component: AdminUsers,
    testId: "admin-users",
    listMock: () => listAdminUsersMock,
    seed: () => listAdminUsersMock.mockResolvedValue({ users: [] })
  },
  {
    name: "AdminRunners",
    Component: AdminRunners,
    testId: "admin-runners",
    listMock: () => listAdminRunnersMock,
    seed: () => listAdminRunnersMock.mockResolvedValue({ runners: [] })
  }
] as const;

function renderRoute(Component: () => React.ReactElement): void {
  render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAdminAllowListStore.getState().reset();
});

afterEach(cleanup);

describe.each(ROUTES)(
  "$name — 가드 통합 계약",
  ({ Component, testId, listMock, seed }) => {
    it("userId 가 없으면 / 로 redirect 하고 backend 를 호출하지 않는다", async () => {
      renderRoute(Component);
      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith("/");
      });
      expect(listMock()).not.toHaveBeenCalled();
      expect(ensureAdminAccessMock).not.toHaveBeenCalled();
    });

    it("비-admin 이면 AdminAccessDenied 를 렌더하고 backend 를 호출하지 않는다", async () => {
      localStorage.setItem(USER_ID_KEY, "alice");
      denyAdmin("NOT_IN_ALLOW_LIST");
      seed();

      renderRoute(Component);

      // AdminAccessDenied 패널의 액션 버튼으로 렌더 확인.
      expect(
        await screen.findByTestId("admin-denied-switch-user")
      ).toBeInTheDocument();
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      // 핵심: 거부됐으면 목록 API 를 부르지 않는다 (defense in depth).
      expect(listMock()).not.toHaveBeenCalled();
    });

    it("admin 이면 정상 렌더하고 목록 API 를 호출한다", async () => {
      localStorage.setItem(USER_ID_KEY, ADMIN_ID);
      grantAdmin();
      seed();

      renderRoute(Component);

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      await waitFor(() => {
        expect(listMock()).toHaveBeenCalled();
      });
      // 목록 API 는 callerId 로 admin id 를 넘긴다 (X-Admin-Id 헤더 채움).
      expect(listMock().mock.calls[0][0]).toBe(ADMIN_ID);
    });
  }
);

// AdminAdmins 는 목록을 store(adminAllowListStore.refresh) 로 가져오므로 위
// 데이터 주도 표에 넣지 않고 따로 검증한다. 가드 계약은 동일하다.
describe("AdminAdmins — 가드 통합 계약", () => {
  it("userId 가 없으면 / 로 redirect 한다", async () => {
    render(
      <MemoryRouter>
        <AdminAdmins />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
    expect(ensureAdminAccessMock).not.toHaveBeenCalled();
  });

  it("비-admin 이면 AdminAccessDenied 를 렌더한다", async () => {
    localStorage.setItem(USER_ID_KEY, "alice");
    denyAdmin("FORBIDDEN");
    render(
      <MemoryRouter>
        <AdminAdmins />
      </MemoryRouter>
    );
    expect(
      await screen.findByTestId("admin-denied-switch-user")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("admin-admins")).not.toBeInTheDocument();
  });

  it("admin 이면 정상 렌더한다", async () => {
    localStorage.setItem(USER_ID_KEY, ADMIN_ID);
    grantAdmin();
    listAdminAllowListMock.mockResolvedValue({ admins: [ADMIN_ID] });
    render(
      <MemoryRouter>
        <AdminAdmins />
      </MemoryRouter>
    );
    expect(await screen.findByTestId("admin-admins")).toBeInTheDocument();
  });
});

describe("AdminBuilds — 유령 헤더 회귀 (TASK-142)", () => {
  it("헤더는 정확히 Status/Build/App/Owner/Updated 5열이다 (Project/Repository 없음)", async () => {
    localStorage.setItem(USER_ID_KEY, ADMIN_ID);
    grantAdmin();
    // 빌드가 0건이면 AdminBuilds 는 "No builds" 분기라 Table 을 렌더하지
    // 않는다 — 헤더를 보려면 최소 1건이 필요하다.
    listAdminBuildsMock.mockResolvedValue({
      builds: [
        {
          buildId: "00000000-0000-0000-0000-000000000001",
          appName: "demo",
          status: "COMPLETED",
          phase: "COMPLETED",
          previewUrl: null,
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
          requestedBy: "bob"
        }
      ]
    });

    render(
      <MemoryRouter>
        <AdminBuilds />
      </MemoryRouter>
    );

    await screen.findByTestId("admin-builds");
    // Table 헤더가 그려질 때까지 대기 (findByRole). admin-builds 앵커가 떠도
    // 데이터 로드 직후 Table 이 한 프레임 뒤에 헤더를 붙일 수 있다.
    await screen.findByRole("columnheader", { name: "Status" });
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim());

    // BuildSummary 에는 project/repository 필드가 없다. 이관 전에는 헤더가
    // 그 두 유령 컬럼을 선언해 본문과 어긋나 있었다 — 다시 새어 들어오면 잡는다.
    expect(headers).toEqual([
      "Status",
      "Build",
      "App",
      "Owner",
      "Updated"
    ]);
    expect(headers).not.toContain("Project");
    expect(headers).not.toContain("Repository");
  });
});

describe("AdminUsers — recent builds 패널", () => {
  it("사용자 행의 'Show builds' 로 recent 패널을 열고 그 사용자의 빌드를 조회한다", async () => {
    localStorage.setItem(USER_ID_KEY, ADMIN_ID);
    grantAdmin();
    listAdminUsersMock.mockResolvedValue({
      users: [{ userId: "bob", buildCount: 2, lastBuildAt: null }]
    });
    listAdminBuildsMock.mockResolvedValue({ builds: [] });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByTestId("admin-users-expand-bob"));

    // 패널이 열리면 해당 사용자로 필터한 빌드 조회가 일어난다.
    await waitFor(() => {
      expect(listAdminBuildsMock).toHaveBeenCalledWith(ADMIN_ID, {
        requestedBy: "bob"
      });
    });
    expect(screen.getByText(/Recent builds for @bob/)).toBeInTheDocument();
  });
});

describe("AdminRunners — Register Runner 진입", () => {
  it("헤더의 '+ Register Runner' 버튼이 모달을 연다", async () => {
    localStorage.setItem(USER_ID_KEY, ADMIN_ID);
    grantAdmin();
    listAdminRunnersMock.mockResolvedValue({ runners: [] });

    render(
      <MemoryRouter>
        <AdminRunners />
      </MemoryRouter>
    );

    await screen.findByTestId("admin-runners");
    fireEvent.click(screen.getByRole("button", { name: /Register Runner/i }));

    // 모달은 지연 로드(TASK-137)이므로 도착까지 기다린다.
    expect(
      await screen.findByLabelText(/runnerId/, {}, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
