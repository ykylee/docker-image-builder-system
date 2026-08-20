package artifact

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testDigest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func testManifest(ecosystem Ecosystem, coordinate string) Manifest {
	return Manifest{
		ArtifactID: "artifact-1", Coordinate: coordinate, Ecosystem: ecosystem,
		ContentDigest: testDigest, LockfileDigest: testDigest, BaseImageDigest: testDigest,
		RecipeDigest: testDigest, Source: Source{Kind: "upstream", Host: "proxy.internal"},
		Provenance: Provenance{FetchedAt: time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC), Verified: true},
	}
}

func TestClientGetAcceptsAllSupportedEcosystems(t *testing.T) {
	for _, ecosystem := range []Ecosystem{Python, NPM, Go, Rust} {
		t.Run(string(ecosystem), func(t *testing.T) {
			coordinate := string(ecosystem) + "/example"
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer runner-token" {
					t.Errorf("missing artifact factory bearer")
				}
				_ = json.NewEncoder(w).Encode(testManifest(ecosystem, coordinate))
			}))
			defer srv.Close()
			client, err := NewClient(srv.URL, "runner-token")
			if err != nil {
				t.Fatal(err)
			}
			manifest, err := client.Get(context.Background(), ecosystem, coordinate)
			if err != nil {
				t.Fatal(err)
			}
			if manifest.Ecosystem != ecosystem || manifest.Coordinate != coordinate {
				t.Fatalf("unexpected manifest: %+v", manifest)
			}
		})
	}
}

func TestClientGetRejectsIntegrityMismatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manifest := testManifest(NPM, "npm/example")
		manifest.ContentDigest = "not-a-digest"
		_ = json.NewEncoder(w).Encode(manifest)
	}))
	defer srv.Close()
	client, _ := NewClient(srv.URL, "")
	_, err := client.Get(context.Background(), NPM, "npm/example")
	if !errors.Is(err, ErrIntegrity) {
		t.Fatalf("expected integrity error, got %v", err)
	}
}

func TestClientStatusMappingAndPrefetchRetryContract(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path == "/v1/artifacts/npm/npm/example" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Path != "/v1/prefetch" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(testManifest(NPM, "npm/example"))
	}))
	defer srv.Close()
	client, _ := NewClient(srv.URL, "")
	_, err := client.Get(context.Background(), NPM, "npm/example")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected unavailable for cache miss, got %v", err)
	}
	manifest, err := client.Prefetch(context.Background(), PrefetchRequest{
		Ecosystem: NPM, Coordinate: "npm/example", LockfileDigest: testDigest, RecipeDigest: testDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Coordinate != "npm/example" || calls != 2 {
		t.Fatalf("unexpected prefetch result/call count: %+v calls=%d", manifest, calls)
	}
}

func TestClientRejectsUnsupportedEcosystem(t *testing.T) {
	client, _ := NewClient("https://factory.internal", "")
	_, err := client.Get(context.Background(), Ecosystem("java"), "java/example")
	if err == nil || !strings.Contains(err.Error(), "unsupported artifact ecosystem") {
		t.Fatalf("expected unsupported ecosystem error, got %v", err)
	}
}
