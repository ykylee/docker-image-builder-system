package deploy

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// helmDeployer implements the K8sDeployer contract through the Helm CLI.
// Charts must consume the runner's small values contract:
// image.repository, image.tag, service.port, hosting.contextPath,
// hosting.basePath, hosting.stripPrefix, and build.id.
type helmDeployer struct {
	helmBin        string
	defaultNS      string
	defaultChart   string
	defaultRelease string
	valuesFile     string
	setValues      []string
	timeout        time.Duration
	now            func() time.Time
	runCmd         func(context.Context, ...string) (string, error)
}

func newHelmDeployer(seed K8sDeployOptions) *helmDeployer {
	bin := os.Getenv("RUNNER_HELM_BIN")
	if bin == "" {
		bin = "helm"
	}
	ns := seed.Namespace
	if ns == "" {
		ns = "dib-builds"
	}
	release := seed.HelmRelease
	if release == "" {
		release = "dib-build"
	}
	timeout := 120 * time.Second
	if raw := os.Getenv("RUNNER_HELM_TIMEOUT_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			timeout = time.Duration(n) * time.Second
		}
	}
	d := &helmDeployer{
		helmBin: bin, defaultNS: ns, defaultChart: seed.HelmChart,
		defaultRelease: release, valuesFile: seed.HelmValuesFile,
		setValues: append([]string(nil), seed.HelmSetValues...), timeout: timeout,
		now: time.Now,
	}
	d.runCmd = d.defaultRunCmd
	return d
}

func (d *helmDeployer) namespaceOf(opts K8sDeployOptions) string {
	if opts.Namespace != "" {
		return opts.Namespace
	}
	return d.defaultNS
}

func (d *helmDeployer) chartOf(opts K8sDeployOptions) string {
	if opts.HelmChart != "" {
		return opts.HelmChart
	}
	return d.defaultChart
}

func (d *helmDeployer) releaseOf(opts K8sDeployOptions) string {
	if opts.HelmRelease != "" {
		return opts.HelmRelease
	}
	return d.defaultRelease
}

