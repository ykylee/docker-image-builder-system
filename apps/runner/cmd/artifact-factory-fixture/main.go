// artifact-factory-fixture is a deterministic local dependency proxy used by
// Docker build integration tests. It deliberately keeps state in memory and
// is not a production artifact store.
package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/artifact"
)

const digest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const registryDigest = "sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"

type server struct {
	mu                    sync.RWMutex
	cache                 map[string]artifact.Manifest
	token                 string
	allowedUpstreams      map[string]struct{}
	allowPackageAnonymous bool
}

func (s *server) upstreamAllowed(host string) bool {
	_, ok := s.allowedUpstreams[strings.TrimSpace(host)]
	return ok
}

func (s *server) authorize(w http.ResponseWriter, r *http.Request) bool {
	if s.token == "" || r.Header.Get("Authorization") == "Bearer "+s.token {
		return true
	}
	http.Error(w, "factory authentication required", http.StatusUnauthorized)
	return false
}

func (s *server) authorizePackage(w http.ResponseWriter, r *http.Request) bool {
	if s.allowPackageAnonymous || s.token == "" || r.Header.Get("Authorization") == "Bearer "+s.token {
		return true
	}
	http.Error(w, "factory authentication required", http.StatusUnauthorized)
	return false
}

func (s *server) manifest(ecosystem artifact.Ecosystem, coordinate string, source string) artifact.Manifest {
	content := packageContent(ecosystem, coordinate)
	contentDigest := "sha256:" + fmt.Sprintf("%x", sha256.Sum256(content))
	return artifact.Manifest{
		ArtifactID: "fixture:" + string(ecosystem) + ":" + coordinate,
		Coordinate: coordinate, Ecosystem: ecosystem,
		ContentDigest: contentDigest, LockfileDigest: digest, BaseImageDigest: digest, RecipeDigest: digest,
		Source:     artifact.Source{Kind: source, Host: "fixture-artifact-factory"},
		Provenance: artifact.Provenance{FetchedAt: time.Now().UTC(), Verified: true},
	}
}

func packageContent(ecosystem artifact.Ecosystem, coordinate string) []byte {
	// These deterministic payloads stand in for the package manager's archive
	// or module body. They intentionally contain no credentials or network URLs.
	return []byte("artifact-fixture/" + string(ecosystem) + "/" + coordinate + "\n")
}

func packagePayload(ecosystem artifact.Ecosystem) []byte {
	switch ecosystem {
	case artifact.Python:
		return pythonWheel()
	case artifact.NPM:
		return npmTarball()
	case artifact.Go:
		return goModuleZip()
	case artifact.Rust:
		return rustCrate()
	default:
		return []byte("unsupported ecosystem")
	}
}

func pythonWheel() []byte {
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	files := map[string]string{
		"fixture_package.py":                       "VALUE = 'artifact-factory-fixture'\n",
		"fixture_package-1.0.0.dist-info/METADATA": "Metadata-Version: 2.1\nName: fixture-package\nVersion: 1.0.0\n\n",
		"fixture_package-1.0.0.dist-info/WHEEL":    "Wheel-Version: 1.0\nGenerator: artifact-factory-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
		"fixture_package-1.0.0.dist-info/RECORD":   "fixture_package.py,,\nfixture_package-1.0.0.dist-info/METADATA,,\nfixture_package-1.0.0.dist-info/WHEEL,,\nfixture_package-1.0.0.dist-info/RECORD,,\n",
	}
	for name, body := range files {
		w, _ := zw.Create(name)
		_, _ = w.Write([]byte(body))
	}
	_ = zw.Close()
	return out.Bytes()
}

func npmTarball() []byte {
	return tarGzip(map[string][]byte{
		"package/package.json": []byte(`{"name":"fixture-package","version":"1.0.0","main":"index.js"}`),
		"package/index.js":     []byte("module.exports = 'artifact-factory-fixture';\n"),
	})
}

func goModuleZip() []byte {
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	files := map[string]string{
		"example.com/fixture@v1.0.0/go.mod":     "module example.com/fixture\n\ngo 1.23\n",
		"example.com/fixture@v1.0.0/fixture.go": "package fixture\n\nconst Value = \"artifact-factory-fixture\"\n",
	}
	for name, body := range files {
		w, _ := zw.Create(name)
		_, _ = w.Write([]byte(body))
	}
	_ = zw.Close()
	return out.Bytes()
}

