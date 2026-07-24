// Phase 3 / TASK-170 (P3-M5): 호스팅 관리 e2e 헬퍼.
//
// 실제 K8sAdmin(build-server 의 kubectl shell-out 관리 코드)을 kind 클러스터에
// 대해 실행해 scale(stop) + remove(delete) 가 실제로 동작함을 검증한다. 이미
// 배포돼 있는 deployment 를 대상으로 한다(e2e-hosting.sh 가 준비).
//
// env: HOSTING_KUBE_CONTEXT(kubeconfig context) — createKubectlK8sAdmin 이 읽음.
// argv: <namespace> <deploymentName>
import { createKubectlK8sAdmin } from "../src/services/k8s-admin.js";

const [, , namespace, deploymentName] = process.argv;
if (!namespace || !deploymentName) {
  console.error("usage: hosting-e2e-manage.ts <namespace> <deploymentName>");
  process.exit(2);
}

const admin = createKubectlK8sAdmin();

async function main() {
  // 초기: 최소 1 replica available 이어야 한다(이미 배포됨).
  const before = await admin.availableReplicas(namespace, deploymentName);
  if (before < 1) {
    throw new Error(`expected >=1 available replica before stop, got ${before}`);
  }

  // stop = scale 0.
  await admin.scale(namespace, deploymentName, 0);
  // scale 반영 대기(최대 20s).
  let stopped = false;
  for (let i = 0; i < 20; i++) {
    const n = await admin.availableReplicas(namespace, deploymentName);
    if (n === 0) {
      stopped = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!stopped) {
    throw new Error("stop(scale 0) did not take effect");
  }
  console.log("[manage-e2e] stop OK (availableReplicas → 0)");

  // remove = delete deployment/service/ingress.
  await admin.remove(namespace, deploymentName);
  // 삭제 확인 — deployment 가 사라지면 `kubectl get` 이 NotFound(비정상 종료)로
  // throw 한다. 그것이 곧 제거 성공. (아직 terminating 이면 재시도.)
  let gone = false;
  for (let i = 0; i < 15; i++) {
    try {
      await admin.availableReplicas(namespace, deploymentName);
    } catch {
      gone = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!gone) {
    throw new Error("remove did not delete the deployment");
  }
  console.log("[manage-e2e] remove OK (deployment 삭제됨)");
  console.log("[manage-e2e] ALL PASS");
}

main().catch((err) => {
  console.error(`[manage-e2e] FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
