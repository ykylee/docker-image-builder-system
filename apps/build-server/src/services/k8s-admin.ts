import { execFile } from "node:child_process";

// Phase 3 / TASK-168 (P3-M3): build-server 측 k8s 관리 헬퍼.
//
// 배포(생성)는 runner 가 하지만, 호스팅 서비스의 **수명 관리**(scale/stop/
// start/delete/status)는 제어평면인 build-server 가 kubectl 을 직접 shell-out
// 해서 수행한다(설계 §9-1). runner 의 Go `kubectlDeployer` 와 대칭 — 여기선
// TS/Node child_process 로 kubectl 을 부른다.
//
// 전제: build-server 실행 환경에 `kubectl` + 유효한 kubeconfig. context 는
// `HOSTING_KUBE_CONTEXT` env 로 지정(미지정 시 현재 context). bin 은
// `HOSTING_KUBECTL_BIN`(기본 kubectl).

export interface K8sAdmin {
  // replicas 로 scale (stop=0 / start=1).
  scale(namespace: string, deploymentName: string, replicas: number): Promise<void>;
  // Deployment/Service/Ingress 삭제 (없는 자원 무시).
  remove(namespace: string, deploymentName: string): Promise<void>;
  // Deployment 의 availableReplicas 실측(없으면 0).
  availableReplicas(namespace: string, deploymentName: string): Promise<number>;
}

// KubectlRunner 는 kubectl 호출 seam. 테스트가 kubectl 없이 검증하도록 교체.
export type KubectlRunner = (args: string[]) => Promise<string>;

function contextArgs(): string[] {
  const ctx = process.env.HOSTING_KUBE_CONTEXT?.trim();
  return ctx ? ["--context", ctx] : [];
}

function defaultRunner(bin: string): KubectlRunner {
  return (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      execFile(bin, args, { timeout: 30_000 }, (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `kubectl ${args.join(" ")} failed: ${err.message} (stderr=${stderr?.trim()})`
            )
          );
          return;
        }
        resolve(stdout.toString());
      });
    });
}

export function createKubectlK8sAdmin(runner?: KubectlRunner): K8sAdmin {
  const bin = process.env.HOSTING_KUBECTL_BIN?.trim() || "kubectl";
  const run = runner ?? defaultRunner(bin);

  return {
    async scale(namespace, deploymentName, replicas) {
      await run([
        ...contextArgs(),
        "-n",
        namespace,
        "scale",
        `deployment/${deploymentName}`,
        `--replicas=${replicas}`
      ]);
    },
    async remove(namespace, deploymentName) {
      await run([
        ...contextArgs(),
        "-n",
        namespace,
        "delete",
        "deployment,service,ingress",
        deploymentName,
        "--ignore-not-found"
      ]);
    },
    async availableReplicas(namespace, deploymentName) {
      const out = await run([
        ...contextArgs(),
        "-n",
        namespace,
        "get",
        "deployment",
        deploymentName,
        "-o",
        "jsonpath={.status.availableReplicas}"
      ]);
      const n = parseInt(out.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    }
  };
}
