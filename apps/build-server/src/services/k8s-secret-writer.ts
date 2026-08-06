import { execFile, spawn } from "node:child_process";

export interface SecretWriter {
  write(namespace: string, name: string, values: Record<string, string>): Promise<void>;
  remove(namespace: string, name: string): Promise<void>;
}

function kubectlArgs(): string[] {
  const context = process.env.HOSTING_KUBE_CONTEXT?.trim();
  return context ? ["--context", context] : [];
}

function runKubectl(args: string[], input?: string): Promise<string> {
  if (input === undefined) {
    return new Promise((resolve, reject) => {
      execFile(process.env.HOSTING_KUBECTL_BIN?.trim() || "kubectl", args, { timeout: 30_000 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`kubectl failed: ${error.message} (${stderr.trim()})`));
        else resolve(stdout.toString());
      });
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.HOSTING_KUBECTL_BIN?.trim() || "kubectl", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`kubectl failed with exit ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

export class KubectlSecretWriter implements SecretWriter {
  async write(namespace: string, name: string, values: Record<string, string>): Promise<void> {
    const data = Object.entries(values)
      .map(([key, value]) => `  ${key}: ${Buffer.from(value, "utf8").toString("base64")}`)
      .join("\n");
    const manifest = [
      "apiVersion: v1",
      "kind: Secret",
      "metadata:",
      `  name: ${name}`,
      `  namespace: ${namespace}`,
      "type: Opaque",
      "data:",
      data
    ].join("\n") + "\n";
    // Secret values only travel over stdin; they never appear in argv or logs.
    await runKubectl([...kubectlArgs(), "apply", "-f", "-"], manifest);
  }

  async remove(namespace: string, name: string): Promise<void> {
    await runKubectl([...kubectlArgs(), "delete", "secret", name, "-n", namespace, "--ignore-not-found=true"]);
  }
}
