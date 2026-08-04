// TASK-168 (P3-M3): AdminHostedServices — 목록 렌더 + 관리 액션(stop/delete).
import { describe, it, expect, beforeEach, vi } from "vitest";
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

const listMock = vi.fn();
const capacityMock = vi.fn();
const stopMock = vi.fn();
const startMock = vi.fn();
const removeMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listHostedServices: (...a: unknown[]) => listMock(...a),
    getHostingCapacity: (...a: unknown[]) => capacityMock(...a),
    stopHostedService: (...a: unknown[]) => stopMock(...a),
    startHostedService: (...a: unknown[]) => startMock(...a),
    removeHostedService: (...a: unknown[]) => removeMock(...a)
  };
});

import { USER_ID_KEY } from "@/lib/useUserId";
import { AdminHostedServices } from "@/routes/AdminHostedServices";

const ADMIN_ID = "yky.lee";

function svc(over: Partial<Record<string, unknown>> = {}) {
  return {
    appName: "todo-app",
    contextPath: "todo-app",
    namespace: "dib-hosted",
    deploymentName: "dib-todo-app",
    containerPort: 8080,
    stripPrefix: true,
    effectiveTier: "standard",
    serviceSize: "medium",
    resources: {
      cpuRequest: "250m",
      memoryRequest: "512Mi",
      cpuLimit: "1",
      memoryLimit: "1Gi",
      replicas: 1
    },
    status: "RUNNING",
    url: "https://apps.example.com/todo-app/",
    currentBuildId: null,
    imageRef: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
    lastDeployedAt: "2026-07-24T00:00:00Z",
    ...over
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.setItem(USER_ID_KEY, ADMIN_ID);
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: true,
    allowList: [ADMIN_ID],
    reason: "NOT_IN_ALLOW_LIST"
  });
  listMock.mockResolvedValue({ services: [svc()] });
  capacityMock.mockResolvedValue({
    capacity: { cpuMillicores: 2000, memoryMi: 5632 },
    used: { cpuMillicores: 250, memoryMi: 512 },
    remaining: { cpuMillicores: 1750, memoryMi: 5120 },
    tiers: {
      sandbox: { tier: "sandbox", cpuServices: 20, memoryServices: 44, maxServices: 20, perService: { cpuMillicores: 100, memoryMi: 128, replicas: 1 } },
      standard: { tier: "standard", cpuServices: 8, memoryServices: 11, maxServices: 8, perService: { cpuMillicores: 250, memoryMi: 512, replicas: 1 } },
      production: { tier: "production", cpuServices: 2, memoryServices: 2, maxServices: 2, perService: { cpuMillicores: 1000, memoryMi: 2048, replicas: 2 } }
    }
  });
  stopMock.mockResolvedValue(svc({ status: "STOPPED" }));
  removeMock.mockResolvedValue(svc({ status: "REMOVED" }));
});

function renderPage(): void {
  render(
    <MemoryRouter>
      <AdminHostedServices />
    </MemoryRouter>
  );
}

describe("AdminHostedServices", () => {
  it("capacity panel에 사용량과 tier별 수용량을 표시한다", async () => {
    renderPage();
    expect(await screen.findByTestId("hosting-capacity-panel")).toBeInTheDocument();
    expect(screen.getByTestId("hosting-capacity-used")).toHaveTextContent("250m / 512Mi");
    expect(screen.getByTestId("hosting-capacity-standard")).toHaveTextContent("8 services");
  });

  it("호스팅 서비스의 effective tier와 자원 프로파일을 표시", async () => {
    listMock.mockResolvedValueOnce({ services: [svc()] });
    renderPage();
    expect(await screen.findByTestId("hosting-tier-todo-app")).toHaveTextContent("standard");
    expect(screen.getByTestId("hosting-resources-todo-app")).toHaveTextContent("250m / 512Mi · 1r");
  });

  it("호스팅 서비스 목록을 렌더한다", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("hosting-row-todo-app")).toBeInTheDocument()
    );
    expect(screen.getByText("/todo-app/")).toBeInTheDocument();
    expect(
      screen.getByText("https://apps.example.com/todo-app/")
    ).toBeInTheDocument();
  });

  it("Stop 클릭 시 stopHostedService 호출 + 목록 갱신", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("hosting-stop-todo-app")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("hosting-stop-todo-app"));
    await waitFor(() =>
      expect(stopMock).toHaveBeenCalledWith(ADMIN_ID, "todo-app")
    );
    // 액션 후 refresh — list 가 2회(초기 + 갱신) 호출
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("Delete 클릭 시 removeHostedService 호출", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("hosting-delete-todo-app")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("hosting-delete-todo-app"));
    await waitFor(() =>
      expect(removeMock).toHaveBeenCalledWith(ADMIN_ID, "todo-app")
    );
  });

  it("빈 목록이면 empty 안내", async () => {
    listMock.mockResolvedValue({ services: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("hosting-empty")).toBeInTheDocument()
    );
  });
});
