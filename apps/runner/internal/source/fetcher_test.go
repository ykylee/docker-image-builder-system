package source

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
)

// stubClient is a deterministic BuildControlClient used by the
// fetcher tests. Only DownloadSource is exercised by the fetcher;
// the other methods are no-op shims to satisfy the interface.
type stubClient struct {
	download func(context.Context, string) ([]byte, string, int, error)
}

func (s *stubClient) DownloadSource(ctx context.Context, buildID string) ([]byte, string, int, error) {
	return s.download(ctx, buildID)
}
func (s *stubClient) ClaimNextBuild(context.Context) (*hostclient.ClaimedBuildResponse, error) {
	return nil, nil
}
func (s *stubClient) ReportPhase(context.Context, string, string, string) error {
	return nil
}
func (s *stubClient) StartContainerTest(context.Context, string, hostclient.StartContainerTestRequest) error {
	return nil
}
func (s *stubClient) ReportContainerTestResult(context.Context, string, hostclient.ContainerTestResultRequest) error {
	return nil
}
func (s *stubClient) ReportDeployment(context.Context, string, hostclient.DeploymentReportRequest) error {
	return nil
}

// makeTarGz builds a tar.gz archive in memory with a single file
// `entry` whose contents are `content`. Returns the archive bytes
// and the SHA-256 of the archive.
func makeTarGz(t *testing.T, entry string, content []byte) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{
		Name:     entry,
		Mode:     0o644,
		Size:     int64(len(content)),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:])
}

func TestFetcher_HappyPath_ExtractsAndWritesArchive(t *testing.T) {
	archive, checksum := makeTarGz(t, "Dockerfile", []byte("FROM scratch\n"))
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, checksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(0, 0)

	res, err := fetcher.Fetch(context.Background(), "b-1")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if res.Checksum != checksum {
		t.Errorf("checksum mismatch: got=%s want=%s", res.Checksum, checksum)
	}
	if res.SizeBytes != len(archive) {
		t.Errorf("size mismatch: got=%d want=%d", res.SizeBytes, len(archive))
	}

	// The archive is on disk and the source tree is extracted.
	if _, err := os.Stat(res.ArchivePath); err != nil {
		t.Errorf("archive not on disk: %v", err)
	}
	want := filepath.Join(res.SourceDir, "Dockerfile")
	got, err := os.ReadFile(want)
	if err != nil {
		t.Fatalf("read extracted Dockerfile: %v", err)
	}
	if !bytes.Equal(got, []byte("FROM scratch\n")) {
		t.Errorf("Dockerfile contents: got=%q want=%q", string(got), "FROM scratch\n")
	}
}

func TestFetcher_RetriesOnTransportError(t *testing.T) {
	archive, checksum := makeTarGz(t, "Dockerfile", []byte("FROM scratch\n"))
	attempts := 0
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			attempts++
			if attempts < 3 {
				return nil, "", 0, errors.New("synthetic transport error")
			}
			return archive, checksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(5, 1*time.Millisecond)

	if _, err := fetcher.Fetch(context.Background(), "b-1"); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if attempts != 3 {
		t.Errorf("expected 3 attempts (2 fails + 1 success), got %d", attempts)
	}
}

func TestFetcher_ChecksumMismatchIsTerminal(t *testing.T) {
	archive, _ := makeTarGz(t, "Dockerfile", []byte("FROM scratch\n"))
	wrongChecksum := strings.Repeat("0", 64)
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, wrongChecksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(5, 1*time.Millisecond)

	_, err := fetcher.Fetch(context.Background(), "b-1")
	if err == nil {
		t.Fatal("expected checksum mismatch error, got nil")
	}
	if !strings.Contains(err.Error(), "checksum mismatch") {
		t.Errorf("expected 'checksum mismatch' in error, got: %v", err)
	}
}

