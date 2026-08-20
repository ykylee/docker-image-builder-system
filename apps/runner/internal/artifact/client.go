package artifact

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Ecosystem string

const (
	Python Ecosystem = "python"
	NPM    Ecosystem = "npm"
	Go     Ecosystem = "go"
	Rust   Ecosystem = "rust"
)

var supportedEcosystems = map[Ecosystem]struct{}{Python: {}, NPM: {}, Go: {}, Rust: {}}

var digestPattern = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)

var (
	ErrUnavailable       = errors.New("artifact unavailable")
	ErrIntegrity         = errors.New("artifact integrity failed")
	ErrUpstreamBlocked   = errors.New("artifact upstream blocked")
	ErrPrefetchFailed    = errors.New("artifact prefetch failed")
	ErrFactoryAuthFailed = errors.New("artifact factory auth failed")
)

type Manifest struct {
	ArtifactID      string     `json:"artifactId"`
	Coordinate      string     `json:"coordinate"`
	ContentDigest   string     `json:"contentDigest"`
	LockfileDigest  string     `json:"lockfileDigest"`
	BaseImageDigest string     `json:"baseImageDigest"`
	RecipeDigest    string     `json:"recipeDigest"`
	Ecosystem       Ecosystem  `json:"ecosystem"`
	Source          Source     `json:"source"`
	Provenance      Provenance `json:"provenance"`
}

type Source struct {
	Kind string `json:"kind"`
	Host string `json:"host"`
}

type Provenance struct {
	FetchedAt time.Time `json:"fetchedAt"`
	Verified  bool      `json:"verified"`
}

type PrefetchRequest struct {
	Ecosystem      Ecosystem `json:"ecosystem"`
	Coordinate     string    `json:"coordinate"`
	LockfileDigest string    `json:"lockfileDigest"`
	RecipeDigest   string    `json:"recipeDigest"`
}

type Client struct {
	baseURL string
	http    *http.Client
	token   string
}

func NewClient(baseURL string, token string) (*Client, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("artifact factory URL must be absolute")
	}
	return &Client{baseURL: strings.TrimRight(u.String(), "/"), http: &http.Client{Timeout: 10 * time.Second}, token: strings.TrimSpace(token)}, nil
}

func (c *Client) Get(ctx context.Context, ecosystem Ecosystem, coordinate string) (Manifest, error) {
	if err := validateLookup(ecosystem, coordinate); err != nil {
		return Manifest{}, err
	}
	path := "/v1/artifacts/" + url.PathEscape(string(ecosystem)) + "/" + url.PathEscape(coordinate)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return Manifest{}, err
	}
	resp, err := c.do(req)
	if err != nil {
		return Manifest{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Manifest{}, mapStatus(resp.StatusCode, "artifact lookup")
	}
	var manifest Manifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("artifact lookup decode: %w", err)
	}
	if err := validateManifest(manifest, ecosystem, coordinate); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func (c *Client) Prefetch(ctx context.Context, request PrefetchRequest) (Manifest, error) {
	if err := validateLookup(request.Ecosystem, request.Coordinate); err != nil {
		return Manifest{}, err
	}
	if !digestPattern.MatchString(request.LockfileDigest) || !digestPattern.MatchString(request.RecipeDigest) {
		return Manifest{}, fmt.Errorf("%w: prefetch input digest", ErrIntegrity)
	}
	body, err := json.Marshal(request)
	if err != nil {
		return Manifest{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/prefetch", bytes.NewReader(body))
	if err != nil {
		return Manifest{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.do(req)
	if err != nil {
		return Manifest{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return Manifest{}, mapStatus(resp.StatusCode, "artifact prefetch")
	}
	var manifest Manifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("artifact prefetch decode: %w", err)
	}
	if err := validateManifest(manifest, request.Ecosystem, request.Coordinate); err != nil {
		return Manifest{}, fmt.Errorf("%w: prefetch response: %v", ErrPrefetchFailed, err)
	}
	return manifest, nil
}

// Fetch retrieves the immutable package payload associated with a manifest and
// verifies its bytes before returning them to a build adapter. The factory
// returns the expected digest in a response header; callers must pass the
// digest from the already-validated manifest so a proxy cannot silently swap
// content between lookup and install.
func (c *Client) Fetch(ctx context.Context, ecosystem Ecosystem, coordinate string, expectedDigest string) ([]byte, error) {
	if err := validateLookup(ecosystem, coordinate); err != nil {
		return nil, err
	}
	if !digestPattern.MatchString(expectedDigest) {
		return nil, fmt.Errorf("%w: expected content digest", ErrIntegrity)
	}
	path := "/v1/artifacts/" + url.PathEscape(string(ecosystem)) + "/" + url.PathEscape(coordinate) + "/content"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, mapStatus(resp.StatusCode, "artifact content")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("artifact content read: %w", err)
	}
	actual := "sha256:" + fmt.Sprintf("%x", sha256.Sum256(body))
	if actual != expectedDigest || resp.Header.Get("X-Artifact-Digest") != expectedDigest {
		return nil, fmt.Errorf("%w: content digest mismatch", ErrIntegrity)
	}
	return body, nil
}

func (c *Client) do(req *http.Request) (*http.Response, error) {
	req.Header.Set("Accept", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	return c.http.Do(req)
}

func validateLookup(ecosystem Ecosystem, coordinate string) error {
	if _, ok := supportedEcosystems[ecosystem]; !ok {
		return fmt.Errorf("unsupported artifact ecosystem %q", ecosystem)
	}
	if strings.TrimSpace(coordinate) == "" {
		return fmt.Errorf("artifact coordinate is required")
	}
	return nil
}

func validateManifest(manifest Manifest, ecosystem Ecosystem, coordinate string) error {
	if manifest.ArtifactID == "" || manifest.Coordinate != coordinate || manifest.Ecosystem != ecosystem {
		return fmt.Errorf("%w: manifest identity mismatch", ErrIntegrity)
	}
	for name, value := range map[string]string{
		"contentDigest":   manifest.ContentDigest,
		"lockfileDigest":  manifest.LockfileDigest,
		"baseImageDigest": manifest.BaseImageDigest,
		"recipeDigest":    manifest.RecipeDigest,
	} {
		if !digestPattern.MatchString(value) {
			return fmt.Errorf("%w: invalid %s", ErrIntegrity, name)
		}
	}
	if manifest.Source.Host == "" || manifest.Source.Kind == "" || !manifest.Provenance.Verified {
		return fmt.Errorf("%w: incomplete provenance", ErrIntegrity)
	}
	return nil
}

func mapStatus(status int, operation string) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("%w: %s returned %d", ErrFactoryAuthFailed, operation, status)
	case http.StatusNotFound:
		return fmt.Errorf("%w: %s returned 404", ErrUnavailable, operation)
	case http.StatusBadGateway, http.StatusGatewayTimeout, http.StatusServiceUnavailable:
		return fmt.Errorf("%w: %s returned %d", ErrUpstreamBlocked, operation, status)
	default:
		return fmt.Errorf("%w: %s returned %d", ErrUnavailable, operation, status)
	}
}

func readBody(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}
