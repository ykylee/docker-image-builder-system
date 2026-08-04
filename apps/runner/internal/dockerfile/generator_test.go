package dockerfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureGeneratedRequiredRejectsMissingDockerfile(t *testing.T) {
	dir := t.TempDir()
	_, err := Ensure(dir, "Dockerfile", ModeRequired)
	if err == nil {
		t.Fatal("expected missing Dockerfile error")
	}
}

func TestEnsureAutoGeneratesStaticSiteDockerfile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>ok</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	result, err := Ensure(dir, "Dockerfile", ModeAuto)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Generated || result.Template != "static-nginx" {
		t.Fatalf("unexpected result: %+v", result)
	}
	contents, err := os.ReadFile(filepath.Join(dir, "Dockerfile"))
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) == "" {
		t.Fatal("generated Dockerfile is empty")
	}
}

func TestEnsureAutoGeneratesNodeDockerfileOnlyForStartScript(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"scripts":{"start":"node server.js"}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	result, err := Ensure(dir, "Dockerfile", ModeAuto)
	if err != nil {
		t.Fatal(err)
	}
	if result.Template != "node" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestEnsureAutoRejectsUnknownSource(t *testing.T) {
	dir := t.TempDir()
	_, err := Ensure(dir, "Dockerfile", ModeAuto)
	if err == nil {
		t.Fatal("expected unsupported source error")
	}
}