func rustCrate() []byte {
	return tarGzip(map[string][]byte{
		"fixture-package-1.0.0/Cargo.toml": []byte("[package]\nname = \"fixture-package\"\nversion = \"1.0.0\"\nedition = \"2021\"\n"),
		"fixture-package-1.0.0/src/lib.rs": []byte("pub const VALUE: &str = \"artifact-factory-fixture\";\n"),
	})
}

func tarGzip(files map[string][]byte) []byte {
	var out bytes.Buffer
	zw := gzip.NewWriter(&out)
	tw := tar.NewWriter(zw)
	for name, body := range files {
		_ = tw.WriteHeader(&tar.Header{Name: filepath.ToSlash(name), Mode: 0o644, Size: int64(len(body))})
		_, _ = tw.Write(body)
	}
	_ = tw.Close()
	_ = zw.Close()
	return out.Bytes()
}

func writePackagePayload(w http.ResponseWriter, r *http.Request, ecosystem artifact.Ecosystem) {
	payload := packagePayload(ecosystem)
	digest := "sha256:" + fmt.Sprintf("%x", sha256.Sum256(payload))
	if r.URL.Query().Get("corrupt") == "1" {
		payload = append([]byte("corrupt\n"), payload...)
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Artifact-Digest", digest)
	_, _ = w.Write(payload)
}

func (s *server) packages(w http.ResponseWriter, r *http.Request) {
	if !s.authorizePackage(w, r) {
		return
	}
	if host := r.Header.Get("X-Upstream-Host"); host != "" && !s.upstreamAllowed(host) {
		http.Error(w, "upstream host is not allow-listed", http.StatusForbidden)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/packages/")
	// Each response mirrors the stable URL shape consumed by its native
	// package manager. Payloads are deterministic fixture bytes; a production
	// proxy would replace them with validated upstream archives.
	switch {
	case strings.HasPrefix(path, "python/simple/fixture-package"):
		if strings.HasSuffix(path, "/") {
			_, _ = w.Write([]byte(`<a href="/v1/packages/python/files/fixture_package-1.0.0-py3-none-any.whl">fixture-package-1.0.0</a>`))
			return
		}
	case strings.HasSuffix(path, "python/files/fixture_package-1.0.0-py3-none-any.whl"):
		writePackagePayload(w, r, artifact.Python)
		return
	case path == "npm/fixture-package" || path == "npm/fixture-package/":
		_ = json.NewEncoder(w).Encode(map[string]any{"name": "fixture-package", "dist-tags": map[string]string{"latest": "1.0.0"}, "versions": map[string]any{"1.0.0": map[string]any{"name": "fixture-package", "version": "1.0.0", "dist": map[string]string{"tarball": "http://" + r.Host + "/v1/packages/npm/fixture-package/-/fixture-package-1.0.0.tgz"}}}})
		return
	case strings.HasSuffix(path, "fixture-package/-/fixture-package-1.0.0.tgz"):
		writePackagePayload(w, r, artifact.NPM)
		return
	case strings.HasPrefix(path, "go/example.com/fixture/@v/"):
		name := strings.TrimPrefix(path, "go/example.com/fixture/@v/")
		switch name {
		case "list":
			_, _ = w.Write([]byte("v1.0.0\n"))
		case "v1.0.0.info":
			_ = json.NewEncoder(w).Encode(map[string]string{"Version": "v1.0.0", "Time": "2026-08-20T00:00:00Z"})
		case "v1.0.0.mod":
			_, _ = w.Write([]byte("module example.com/fixture\n\ngo 1.23\n"))
		case "v1.0.0.zip":
			writePackagePayload(w, r, artifact.Go)
		default:
			http.NotFound(w, r)
		}
		return
	case strings.HasPrefix(path, "rust/index/"):
		if path == "rust/index/config.json" {
			_ = json.NewEncoder(w).Encode(map[string]string{"dl": "http://" + r.Host + "/v1/packages/rust/api/v1/crates"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"name": "fixture-package", "vers": "1.0.0", "deps": []any{}, "cksum": fmt.Sprintf("%x", sha256.Sum256(packagePayload(artifact.Rust))), "features": map[string]any{}, "yanked": false})
		return
	case strings.HasSuffix(path, "rust/api/v1/crates/fixture-package/1.0.0/download"):
		writePackagePayload(w, r, artifact.Rust)
		return
	}
	http.NotFound(w, r)
}

func (s *server) artifacts(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/v1/artifacts/"), "/")
	isContent := len(parts) > 2 && parts[len(parts)-1] == "content"
	if isContent {
		parts = parts[:len(parts)-1]
	}
	if len(parts) < 2 {
		http.Error(w, "ecosystem and coordinate are required", http.StatusBadRequest)
		return
	}
	ecosystem, err := url.PathUnescape(parts[0])
	coordinate, coordErr := url.PathUnescape(strings.Join(parts[1:], "/"))
	if err != nil || coordErr != nil || coordinate == "" {
		http.Error(w, "invalid artifact coordinate", http.StatusBadRequest)
		return
	}
	key := ecosystem + ":" + coordinate
	s.mu.RLock()
	manifest, ok := s.cache[key]
	s.mu.RUnlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	if isContent {
		content := packageContent(artifact.Ecosystem(ecosystem), coordinate)
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("X-Artifact-Digest", manifest.ContentDigest)
		_, _ = w.Write(content)
		return
	}
	_ = json.NewEncoder(w).Encode(manifest)
}

func (s *server) prefetch(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	var req artifact.PrefetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Coordinate == "" {
		http.Error(w, "invalid prefetch request", http.StatusBadRequest)
		return
	}
	manifest := s.manifest(req.Ecosystem, req.Coordinate, "prefetch")
	s.mu.Lock()
	s.cache[string(req.Ecosystem)+":"+req.Coordinate] = manifest
	s.mu.Unlock()
	_ = json.NewEncoder(w).Encode(manifest)
}

func (s *server) registry(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	// The fixture models a single immutable base image. The upstream host is
	// explicit so tests can prove the allow-list boundary without making a
	// network request to a real registry.
	if host := r.Header.Get("X-Upstream-Host"); host != "" && !s.upstreamAllowed(host) {
		http.Error(w, "upstream host is not allow-listed", http.StatusForbidden)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v2/")
	if path == "" || path == "_catalog" {
		_ = json.NewEncoder(w).Encode(map[string]any{"repositories": []string{"fixture/base"}})
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) < 3 || parts[len(parts)-2] != "manifests" && parts[len(parts)-2] != "blobs" {
		http.NotFound(w, r)
		return
	}
	kind := parts[len(parts)-2]
	ref := parts[len(parts)-1]
	if strings.Join(parts[:len(parts)-2], "/") != "fixture/base" {
		http.NotFound(w, r)
		return
	}
	if kind == "manifests" {
		if ref != registryDigest {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Docker-Content-Digest", registryDigest)
		w.Header().Set("Content-Type", "application/vnd.oci.image.manifest.v1+json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"schemaVersion": 2,
			"mediaType":     "application/vnd.oci.image.manifest.v1+json",
			"config":        map[string]any{"mediaType": "application/vnd.oci.image.config.v1+json", "digest": registryDigest, "size": 0},
			"layers":        []any{},
		})
		return
	}
	if ref != registryDigest {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Docker-Content-Digest", registryDigest)
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write([]byte("artifact-factory base image blob\n"))
}

func main() {
	allowed := make(map[string]struct{})
	for _, host := range strings.Split(os.Getenv("ARTIFACT_FACTORY_ALLOWED_UPSTREAMS"), ",") {
		if host = strings.TrimSpace(host); host != "" {
			allowed[host] = struct{}{}
		}
	}
	s := &server{cache: make(map[string]artifact.Manifest), token: strings.TrimSpace(os.Getenv("ARTIFACT_FACTORY_TOKEN")), allowedUpstreams: allowed, allowPackageAnonymous: strings.EqualFold(os.Getenv("ARTIFACT_FACTORY_ALLOW_PACKAGE_ANONYMOUS"), "true")}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"status":"ok"}`)) })
	mux.HandleFunc("/v1/artifacts/", s.artifacts)
	mux.HandleFunc("/v1/packages/", s.packages)
	mux.HandleFunc("/v1/prefetch", s.prefetch)
	mux.HandleFunc("/v2/", s.registry)
	addr := os.Getenv("ARTIFACT_FACTORY_ADDR")
	if addr == "" {
		addr = ":8090"
	}
	log.Printf("artifact factory fixture listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
