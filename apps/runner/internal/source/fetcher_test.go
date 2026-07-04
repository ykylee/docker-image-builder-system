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
func (s *stubClient) QueueTestDeployment(context.Context, string, hostclient.QueueTestDeploymentRequest) error {
	return nil
}
func (s *stubClient) ReportPreviewReady(context.Context, string, hostclient.PreviewReadyRequest) error {
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
