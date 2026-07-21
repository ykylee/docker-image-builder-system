// TASK-137: RegisterRunnerModal 테스트.
//
// 본 컴포넌트는 TASK-077(Svelte) / TASK-098(React) 이래 **테스트가 하나도
// 없었다.** Svelte 시절의 admin 테스트는 `apps/build-monitor/src/routes/` 에
// 있었고 TASK-101(`313ae2e`, Svelte scaffold 일괄 정리)이 지우면서 React
// 트리로는 이관되지 않았다 — `react/src/routes/Admin*.test.tsx` 는 어떤
// 커밋에도 존재한 적이 없다.
//
// Astryx `Dialog` 로 이관하기 전에 **현재 동작을 먼저 고정**한다. 이관 후에도
// 이 테스트가 그대로 통과해야 "겉만 바뀌고 계약은 유지됐다"고 말할 수 있다.
//
// 고정하는 계약:
//   - 열림/닫힘 렌더링
//   - 제목 + 닫기 버튼 + Cancel/Register 액션
//   - runnerId 필수 검증 (공백만 입력 시 API 미호출)
//   - callerId 부재 시 401 안내 + API 미호출
//   - 성공 시 onSuccess 호출
//   - 실패 시 에러 표시 + 모달 유지 (재시도 가능해야 하므로 닫지 않는다)
//   - 제출 중 버튼 비활성화
//   - X-Admin-Id 헤더 전달

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RegisterRunnerModal } from "@/components/RegisterRunnerModal";
import { api } from "@/lib/api";

type PostFn = (path: string, init: unknown) => Promise<unknown>;

function postSpy() {
  return vi.spyOn(api as unknown as { POST: PostFn }, "POST");
}

function renderModal(overrides: Partial<{
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  callerId: string | null;
}> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    callerId: "admin",
    ...overrides
  };
  render(<RegisterRunnerModal {...props} />);
  return props;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RegisterRunnerModal", () => {
  it("open=false 이면 아무것도 렌더하지 않는다", () => {
    renderModal({ open: false });
    expect(screen.queryByTestId("register-runner-modal")).not.toBeInTheDocument();
  });

  it("제목과 액션을 렌더한다", () => {
    renderModal();
    expect(screen.getByText("Register Runner")).toBeInTheDocument();
    expect(screen.getByLabelText(/runnerId/)).toBeInTheDocument();
    expect(screen.getByTestId("register-runner-submit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("Cancel 이 onClose 를 호출한다", () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기(X) 버튼이 onClose 를 호출한다", () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape 키가 onClose 를 호출한다", () => {
    // 이관 전에는 window 에 keydown 리스너를 직접 걸었지만, Astryx Dialog 는
    // **dialog 엘리먼트에** 건다 (Dialog.js: `dialog.addEventListener('keydown')`).
    // 실제 브라우저에서는 포커스된 요소에서 dialog 로 버블링되므로, 내부
    // 요소에서 발화시키는 것이 사실에 가깝다.
    //
    // purpose="form" 이라 Escape 는 허용된다 (`allowEscape = purpose !== 'required'`).
    const props = renderModal();
    fireEvent.keyDown(screen.getByLabelText(/runnerId/), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("runnerId 가 공백이면 API 를 호출하지 않고 안내한다", async () => {
    const post = postSpy();
    renderModal();

    const input = screen.getByLabelText(/runnerId/);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText(/runnerId is required\./)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("callerId 가 없으면 401 안내 + API 미호출", async () => {
    const post = postSpy();
    renderModal({ callerId: null });

    const input = screen.getByLabelText(/runnerId/);
    fireEvent.change(input, { target: { value: "runner-1" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText(/Admin id missing/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("성공 시 onSuccess 를 호출하고 X-Admin-Id 를 실어 보낸다", async () => {
    const post = postSpy().mockResolvedValue({ data: { runnerId: "runner-1" } });
    const props = renderModal({ callerId: "yky.lee" });

    const input = screen.getByLabelText(/runnerId/);
    fireEvent.change(input, { target: { value: "  runner-1  " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(props.onSuccess).toHaveBeenCalledTimes(1);
    });

    expect(post).toHaveBeenCalledWith("/admin/runners", {
      headers: { "X-Admin-Id": "yky.lee" },
      // 앞뒤 공백은 잘라서 보낸다
      body: { runnerId: "runner-1" }
    });
  });

  it("실패 시 에러를 표시하고 모달을 닫지 않는다", async () => {
    // 재시도가 가능해야 하므로 에러 시 모달을 유지하는 것이 의도된 동작이다
    // (TASK-077 의 운영 가이드 §5 "admin UI 의 modal close vs error 표기 policy").
    postSpy().mockRejectedValue(new Error("409: runner already exists"));
    const props = renderModal();

    const input = screen.getByLabelText(/runnerId/);
    fireEvent.change(input, { target: { value: "dup-runner" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(await screen.findByText(/409: runner already exists/)).toBeInTheDocument();
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("register-runner-modal")).toBeInTheDocument();
  });

  it("제출 중에는 액션이 비활성화된다", async () => {
    let resolve: (v: unknown) => void = () => {};
    postSpy().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    renderModal();

    const input = screen.getByLabelText(/runnerId/);
    fireEvent.change(input, { target: { value: "runner-1" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByTestId("register-runner-submit")).toBeDisabled();
    });

    resolve({ data: {} });
  });
});
