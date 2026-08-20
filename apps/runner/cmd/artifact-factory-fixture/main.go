// artifact-factory-fixture is a deterministic local dependency proxy used by
// Docker build integration tests. It deliberately keeps state in memory and
// is not a production artifact store.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/artifact"
)

const digest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type server struct {
	mu    sync.RWMutex
	cache map[string]artifact.Manifest
	token string
}

func (s *server) authorize(w http.ResponseWriter, r *http.Request) bool {
	if s.token == "" || r.Header.Get("Authorization") == "Bearer "+s.token {
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

func main() {
	s := &server{cache: make(map[string]artifact.Manifest), token: strings.TrimSpace(os.Getenv("ARTIFACT_FACTORY_TOKEN"))}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"status":"ok"}`)) })
	mux.HandleFunc("/v1/artifacts/", s.artifacts)
	mux.HandleFunc("/v1/prefetch", s.prefetch)
	addr := os.Getenv("ARTIFACT_FACTORY_ADDR")
	if addr == "" {
		addr = ":8090"
	}
	log.Printf("artifact factory fixture listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
