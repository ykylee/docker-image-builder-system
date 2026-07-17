// TASK-092: BuildDetail state store (Zustand 5.x).
//
// BuildDetail 페이지의 useState 4개 (build / logs / loading / error) 와
// fetchBuild action 을 단일 store 로 통합. fetchBuildLogs 실패는 silent
// (caller 가 .catch(() => null) 했던 패턴을 store 내부로 흡수) — LogStream
// entries 빈 배열 fallback.
//
// AbortController 통합:
//   useBuildDetail 의 page 가 unmount 되거나 다른 buildId 로 라우팅 시
//   in-flight fetch 결과를 set 하지 않는다. fetchBuild 가 AbortSignal 을
//   받으면, signal.aborted 시 set 호출을 모두 차단.
//
//   주의: openapi-fetch 의 listBuilds/getBuildLogs 자체는 AbortSignal 을
//   직접 받지 않으므로, store 레벨에서만 abort 가능 (network cancel 은
//   fetch API level — api.ts 의 fetchFn 에 signal 전달은 TASK-093 후속).
//   본 TASK 의 abort 는 "fetch 가 끝난 후 stale result 를 무시" 하는
//   application-level guard.

import { create } from "zustand";

import {
  getBuild,
  getBuildLogs,
  type BuildLogsResponse,
  type BuildStatusResponse
} from "@/lib/api";

type FetchBuildParams = { buildId: string; signal?: AbortSignal };

type State = {
  build: BuildStatusResponse | null;
  logs: BuildLogsResponse | null;
  loading: boolean;
  error: string | null;
};

type Actions = {
  fetchBuild: (params: FetchBuildParams) => Promise<void>;
  reset: () => void;
};

const INITIAL_STATE: State = {
  build: null,
  logs: null,
  loading: false,
  error: null
};

export const useBuildDetailStore = create<State & Actions>((set) => ({
  ...INITIAL_STATE,
  /**
   * buildId 의 BuildDetail 페이지 fetch. Promise.all([getBuild, getBuildLogs])
   * — getBuildLogs 실패는 silent (LOG_NOT_FOUND 등 logs 부재 케이스 대응).
   * AbortSignal 이 들어오면 in-flight 결과를 set 하지 않는다.
   */
  fetchBuild: async ({ buildId, signal }: FetchBuildParams) => {
    set({ loading: true, error: null });
    try {
      const [b, l] = await Promise.all([
        getBuild(buildId),
        getBuildLogs(buildId).catch(
          () => null as BuildLogsResponse | null
        )
      ]);
      if (signal?.aborted) {
        return;
      }
      set({ build: b, logs: l, loading: false });
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
  reset: () => {
    set(INITIAL_STATE);
  }
}));
