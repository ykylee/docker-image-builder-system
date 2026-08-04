package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// argoCDDeployer manages an Argo CD Application through kubectl. The runner
// does not need the argocd CLI: it applies an Application CR, then waits for
// Argo CD to report Synced and Healthy.
type argoCDDeployer struct {
	kubectlBin      string
	defaultNS       string
	defaultArgoNS   string
	defaultProject  string
	defaultRepoURL  string
	defaultPath     string
	defaultRevision string
	destinationHost string
	timeout         time.Duration
	now             func() time.Time
	runCmd          func(context.Context, string, ...string) (string, error)
}

func newArgoCDDeployer(seed K8sDeployOptions) *argoCDDeployer {
	kubectlBin := os.Getenv("RUNNER_KUBECTL_BIN")
	if kubectlBin == "" {
		kubectlBin = "kubectl"
	}
	ns := seed.Namespace
	if ns == "" {
		ns = "dib-builds"
	}
	argoNS := seed.ArgoCDNamespace
	if argoNS == "" {
		argoNS = "argocd"
	}
	project := seed.ArgoCDProject
	if project == "" {
		project = "default"
	}
	revision := seed.ArgoCDTargetRevision
	if revision == "" {
		revision = "HEAD"
	}
	destination := seed.ArgoCDDestinationHost
	if destination == "" {
		destination = "https://kubernetes.default.svc"
	}
	timeout := 120 * time.Second
	if raw := os.Getenv("RUNNER_ARGOCD_TIMEOUT_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			timeout = time.Duration(n) * time.Second
		}
	}
	d := &argoCDDeployer{
		kubectlBin: kubectlBin, defaultNS: ns, defaultArgoNS: argoNS,
		defaultProject: project, defaultRepoURL: seed.ArgoCDRepoURL,
		defaultPath: seed.ArgoCDPath, defaultRevision: revision,
		destinationHost: destination, timeout: timeout, now: time.Now,
	}
	d.runCmd = d.defaultRunCmd
	return d
}

func (d *argoCDDeployer) namespaceOf(opts K8sDeployOptions) string {
	if opts.Namespace != "" {
		return opts.Namespace
	}
	return d.defaultNS
}

func (d *argoCDDeployer) repoURLOf(opts K8sDeployOptions) string {
	if opts.ArgoCDRepoURL != "" {
		return opts.ArgoCDRepoURL
	}
	return d.defaultRepoURL
}

func (d *argoCDDeployer) pathOf(opts K8sDeployOptions) string {
	if opts.ArgoCDPath != "" {
		return opts.ArgoCDPath
	}
	return d.defaultPath
}

func (d *argoCDDeployer) argoNamespaceOf(opts K8sDeployOptions) string {
	if opts.ArgoCDNamespace != "" {
		return opts.ArgoCDNamespace
	}
	return d.defaultArgoNS
}

func (d *argoCDDeployer) projectOf(opts K8sDeployOptions) string {
	if opts.ArgoCDProject != "" {
		return opts.ArgoCDProject
	}
	return d.defaultProject
}

func (d *argoCDDeployer) revisionOf(opts K8sDeployOptions) string {
	if opts.ArgoCDTargetRevision != "" {
		return opts.ArgoCDTargetRevision
	}
	return d.defaultRevision
}

func (d *argoCDDeployer) destinationOf(opts K8sDeployOptions) string {
	if opts.ArgoCDDestinationHost != "" {
		return opts.ArgoCDDestinationHost
	}
	return d.destinationHost
}