func TestFetcher_RejectsPathTraversal(t *testing.T) {
	// Build a tar.gz whose single entry tries to escape via `..`.
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{
		Name:     "../escape.txt",
		Mode:     0o644,
		Size:     2,
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write([]byte("no")); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	archive := buf.Bytes()
	sum := sha256.Sum256(archive)
	checksum := hex.EncodeToString(sum[:])

	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, checksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(0, 0)

	_, err := fetcher.Fetch(context.Background(), "b-1")
	if err == nil {
		t.Fatal("expected path traversal rejection, got nil")
	}
	if !strings.Contains(err.Error(), "reject") {
		t.Errorf("expected 'reject' in error, got: %v", err)
	}
}

func TestFetcher_CleansUpOnError(t *testing.T) {
	archive, _ := makeTarGz(t, "Dockerfile", []byte("FROM scratch\n"))
	// Use a wrong size to trigger a terminal size mismatch.
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, "deadbeef", len(archive) + 1, nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(0, 0)

	_, err := fetcher.Fetch(context.Background(), "b-1")
	if err == nil {
		t.Fatal("expected size mismatch error, got nil")
	}
	// The build dir should be removed on any terminal error so
	// the next attempt starts clean. The archive was never
	// written, so the build dir does not exist at all here.
	buildDir := filepath.Join(tmp, "b-1")
	if _, err := os.Stat(buildDir); !os.IsNotExist(err) {
		t.Errorf("expected buildDir to not exist after size mismatch, stat err=%v", err)
	}
}

// makeTarGzWithEntry builds an in-memory tar.gz with one regular
// file whose name is the literal string the test wants the
// fetcher to evaluate (including names that are otherwise
// impossible to express on the test runner's filesystem, e.g.
// embedded NUL bytes).
func makeTarGzWithEntry(t *testing.T, entryName string) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	hdr := &tar.Header{
		Name:     entryName,
		Mode:     0o644,
		Size:     4,
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write([]byte("data")); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:])
}




func TestFetcher_RejectsTarEntryAbsolute(t *testing.T) {
	// Absolute path entry — POSIX `/foo` style.
	archive, checksum := makeTarGzWithEntry(t, "/abs/foo.txt")
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, checksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(0, 0)

	_, err := fetcher.Fetch(context.Background(), "b-1")
	if err == nil {
		t.Fatal("expected absolute path rejection, got nil")
	}
	if !strings.Contains(err.Error(), "absolute") {
		t.Errorf("expected error mentioning 'absolute', got: %v", err)
	}
}

func TestFetcher_AcceptsDeeplyNestedValidEntries(t *testing.T) {
	// Sanity check: a normal archive with nested paths still
	// extracts cleanly. This guards against an over-eager
	// reject path that catches valid relative paths.
	archive, checksum := makeTarGz(t, "src/lib/internal/utils.ts", []byte("export const x = 1;\n"))
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			return archive, checksum, len(archive), nil
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(0, 0)

	res, err := fetcher.Fetch(context.Background(), "b-1")
	if err != nil {
		t.Fatalf("expected happy path, got %v", err)
	}
	want := filepath.Join(res.SourceDir, "src", "lib", "internal", "utils.ts")
	if _, err := os.Stat(want); err != nil {
		t.Errorf("expected nested file at %s, got %v", want, err)
	}
}

// TestValidateTarEntryName_Unit exercises validateTarEntryName in
// isolation so we can drive it with entry names that the
// archive/tar package itself refuses to produce (a NUL byte in
// the entry name trips the PAX record writer at construction
// time, before we get a chance to test the fetcher's defence).
func TestValidateTarEntryName_RejectsUnsafeNames(t *testing.T) {
	cases := []struct {
		name      string
		input     string
		wantMatch string // substring expected in the error message
	}{
		{name: "empty", input: "", wantMatch: "empty"},
		{name: "absolute_unix", input: "/etc/passwd", wantMatch: "absolute"},
		{name: "parent", input: "..", wantMatch: ".."},
		{name: "parent_separator", input: "../escape", wantMatch: ".."},
		{name: "parent_nested", input: "a/../b", wantMatch: ".."},
		{name: "parent_trailing", input: "foo/..", wantMatch: ".."},
		{name: "backslash", input: "evil\\name.txt", wantMatch: "backslash"},
		{name: "control_char", input: "evil\x01name", wantMatch: "control character"},
		{name: "control_char_high", input: "evil\x7fname", wantMatch: "control character"},
		{name: "tab_is_rejected", input: "tab\there.txt", wantMatch: "control character"}, // tab (0x09) is < 0x20; the contract rejects all C0 controls.
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateTarEntryName(tc.input)
			if tc.wantMatch == "" {
				if err != nil {
					t.Errorf("expected accept for %q, got %v", tc.input, err)
				}
				return
			}
			if err == nil {
				t.Errorf("expected reject for %q (looking for %q in error), got nil", tc.input, tc.wantMatch)
				return
			}
			if !strings.Contains(err.Error(), tc.wantMatch) {
				t.Errorf("expected error containing %q for %q, got: %v", tc.wantMatch, tc.input, err)
			}
		})
	}
}

