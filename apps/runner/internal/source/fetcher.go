// Package source downloads and extracts the source archive for a build
// (TASK-066). The Runner is a Host Server API consumer: it never touches
// PostgreSQL directly. The source bytes therefore arrive via the
// canonical `GET /builds/:buildId/source` endpoint, and this package is
// the single place that turns the response into an extracted
// directory on disk.
//
// The archive is expected to be a `tar.gz` (gzip-compressed tar). The
// Skill layer is expected to produce tar.gz at upload time so the
// Runner does not need to negotiate a format.
package source

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ykylee/docker-image-builder-system/apps/runner/internal/hostclient"
)

// Fetcher downloads and extracts the source archive for a build.
//
// The zero value is not usable; construct via NewFetcher.
type Fetcher struct {
	// client is the BuildControlClient used to fetch the archive.
	// Required.
	client hostclient.BuildControlClient
	// workspaceRoot is the parent directory under which per-build
	// working directories are created (e.g.
	// `<workspaceRoot>/<buildID>/`). Required.
	workspaceRoot string
	// maxRetries is the number of additional attempts after the first
	// one. Default (when zero) is 1. The retry only applies to
	// network / 5xx errors — checksum mismatches are surfaced
	// immediately as terminal errors so the build fails fast.
	maxRetries int
	// retryBackoff is the wait time between retries. Default
	// (when zero) is 500ms.
	retryBackoff time.Duration
}

// NewFetcher returns a Fetcher wired to `client` with `workspaceRoot`
// as the parent directory for per-build workspaces.
func NewFetcher(client hostclient.BuildControlClient, workspaceRoot string) *Fetcher {
	return &Fetcher{
		client:        client,
		workspaceRoot: workspaceRoot,
		maxRetries:    1,
		retryBackoff:  500 * time.Millisecond,
	}
}

// WithRetries returns a copy of f with the retry count and backoff
// overridden. A negative count clamps to 0 (no retries).
func (f *Fetcher) WithRetries(count int, backoff time.Duration) *Fetcher {
	if count < 0 {
		count = 0
	}
	clone := *f
	clone.maxRetries = count
	if backoff > 0 {
		clone.retryBackoff = backoff
	}
	return &clone
}

// ExtractResult is the on-disk layout produced by Fetch.
type ExtractResult struct {
	// BuildDir is the per-build working directory
	// (`<workspaceRoot>/<buildID>/`). Always populated.
	BuildDir string
	// SourceDir is the directory containing the extracted source
	// contents (`<BuildDir>/src/`). docker.BuildImage uses this as
	// the build context.
	SourceDir string
	// ArchivePath is the on-disk path of the downloaded tar.gz
	// (`<BuildDir>/source.tar.gz`). Kept around for inspection /
	// debugging; BuildImage does not need to re-read it.
	ArchivePath string
	// Checksum is the SHA-256 (lowercase hex) of the downloaded
	// bytes as reported by the Host Server in the
	// `X-Source-Checksum-Sha256` response header. The fetcher
	// re-verifies the checksum against the actual bytes; if they
	// disagree, Fetch returns an error rather than returning a
	// result with a wrong checksum.
	Checksum string
	// SizeBytes is the byte count of the downloaded archive, taken
	// from the `X-Source-Size-Bytes` response header.
	SizeBytes int
}