func (d *argoCDDeployer) Deploy(ctx context.Context, opts K8sDeployOptions) (*K8sResult, error) {
	if opts.SourceImage == "" {
		return nil, fmt.Errorf("deploy: source image is required")
	}
	if opts.BuildID == "" {
		return nil, fmt.Errorf("deploy: buildID is required")
	}
	repoURL := d.repoURLOf(opts)
	path := d.pathOf(opts)
	if repoURL == "" || path == "" {
		return nil, fmt.Errorf("deploy: ArgoCD repo URL and path are required")
	}
	name := deploymentName(opts.BuildID)
	appNamespace := d.argoNamespaceOf(opts)
	targetNamespace := d.namespaceOf(opts)
	contextPath := opts.ContextPath
	if contextPath == "" {
		contextPath = name
	}
	repo, tag := splitImageRef(opts.SourceImage)
	manifest, err := renderArgoCDApplication(argoApplicationOptions{
		Name: name, ArgoNamespace: appNamespace, Project: d.projectOf(opts),
		RepoURL: repoURL, Path: path, Revision: d.revisionOf(opts),
		Destination: d.destinationOf(opts), TargetNamespace: targetNamespace,
		ImageRepository: repo, ImageTag: tag, ServicePort: opts.ContainerPort,
		ContextPath: contextPath, StripPrefix: opts.StripPrefix,
		HostingScheme: defaultHostingScheme(opts.HostingScheme), BaseHost: opts.BaseHost,
		Resources: opts.Resources,
		BuildID:   opts.BuildID,
	})
	if err != nil {
		return nil, fmt.Errorf("deploy: render ArgoCD application: %w", err)
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	applyArgs := append(contextArgs(opts.Cluster), "apply", "-n", appNamespace, "-f", "-")
	if _, err := d.runCmd(timeoutCtx, manifest, applyArgs...); err != nil {
		return nil, fmt.Errorf("deploy: kubectl apply ArgoCD application failed: %w", err)
	}
	if err := d.waitSyncedAndHealthy(timeoutCtx, opts.Cluster, appNamespace, name); err != nil {
		return nil, err
	}
	return &K8sResult{
		Cluster: opts.Cluster, Namespace: targetNamespace, TargetType: "K8S",
		Manifest: path, ResultRef: fmt.Sprintf("argocd/%s/%s", appNamespace, name),
		AppliedAt: d.now().UTC(), DeploymentID: name, ContextPath: contextPath,
	}, nil
}

func (d *argoCDDeployer) Apply(ctx context.Context, opts K8sApplyOptions) (*K8sResult, error) {
	if opts.Manifest == "" {
		return nil, fmt.Errorf("deploy: ArgoCD application manifest is required for apply")
	}
	appNamespace := d.defaultArgoNS
	name := opts.BuildID
	if name == "" {
		return nil, fmt.Errorf("deploy: buildID is required for ArgoCD apply")
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	args := append(contextArgs(opts.Cluster), "apply", "-n", appNamespace, "-f", opts.Manifest)
	if _, err := d.runCmd(timeoutCtx, "", args...); err != nil {
		return nil, fmt.Errorf("deploy: kubectl apply ArgoCD manifest failed: %w", err)
	}
	if err := d.waitSyncedAndHealthy(timeoutCtx, opts.Cluster, appNamespace, deploymentName(name)); err != nil {
		return nil, err
	}
	return &K8sResult{Cluster: opts.Cluster, Namespace: opts.Namespace, TargetType: "K8S", Manifest: opts.Manifest, ResultRef: "argocd/" + appNamespace + "/" + deploymentName(name), AppliedAt: d.now().UTC(), DeploymentID: deploymentName(name)}, nil
}

func (d *argoCDDeployer) waitSyncedAndHealthy(ctx context.Context, cluster, namespace, name string) error {
	resource := "application/" + name
	syncArgs := append(contextArgs(cluster), "wait", resource, "-n", namespace, "--for=jsonpath={.status.sync.status}=Synced", "--timeout="+d.timeout.String())
	if _, err := d.runCmd(ctx, "", syncArgs...); err != nil {
		return fmt.Errorf("deploy: ArgoCD application sync failed: %w", err)
	}
	healthArgs := append(contextArgs(cluster), "wait", resource, "-n", namespace, "--for=jsonpath={.status.health.status}=Healthy", "--timeout="+d.timeout.String())
	if _, err := d.runCmd(ctx, "", healthArgs...); err != nil {
		return fmt.Errorf("deploy: ArgoCD application health failed: %w", err)
	}
	return nil
}

func (d *argoCDDeployer) Cleanup(ctx context.Context, opts K8sCleanupOptions) error {
	if opts.BuildID == "" {
		return nil
	}
	name := deploymentName(opts.BuildID)
	timeoutCtx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()
	args := append(contextArgs(opts.Cluster), "delete", "application", name, "-n", d.defaultArgoNS, "--cascade=foreground", "--ignore-not-found")
	if _, err := d.runCmd(timeoutCtx, "", args...); err != nil {
		return fmt.Errorf("deploy: ArgoCD application delete failed: %w", err)
	}
	return nil
}

type argoApplicationOptions struct {
	Name, ArgoNamespace, Project, RepoURL, Path, Revision string
	Destination, TargetNamespace                          string
	ImageRepository, ImageTag                             string
	ServicePort                                           int
	ContextPath, HostingScheme                            string
	StripPrefix                                           bool
	BaseHost, BuildID                                     string
	Resources                                             *ResourceProfile
}

func renderArgoCDApplication(opts argoApplicationOptions) (string, error) {
	port := opts.ServicePort
	if port <= 0 {
		port = 8080
	}
	parameters := []map[string]any{
		{"name": "image.repository", "value": opts.ImageRepository, "forceString": true},
		{"name": "image.tag", "value": opts.ImageTag, "forceString": true},
		{"name": "service.port", "value": strconv.Itoa(port), "forceString": true},
		{"name": "hosting.contextPath", "value": opts.ContextPath, "forceString": true},
		{"name": "hosting.basePath", "value": helmBasePath(opts.ContextPath, opts.HostingScheme), "forceString": true},
		{"name": "hosting.stripPrefix", "value": strconv.FormatBool(opts.StripPrefix), "forceString": true},
		{"name": "hosting.scheme", "value": defaultHostingScheme(opts.HostingScheme), "forceString": true},
		{"name": "hosting.baseHost", "value": opts.BaseHost, "forceString": true},
		{"name": "build.id", "value": opts.BuildID, "forceString": true},
	}
	if opts.Resources != nil {
		quota := quotaForTier(opts.Resources.Tier)
		parameters = append(parameters,
			map[string]any{"name": "replicaCount", "value": strconv.Itoa(maxInt(opts.Resources.Replicas, 1)), "forceString": true},
			map[string]any{"name": "hosting.tier", "value": opts.Resources.Tier, "forceString": true},
			map[string]any{"name": "resources.requests.cpu", "value": opts.Resources.CPURequest, "forceString": true},
			map[string]any{"name": "resources.requests.memory", "value": opts.Resources.MemoryRequest, "forceString": true},
			map[string]any{"name": "resources.limits.cpu", "value": opts.Resources.CPULimit, "forceString": true},
			map[string]any{"name": "resources.limits.memory", "value": opts.Resources.MemoryLimit, "forceString": true},
			map[string]any{"name": "quota.requestsCpu", "value": quota.cpu, "forceString": true},
			map[string]any{"name": "quota.requestsMemory", "value": quota.memory, "forceString": true},
			map[string]any{"name": "quota.limitsCpu", "value": quota.cpuLimit, "forceString": true},
			map[string]any{"name": "quota.limitsMemory", "value": quota.memoryLimit, "forceString": true},
			map[string]any{"name": "quota.pods", "value": quota.pods, "forceString": true},
		)
	}
	application := map[string]any{
		"apiVersion": "argoproj.io/v1alpha1",
		"kind":       "Application",
		"metadata": map[string]any{
			"name":       opts.Name,
			"namespace":  opts.ArgoNamespace,
			"finalizers": []string{"resources-finalizer.argocd.argoproj.io"},
		},
		"spec": map[string]any{
			"project": opts.Project,
			"source": map[string]any{
				"repoURL":        opts.RepoURL,
				"path":           opts.Path,
				"targetRevision": opts.Revision,
				"helm":           map[string]any{"parameters": parameters},
			},
			"destination": map[string]any{
				"server":    opts.Destination,
				"namespace": opts.TargetNamespace,
			},
			"syncPolicy": map[string]any{
				"automated": map[string]any{"prune": true, "selfHeal": true},
			},
		},
	}
	b, err := json.Marshal(application)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (d *argoCDDeployer) defaultRunCmd(ctx context.Context, stdin string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, d.kubectlBin, args...)
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = io.MultiWriter(os.Stderr, &stderr)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}
	return "", nil
}
