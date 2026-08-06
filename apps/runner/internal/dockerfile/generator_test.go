package dockerfile

import (
	"os"
	"path/filepath"
	"strings"
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
	if !strings.Contains(string(contents), "listen 8080;") ||
		!strings.Contains(string(contents), "try_files $uri $uri/ /index.html;") ||
		!strings.Contains(string(contents), "EXPOSE 8080") {
		t.Fatalf("static template must serve the runner default port 8080:\n%s", contents)
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
	contents, err := os.ReadFile(filepath.Join(dir, "Dockerfile"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "ENV PORT=8080") || !strings.Contains(string(contents), "EXPOSE 8080") {
		t.Fatalf("node template must expose the runner default port 8080:\n%s", contents)
	}
}

func TestEnsureAutoRejectsUnknownSource(t *testing.T) {
	dir := t.TempDir()
	_, err := Ensure(dir, "Dockerfile", ModeAuto)
	if err == nil {
		t.Fatal("expected unsupported source error")
	}
}

func TestEnsureAutoRejectsRootAbsoluteStaticAssets(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(`<script type="module" src="/assets/index.js"></script>`), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Ensure(dir, "Dockerfile", ModeAuto)
	if err == nil || !strings.Contains(err.Error(), "root-absolute assets") {
		t.Fatalf("expected actionable root-absolute asset error, got %v", err)
	}
}

func TestEnsureRejectsDockerfileDatabaseConnectionDeclarations(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM node:22\nENV DATABASE_URL=postgres://host/db\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Ensure(dir, "Dockerfile", ModeRequired)
	if err == nil || !strings.Contains(err.Error(), "database policy") {
		t.Fatalf("expected database policy error, got %v", err)
	}
}

func TestEnsureAllowsDockerfileWithoutDatabaseConnectionDeclarations(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM node:22\nENV PORT=8080\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Ensure(dir, "Dockerfile", ModeRequired); err != nil {
		t.Fatal(err)
	}
}
