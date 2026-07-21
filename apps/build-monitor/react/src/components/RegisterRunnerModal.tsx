// TASK-137: RegisterRunnerModal — Astryx `Dialog` 이관 (도입 3단계 첫 대상).
//
// TASK-098 의 손수 만든 모달(backdrop div + role="dialog" + 자체 Escape 핸들러
// + 148줄 CSS)을 Astryx `Dialog` + `Layout` + `TextInput` + `Button` 으로 교체.
//
// ── 이관으로 얻은 것 ──────────────────────────────────────────────────
// 1. `purpose="form"` — 사용자가 입력을 시작한 뒤에는 backdrop 클릭으로 닫히지
//    않는다. 이전 구현은 타이핑 도중 backdrop 을 잘못 눌러도 그대로 닫혀서
//    입력이 날아갔다.
// 2. 네이티브 `<dialog>` + 포커스 트랩 + 제목 자동 포커스 — 이전에는
//    `setTimeout(0)` 으로 input 에 포커스를 주는 해킹이었고 포커스 트랩은 아예
//    없었다 (Tab 으로 모달 밖 요소에 갈 수 있었다).
// 3. `TextInput status={{type:"error"}}` — 에러가 **필드에 결속**된다. 이전에는
//    화면 아래 별도 문단이라 어느 입력의 문제인지 스크린리더가 알 수 없었다.
// 4. CSS 148줄 삭제.
//
// ── 유지한 계약 ───────────────────────────────────────────────────────
// RegisterRunnerModal.test.tsx 10건이 이관 전 동작을 고정해 둔 것이며, 이관
// 후에도 그대로 통과한다 — 겉이 바뀌었을 뿐 계약은 유지됐다는 근거.
// 특히 **실패 시 모달을 닫지 않는다** (재시도 가능해야 하므로 — TASK-077
// 운영 가이드 §5 의 결정).

import { useState, type FormEvent, type ReactElement } from "react";
import {
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Text,
  TextInput
} from "@astryxdesign/core";

import { api } from "@/lib/api";

/** footer 의 제출 버튼이 content 안의 form 을 제출하도록 묶는 id. */
const FORM_ID = "register-runner-form";

export function RegisterRunnerModal({
  open,
  onClose,
  onSuccess,
  callerId
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  callerId: string | null;
}): ReactElement | null {
  const [runnerId, setRunnerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!callerId) {
      setError("401: Admin id missing — Login required.");
      return;
    }
    const trimmed = runnerId.trim();
    if (trimmed === "") {
      setError("runnerId is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fn = (api as unknown as Record<string, (p: string, init: unknown) => Promise<unknown>>).POST;
      await fn("/admin/runners", {
        headers: { "X-Admin-Id": callerId },
        body: { runnerId: trimmed }
      });
      onSuccess();
      setRunnerId("");
    } catch (err) {
      // 에러 시 모달을 닫지 않는다 — 사용자가 값을 고쳐 재시도할 수 있어야 한다.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog
      isOpen={open}
      // Astryx 는 닫힘을 `onOpenChange(false)` 로 알린다 (Escape / 닫기 버튼).
      // 우리 호출부는 인자 없는 onClose 계약이므로 여기서 변환한다.
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      // form: 입력을 시작한 뒤에는 backdrop 클릭으로 닫히지 않는다.
      purpose="form"
      width={480}
      data-testid="register-runner-modal"
    >
      <Layout
        header={
          <DialogHeader
            title="Register Runner"
            onOpenChange={(isOpen) => {
              if (!isOpen) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            <form id={FORM_ID} onSubmit={(e) => void handleSubmit(e)}>
              <Text type="supporting" as="p">
                Pre-register a runner so it appears in the admin registry before
                the runner process boots. The runner record starts as ACTIVE;
                once the runner actually starts and self-registers on its first
                claim, the existing self-register refreshes the timestamp
                without changing status.
              </Text>
              <Text type="supporting" as="p">
                The runnerId must match the RUNNER_ID env the runner process
                boots with — otherwise the runner&apos;s first claim will be
                rejected.
              </Text>
              <TextInput
                label="runnerId"
                value={runnerId}
                onChange={(value) => {
                  setRunnerId(value);
                }}
                isRequired
                isDisabled={submitting}
                hasAutoFocus
                htmlName="runnerId"
                placeholder="runner-cluster-prod-1"
                // 에러를 필드에 결속 — 스크린리더가 어느 입력의 문제인지 안다.
                status={error === null ? undefined : { type: "error", message: error }}
                data-testid="register-runner-input"
              />
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button
              variant="secondary"
              label="Cancel"
              isDisabled={submitting}
              onClick={onClose}
            />
            <Button
              variant="primary"
              type="submit"
              form={FORM_ID}
              label={submitting ? "Registering…" : "Register"}
              isDisabled={submitting}
              data-testid="register-runner-submit"
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