func (d *helmDeployer) Deploy(ctx context.Context, opts K8sDeployOptions) (*K8sResult, error) {
	if opts.SourceImage == "" {
		return nil, fmt.Errorf("deploy: source image is required")
	}
	if opts.BuildID == "" {
		return nil, fmt.Errorf("deploy: buildID is required")
	}
	chart := d.chartOf(opts)
	if chart == "" {
		return nil, fmt.Errorf("deploy: helm chart is required")
	}
	namespace := d.namespaceOf(opts)
	release := d.releaseOf(opts)
	if release == "" {
		return nil, fmt.Errorf("deploy: helm release is required")
	}
	port := opts.ContainerPort
	if port <= 0 {
		port = 8080
	}
	contextPath := opts.ContextPath
	if contextPath == "" {
		contextPath = deploymentName(opts.BuildID)
	}
	repo, tag := splitImageRef(opts.SourceImage)
	args := []string{"upgrade", "--install", release, chart, "--namespace", namespace, "--create-namespace", "--wait", "--timeout", d.timeout.String()}
	args = append(args, helmContextArgs(opts.Cluster)...)
	if d.valuesFile != "" {
		args = append(args, "--values", d.valuesFile)
	}
	if opts.HelmValuesFile != "" {
		args = append(args, "--values", opts.HelmValuesFile)
	}
	args = append(args,
		"--set-string", "image.repository="+repo,
		"--set-string", "image.tag="+tag,
		"--set-string", "service.port="+strconv.Itoa(port),
		"--set-string", "hosting.contextPath="+contextPath,
		"--set-string", "hosting.basePath="+helmBasePath(contextPath, opts.HostingScheme),
		"--set-string", "hosting.stripPrefix="+strconv.FormatBool(opts.StripPrefix),
		"--set-string", "hosting.scheme="+defaultHostingScheme(opts.HostingScheme),
		"--set-string", "hosting.baseHost="+opts.BaseHost,
		"--set-string", "build.id="+opts.BuildID,
	)
	if opts.Resources != nil {
		quota := quotaForTier(opts.Resources.Tier)
		args = append(args,
			"--set", "replicaCount="+strconv.Itoa(maxInt(opts.Resources.Replicas, 1)),
			"--set-string", "hosting.tier="+opts.Resources.Tier,
			"--set-string", "resources.requests.cpu="+opts.Resources.CPURequest,
			"--set-string", "resources.requests.memory="+opts.Resources.MemoryRequest,
			"--set-string", "resources.limits.cpu="+opts.Resources.CPULimit,
			"--set-string", "resources.limits.memory="+opts.Resources.MemoryLimit,
			"--set-string", "quota.requestsCpu="+quota.cpu,
			"--set-string", "quota.requestsMemory="+quota.memory,
			"--set-string", "quota.limitsCpu="+quota.cpuLimit,
			"--set-string", "quota.limitsMemory="+quota.memoryLimit,
			"--set-string", "quota.pods="+quota.pods,
		)
	}
	args = append(args, d.setValues...)
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	if _, err := d.runCmd(timeoutCtx, args...); err != nil {
		return nil, fmt.Errorf("deploy: helm upgrade failed: %w", err)
	}
	return &K8sResult{
		Cluster: opts.Cluster, Namespace: namespace, TargetType: "K8S",
		Manifest: chart, ResultRef: fmt.Sprintf("helm/%s", release),
		AppliedAt: d.now().UTC(), DeploymentID: release, ContextPath: contextPath,
	}, nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (d *helmDeployer) Apply(ctx context.Context, opts K8sApplyOptions) (*K8sResult, error) {
	if opts.Manifest == "" {
		return nil, fmt.Errorf("deploy: helm chart is required for apply")
	}
	ns := opts.Namespace
	if ns == "" {
		ns = d.defaultNS
	}
	release := opts.HelmRelease
	if release == "" {
		release = opts.BuildID
	}
	if release == "" {
		release = d.defaultRelease
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	args := []string{"upgrade", "--install", release, opts.Manifest, "--namespace", ns, "--create-namespace", "--wait", "--timeout", d.timeout.String()}
	args = append(args, helmContextArgs(opts.Cluster)...)
	if _, err := d.runCmd(timeoutCtx, args...); err != nil {
		return nil, fmt.Errorf("deploy: helm upgrade failed: %w", err)
	}
	return &K8sResult{Cluster: opts.Cluster, Namespace: ns, TargetType: "K8S", Manifest: opts.Manifest, ResultRef: "helm/" + release, AppliedAt: d.now().UTC(), DeploymentID: release}, nil
}

func (d *helmDeployer) Cleanup(ctx context.Context, opts K8sCleanupOptions) error {
	release := opts.HelmRelease
	if release == "" {
		release = opts.BuildID
	}
	if release == "" {
		return nil
	}
	ns := opts.Namespace
	if ns == "" {
		ns = d.defaultNS
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	args := []string{"uninstall", release, "--namespace", ns, "--ignore-not-found"}
	args = append(args, helmContextArgs(opts.Cluster)...)
	if _, err := d.runCmd(timeoutCtx, args...); err != nil {
		return fmt.Errorf("deploy: helm uninstall failed: %w", err)
	}
	return nil
}

func helmContextArgs(cluster string) []string {
	if strings.TrimSpace(cluster) == "" {
		return nil
	}
	return []string{"--kube-context", cluster}
}

func (d *helmDeployer) defaultRunCmd(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, d.helmBin, args...)
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = io.MultiWriter(os.Stderr, &stderr)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}
	return "", nil
}

func splitImageRef(ref string) (string, string) {
	idx := strings.LastIndex(ref, ":")
	if idx <= strings.LastIndex(ref, "/") {
		return ref, "latest"
	}
	return ref[:idx], ref[idx+1:]
}

func helmBasePath(contextPath, scheme string) string {
	if scheme == "subdomain" {
		return "/"
	}
	return "/" + contextPath + "/"
}

func defaultHostingScheme(scheme string) string {
	if scheme == "subdomain" {
		return scheme
	}
	return "path"
}