// TestValidateTarEntryName_AcceptsValidNames guards against an
// over-eager reject path that would catch legitimate entry names.
func TestValidateTarEntryName_AcceptsValidNames(t *testing.T) {
	valid := []string{
		"Dockerfile",
		"src/lib/internal/utils.ts",
		"a.txt",
		"deeply/nested/path/with/many/segments/file-name_123.test",
		".hidden",
		"trailing-slash/",
	}
	for _, name := range valid {
		t.Run(name, func(t *testing.T) {
			if err := validateTarEntryName(name); err != nil {
				t.Errorf("expected accept for %q, got %v", name, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TASK-080: source-upload race mitigation — Runner retry policy.
// The default retry budget is 3 attempts × exponential backoff
// (1s × 3 each step → 1s, 3s, 9s ≈ 13s total wait) so a Runner that
// claims a build before the Skill finishes uploading gets a window
// long enough to absorb the typical upload latency. These tests
// pin both the default values and the exponential schedule; the
// underlying values are short (1ms / 3ms / 9ms) so the test runs
// in a few milliseconds while still exercising the same code path.
// ---------------------------------------------------------------------------

func TestFetcher_DefaultsAreExponentialReady(t *testing.T) {
	client := &stubClient{
		download: func(context.Context, string) ([]byte, string, int, error) {
			return nil, "", 0, errors.New("never called")
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp)
	if fetcher.maxRetries != 3 {
		t.Errorf("default maxRetries: got=%d want=3", fetcher.maxRetries)
	}
	if fetcher.retryBackoff != 1*time.Second {
		t.Errorf("default retryBackoff: got=%s want=1s", fetcher.retryBackoff)
	}
	// Sanity: the default must yield an exponential schedule whose
	// worst-case wait is retryBackoff * 3^maxRetries.
	wantWorstCase := time.Second * time.Duration(intPow(3, fetcher.maxRetries))
	gotWorstCase := fetcher.retryBackoff * time.Duration(intPow(3, fetcher.maxRetries))
	if gotWorstCase != wantWorstCase {
		t.Errorf("worst-case backoff schedule mismatch: got=%s want=%s", gotWorstCase, wantWorstCase)
	}
}

// intPow returns base^exp for small non-negative integers. Used
// solely by the TASK-080 default-budget assertions.
func intPow(base, exp int) int {
	if exp <= 0 {
		return 1
	}
	r := 1
	for i := 0; i < exp; i++ {
		r *= base
	}
	return r
}

func TestFetcher_RetryBackoffIsExponential(t *testing.T) {
	// Drive the retry loop with a synthetic transport error on
	// every attempt so the backoff sequence is observed end-to-end.
	// 1ms base × 3^attempt = 1ms, 3ms, 9ms (≤ 13ms total).
	archive, checksum := makeTarGz(t, "Dockerfile", []byte("FROM scratch\n"))
	var (
		mu        sync.Mutex
		callTimes []time.Time
	)
	client := &stubClient{
		download: func(_ context.Context, _ string) ([]byte, string, int, error) {
			mu.Lock()
			callTimes = append(callTimes, time.Now())
			mu.Unlock()
			return nil, "", 0, errors.New("synthetic transport error")
		},
	}
	tmp := t.TempDir()
	fetcher := NewFetcher(client, tmp).WithRetries(3, 1*time.Millisecond)

	_, err := fetcher.Fetch(context.Background(), "b-1")
	if err == nil {
		t.Fatal("expected terminal error after exhausting retries, got nil")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(callTimes) != 4 {
		t.Fatalf("expected 4 download attempts (1 initial + 3 retries), got %d", len(callTimes))
	}
	// Gap between attempt n and n+1 should be ≥ retryBackoff *
	// 3^(n-1). Allow a small CI scheduling tolerance.
	expectedGaps := []time.Duration{1 * time.Millisecond, 3 * time.Millisecond, 9 * time.Millisecond}
	for i := 1; i < len(callTimes); i++ {
		gap := callTimes[i].Sub(callTimes[i-1])
		minGap := expectedGaps[i-1]
		// Use a generous lower bound (1/2 of expected) to absorb
		// goroutine scheduling jitter on slow CI hosts.
		if gap < minGap/2 {
			t.Errorf("attempt %d→%d gap=%s, want ≥ %s (exponential backoff violated)",
				i, i+1, gap, minGap)
		}
	}
	_ = archive
	_ = checksum
}
