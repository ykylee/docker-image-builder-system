// TASK-092: BuildsList state store (Zustand 5.x).
//
// BuildsList 페이지의 useState 4개 (builds / loading / error / filter) 와
// fetchBuilds action 을 단일 store 로 통합. Svelte 의 BuildsList.svelte 가
// reactive declaration (`$:`) 으로 lifecycle 을 관리하던 패턴과 의미상
// 동등. fetch cancellation 은 AbortController 로 처리 — 이전 useEffect
// cleanup flag (`cancelled` boolean) 패턴을 store action 안으로 흡수.
//
// Store lifecycle:
//   - mount: BuildsList 가 마운트될 때 자동으로 fetch 시작하지 않음 —
//     useEffect 가 userId 와 함께 fetch 를 dispatch. store 는 외부
//     trigger (fetchBuilds) 가 있어야 데이터를 가져옴.
//   - unmount: BuildsList 가 unmount 되어도 store 는 reset 되지 않음 —
//     사용자가 BuildDetail 로 갔다가 /builds 로 돌아올 때 이전 상태를
//     즉시 보여주기 위함. 캐시 역할. BuildDetail store 와 동일한 패턴.
//   - reset: 명시적으로 store.getState().reset() 호출 시. /builds 페이지
//     의 userId 가 바뀐 경우 Login 페이지에서 호출.
//
// selector 사용:
//   React 컴포넌트는 useBuildsListStore(state => state.builds) 형태로
//   개별 필드만 구독 — store 전체 re-render 회피. zustand 5.x 의 default
//   selector 가 shallow 비교를 자동 적용.

import { create } from "zustand";

import { listBuilds, type BuildSummary } from "@/lib/api";
import type { StatusFilter } from "@/lib/chipFilter";

type FetchBuildsParams = { userId: string; signal?: AbortSignal };

type State = {
  builds: BuildSummary[];
  loading: boolean;
  error: string | null;
  filter: StatusFilter;
};

type Actions = {
  fetchBuilds: (params: FetchBuildsParams) => Promise<void>;
  setFilter: (filter: StatusFilter) => void;
  reset: () => void;
};

const INITIAL_STATE: State = {
  builds: [],
  loading: false,
  error: null,
  filter: "ALL"
};

export const useBuildsListStore = create<State & Actions>((set) => ({
  ...INITIAL_STATE,
  /**
   * userId 의 BuildsList 페이지 fetch. AbortSignal 이 들어오면 그 시점에
   * fetch 결과를 set 하지 않는다 (in-flight cancellation). BuildsList 의
   * useEffect cleanup 시 AbortController.abort() 호출.
   */
  fetchBuilds: async ({ userId, signal }: FetchBuildsParams) => {
    set({ loading: true, error: null });
    try {
      const result = await listBuilds({ requestedBy: userId });
      if (signal?.aborted) {
        return;
      }
      set({ builds: result.builds, loading: false });
    } catch (e) {
      if (signal?.aborted) {
        return;
      }
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false
      });
    }
  },
  setFilter: (filter: StatusFilter) => {
    set({ filter });
  },
  reset: () => {
    set(INITIAL_STATE);
  }
}));
