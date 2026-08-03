package deploy

import (
	"context"
	"strings"
	"testing"
)

func TestNewK8sDeployer_Modes(t *testing.T) {
	cases := []struct {
		name    string
		mode    string
		wantErr bool
	}{
		{"noop", "noop", false},
		{"skeleton", "skeleton", false},
		{"k8s-real-kubectl", "k8s", false},
		{"argocd", "argocd", false},
		{"unsupported-empty", "", true},
		{"unsupported-rubbish", "garbage", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, err := NewK8sDeployer(c.mode, K8sDeployOptions{})
			if c.wantErr {
				if err == nil {
					t.Fatalf("expected error for mode %q", c.mode)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for mode %q: %v", c.mode, err)
			}
			if d == nil {
				t.Fatalf("expected non-nil deployer for mode %q", c.mode)
			}
		})
	}
}

func TestNoopSkeleton_Deploy(t *testing.T) {
	opts := K8sDeployOptions{
		SourceImage: "docker-image-builder-system/skeleton:b-1",
		Cluster:     "kind-p2-m5",
		Namespace:   "builds",
		BuildID:     "b-1",
	}
	d, err := NewK8sDeployer("noop", opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	res, err := d.Deploy(context.Background(), opts)
	if err != nil {
		t.Fatalf("deploy: %v", err)
	}
	if res.TargetType != "K8S" {
		t.Errorf("TargetType = %q, want K8S", res.TargetType)
	}
	if !strings.Contains(res.ResultRef, opts.BuildID) {
		t.Errorf("ResultRef = %q, want to contain BuildID %q", res.ResultRef, opts.BuildID)
	}
	if res.AppliedAt.IsZero() {
		t.Errorf("AppliedAt is zero")
	}
}

func TestNoopSkeleton_Deploy_EmptySource(t *testing.T) {
	d, _ := NewK8sDeployer("noop", K8sDeployOptions{})
	_, err := d.Deploy(context.Background(), K8sDeployOptions{})
	if err == nil {
		t.Errorf("expected error for empty source image")
	}
}

func TestNoopSkeleton_Apply_EmptyManifest(t *testing.T) {
	d, _ := NewK8sDeployer("noop", K8sDeployOptions{Cluster: "c", Namespace: "n", BuildID: "b"})
	_, err := d.Apply(context.Background(), K8sApplyOptions{Cluster: "c", Namespace: "n", BuildID: "b"})
	if err == nil {
		t.Errorf("expected error for empty manifest")
	}
}

func TestNoopSkeleton_Apply_OK(t *testing.T) {
	d, _ := NewK8sDeployer("noop", K8sDeployOptions{Cluster: "c", Namespace: "n", BuildID: "b"})
	res, err := d.Apply(context.Background(), K8sApplyOptions{
		Cluster:   "c",
		Namespace: "n",
		Manifest:  "deploy/base.yaml",
		BuildID:   "b",
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if res.Manifest != "deploy/base.yaml" {
		t.Errorf("Manifest = %q, want deploy/base.yaml", res.Manifest)
	}
}

func TestNoopSkeleton_Cleanup_Nop(t *testing.T) {
	d, _ := NewK8sDeployer("noop", K8sDeployOptions{})
	if err := d.Cleanup(context.Background(), K8sCleanupOptions{}); err != nil {
		t.Errorf("cleanup nop should return nil, got %v", err)
	}
}