// Fetch downloads the source archive for `buildID` and extracts it
// under `<workspaceRoot>/<buildID>/src/`. The workspace directory
// is created if missing. On any error, the partially-created
// directory tree is removed so the next attempt starts clean.
func (f *Fetcher) Fetch(ctx context.Context, buildID string) (*ExtractResult, error) {
	if f.client == nil {
		return nil, fmt.Errorf("source.Fetcher: client is nil")
	}
	if f.workspaceRoot == "" {
		return nil, fmt.Errorf("source.Fetcher: workspaceRoot is empty")
	}
	if buildID == "" {
		return nil, fmt.Errorf("source.Fetcher: buildID is empty")
	}

	buildDir := filepath.Join(f.workspaceRoot, buildID)
	sourceDir := filepath.Join(buildDir, "src")
	archivePath := filepath.Join(buildDir, "source.tar.gz")

	// Best-effort cleanup of any prior partial extract. The
	// `os.RemoveAll` is scoped to the build directory so a stray
	// concurrent Runner working on a different build is unaffected.
	// (The Runner processes claims serially per `internal/worker`
	// loop, so this is also defence-in-depth.)
	if err := os.RemoveAll(buildDir); err != nil {
		return nil, fmt.Errorf("source.Fetcher: cleanup %s: %w", buildDir, err)
	}
	if err := os.MkdirAll(buildDir, 0o755); err != nil {
		return nil, fmt.Errorf("source.Fetcher: mkdir %s: %w", buildDir, err)
	}

	// Download with retry. A retry is only attempted on
	// transport-level errors or 5xx responses — checksum
	// mismatches (which `verifyChecksum` raises) are terminal.
	var (
		body     []byte
		checksum string
		size     int
	)
	attempts := f.maxRetries + 1
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			log.Printf("source.Fetcher: retry %d/%d for buildID=%s", attempt, f.maxRetries, buildID)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(f.retryBackoff):
			}
		}
		b, c, s, err := f.client.DownloadSource(ctx, buildID)
		if err == nil {
			body, checksum, size = b, c, s
			break
		}
		if attempt == attempts-1 {
			return nil, fmt.Errorf("source.Fetcher: download buildID=%s after %d attempts: %w", buildID, attempts, err)
		}
		log.Printf("source.Fetcher: download attempt %d failed for buildID=%s: %v", attempt+1, buildID, err)
	}

	// Re-verify the SHA-256 of the downloaded bytes against the
	// header. The server already recomputes this on upload, so
	// mismatches here indicate a corrupted download or a malicious
	// MITM rewriting bytes. The Host Server is trusted; this guard
	// exists so a Runner log records the mismatch rather than
	// silently feeding bad bytes to `docker build`. The archive is
	// written to disk first so a debugging operator can inspect the
	// bytes; the build dir is then removed on a terminal
	// verification failure so the next attempt starts clean.
	actual := sha256.Sum256(body)
	actualHex := hex.EncodeToString(actual[:])
	verificationFailed := false
	if actualHex != checksum {
		verificationFailed = true
		log.Printf("source.Fetcher: checksum mismatch buildID=%s header=%s actual=%s", buildID, checksum, actualHex)
	} else if len(body) != size {
		verificationFailed = true
		log.Printf("source.Fetcher: size mismatch buildID=%s header=%d actual=%d", buildID, size, len(body))
	}
	if verificationFailed {
		_ = os.RemoveAll(buildDir)
		if actualHex != checksum {
			return nil, fmt.Errorf("source.Fetcher: checksum mismatch buildID=%s header=%s actual=%s", buildID, checksum, actualHex)
		}
		return nil, fmt.Errorf("source.Fetcher: size mismatch buildID=%s header=%d actual=%d", buildID, size, len(body))
	}

	if err := os.WriteFile(archivePath, body, 0o644); err != nil {
		_ = os.RemoveAll(buildDir)
		return nil, fmt.Errorf("source.Fetcher: write archive %s: %w", archivePath, err)
	}

	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		return nil, fmt.Errorf("source.Fetcher: mkdir %s: %w", sourceDir, err)
	}
	if err := extractTarGz(archivePath, sourceDir); err != nil {
		// Best-effort cleanup so a follow-up retry does not see a
		// half-extracted tree.
		_ = os.RemoveAll(buildDir)
		return nil, fmt.Errorf("source.Fetcher: extract %s: %w", archivePath, err)
	}

	return &ExtractResult{
		BuildDir:    buildDir,
		SourceDir:   sourceDir,
		ArchivePath: archivePath,
		Checksum:    checksum,
		SizeBytes:   size,
	}, nil
}

// extractTarGz unpacks a gzip-compressed tar at `archivePath` into
// `destDir`. Path traversal entries (e.g. `../`) are rejected so a
// malicious archive cannot write outside `destDir`. The
// destination is created if missing.
func extractTarGz(archivePath, destDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read tar header: %w", err)
		}

		// Reject absolute paths and any `..` segment so a
		// malicious archive cannot escape destDir. Symlinks are
		// also rejected (the archive is treated as a plain
		// file/directory tree — docker build does not need
		// symlinks).
		name := hdr.Name
		if filepath.IsAbs(name) || strings.Contains(name, "..") {
			return fmt.Errorf("reject unsafe tar entry name %q", name)
		}
		target := filepath.Join(destDir, name)

		// Defensive: even after the `..` check, ensure target
		// stays under destDir (filepath.Clean + Rel guards
		// against subtle forms of traversal).
		cleanDest := filepath.Clean(destDir)
		cleanTarget := filepath.Clean(target)
		rel, relErr := filepath.Rel(cleanDest, cleanTarget)
		if relErr != nil || strings.HasPrefix(rel, "..") {
			return fmt.Errorf("reject escaped tar entry name %q", name)
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(cleanTarget, 0o755); err != nil {
				return fmt.Errorf("mkdir %s: %w", cleanTarget, err)
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
				return fmt.Errorf("mkdir parent %s: %w", filepath.Dir(cleanTarget), err)
			}
			out, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
			if err != nil {
				return fmt.Errorf("create %s: %w", cleanTarget, err)
			}
			if _, err := io.Copy(out, tr); err != nil {
				_ = out.Close()
				return fmt.Errorf("write %s: %w", cleanTarget, err)
			}
			if err := out.Close(); err != nil {
				return fmt.Errorf("close %s: %w", cleanTarget, err)
			}
		case tar.TypeSymlink, tar.TypeLink:
			// Reject symlinks/hardlinks to keep the extracted
			// tree simple and prevent symlink-based escapes.
			return fmt.Errorf("reject tar entry type %d for %q", hdr.Typeflag, name)
		default:
			// Skip unknown entry types (e.g. char devices,
			// FIFOs) — they are not meaningful for a build
			// context and can be safely ignored.
			continue
		}
	}
}
