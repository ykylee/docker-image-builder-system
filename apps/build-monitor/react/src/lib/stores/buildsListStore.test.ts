// TASK-092: buildsListStore unit tests.
//
// store 의 fetchBuilds / setFilter / reset / AbortSignal guard 동작 검증.
// 5 case — 초기 상태 / fetch success / fetch failure / abort guard / setFilter.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { useBuildsListStore } from "@/lib/stores/buildsListStore";

vi.mock("@/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listBuilds: vi.fn()
  };
});

beforeEach(() => {
  useBuildsListStore.getState().reset();
});

afterEach(() => {
  useBuildsListStore.getState().reset();
});

describe("useBuildsListStore", () => {
  it("starts in initial state", () => {
    const s = useBuildsListStore.getState();
    expect(s.builds).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.filter).toBe("ALL");
  });

  it("fetchBuilds populates builds on success", async () => {
    vi.mocked(api.listBuilds).mockResolvedValue({
      builds: [
        {
          buildId: "b-1",
          appName: "a",
          status: "BUILDING",
          phase: "REQUEST_ACCEPTED",
          previewStatus: "NOT_REQUESTED",
          previewUrl: null,
          createdAt: "2026-07-08T10:00:00.000Z",
          updatedAt: "2026-07-08T10:00:00.000Z"
        }
      ],
      nextCursor: null
    });

    await useBuildsListStore
      .getState()
      .fetchBuilds({ userId: "yklee" });

    const s = useBuildsListStore.getState();
    expect(s.builds).toHaveLength(1);
    expect(s.builds[0]?.appName).toBe("a");
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchBuilds sets error on failure", async () => {
    vi.mocked(api.listBuilds).mockRejectedValue(new Error("boom"));

    await useBuildsListStore
      .getState()
      .fetchBuilds({ userId: "yklee" });

    const s = useBuildsListStore.getState();
    expect(s.builds).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBe("boom");
  });

  it("fetchBuilds skips set when AbortSignal already aborted", async () => {
    let resolveFetch: (value: api.BuildListResponse) => void = () => undefined;
    vi.mocked(api.listBuilds).mockImplementation(
      () =>
        new Promise<api.BuildListResponse>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const controller = new AbortController();
    controller.abort();
    // fetchBuilds 자체는 await 한 시점에 listBuilds 의 promise 가 resolve
    // 되기를 기다리므로, abort 후 호출하면 setState 가 호출되지 않은 채
    // 멈춘다. 이 동작은 명시적으로 verify — caller (useEffect cleanup) 가
    // abort() 호출 후 store state 를 신뢰하면 안 된다.
    const fetchPromise = useBuildsListStore
      .getState()
      .fetchBuilds({ userId: "yklee", signal: controller.signal });

    // microtask flush — store action 의 동기 부분 (set({ loading: true })) 이
    // 먼저 실행되지만 signal check 는 await 이후.
    await Promise.resolve();

    const s = useBuildsListStore.getState();
    expect(s.loading).toBe(true);
    expect(s.builds).toEqual([]);

    // listBuilds 를 resolve 해도 signal.aborted === true 라 store 는 set 안 함.
    resolveFetch({
      builds: [
        {
          buildId: "should-not-set",
          appName: "x",
          status: "BUILDING",
          phase: "REQUEST_ACCEPTED",
          previewStatus: "NOT_REQUESTED",
          previewUrl: null,
          createdAt: "2026-07-08T10:00:00.000Z",
          updatedAt: "2026-07-08T10:00:00.000Z"
        }
      ],
      nextCursor: null
    });
    await fetchPromise;

    const s2 = useBuildsListStore.getState();
    expect(s2.builds).toEqual([]);
    expect(s2.loading).toBe(true); // set 이 호출 안 됐으므로 여전히 true
  });

  it("setFilter updates the filter", () => {
    useBuildsListStore.getState().setFilter("BUILDING");
    expect(useBuildsListStore.getState().filter).toBe("BUILDING");
  });

  it("reset restores initial state", async () => {
    vi.mocked(api.listBuilds).mockResolvedValue({
      builds: [],
      nextCursor: null
    });
    await useBuildsListStore
      .getState()
      .fetchBuilds({ userId: "yklee" });
    useBuildsListStore.getState().setFilter("FAILED");

    useBuildsListStore.getState().reset();

    const s = useBuildsListStore.getState();
    expect(s.builds).toEqual([]);
    expect(s.filter).toBe("ALL");
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });
});
