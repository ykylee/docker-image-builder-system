package dockerfile

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Mode string

const (
	ModeRequired Mode = "required"
	ModeAuto     Mode = "auto"
)

type Result struct {
	Generated bool
	Template  string
}

type packageManifest struct {
	Scripts map[string]string `json:"scripts"`
}

func Ensure(sourceDir, relativePath string, mode Mode) (Result, error) {
	if relativePath == "" {
		relativePath = "Dockerfile"
	}
	path := filepath.Join(sourceDir, relativePath)
	if _, err := os.Stat(path); err == nil {
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			return Result{}, fmt.Errorf("read Dockerfile: %w", readErr)
		}
		if err := validateDatabasePolicy(string(contents)); err != nil {
			return Result{}, err
		}
		return Result{}, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return Result{}, fmt.Errorf("stat Dockerfile: %w", err)
	}
	if mode != ModeAuto {
		return Result{}, fmt.Errorf("Dockerfile not found at %s", path)
	}

	template, contents, err := infer(sourceDir)
	if err != nil {
		return Result{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Result{}, fmt.Errorf("create Dockerfile directory: %w", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		return Result{}, fmt.Errorf("write generated Dockerfile: %w", err)
	}
	marker := filepath.Join(sourceDir, ".dib-dockerfile-generated.json")
	if err := os.WriteFile(marker, []byte(fmt.Sprintf("{\"template\":%q}\n", template)), 0o644); err != nil {
		return Result{}, fmt.Errorf("write Dockerfile generation marker: %w", err)
	}
	return Result{Generated: true, Template: template}, nil
}

func validateDatabasePolicy(contents string) error {
	for _, line := range strings.Split(contents, "\n") {
		trimmed := strings.TrimSpace(line)
		upper := strings.ToUpper(trimmed)
		if !strings.HasPrefix(upper, "ENV ") && !strings.HasPrefix(upper, "ARG ") {
			continue
		}
		for _, name := range []string{
			"DATABASE_URL",
			"DB_HOST",
			"DB_PORT",
			"DB_NAME",
			"DB_SCHEMA",
			"DB_ROLE",
			"DB_USER",
			"DB_PASSWORD",
			"PGHOST",
			"PGPORT",
			"PGDATABASE",
			"PGUSER",
			"PGPASSWORD",
		} {
			if strings.Contains(upper, name) {
				return fmt.Errorf("Dockerfile database policy: do not declare %s; enable ServiceManifest.database and use the platform-injected DATABASE_URL Secret", name)
			}
		}
	}
	return nil
}

func infer(sourceDir string) (string, string, error) {
	hasIndex := fileExists(filepath.Join(sourceDir, "index.html"))
	packageBytes, hasPackage := readFile(filepath.Join(sourceDir, "package.json"))
	if hasPackage {
		var manifest packageManifest
		if err := json.Unmarshal(packageBytes, &manifest); err != nil {
			return "", "", fmt.Errorf("auto Dockerfile: invalid package.json: %w", err)
		}
		if manifest.Scripts["start"] != "" {
			return "node", `FROM node:22.14.0-alpine3.21
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
`, nil
		}
	}
	if hasIndex {
		indexHTML, _ := readFile(filepath.Join(sourceDir, "index.html"))
		if hasRootAbsoluteAssetReference(string(indexHTML)) {
			return "", "", fmt.Errorf("auto Dockerfile: index.html uses root-absolute assets; use relative assets (for example Vite base=./) for path-hosted services")
		}
		return "static-nginx", `FROM nginx:1.27.4-alpine3.21
RUN printf '%s\n' \
  'server {' \
  '    listen 8080;' \
  '    server_name _;' \
  '    root /usr/share/nginx/html;' \
  '    location / {' \
  '        try_files $uri $uri/ /index.html;' \
  '    }' \
  '}' > /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
EXPOSE 8080
`, nil
	}
	return "", "", fmt.Errorf("auto Dockerfile: unsupported source; expected index.html or package.json with scripts.start")
}

func hasRootAbsoluteAssetReference(indexHTML string) bool {
	for _, marker := range []string{`src="/`, `href="/`, `src='/`, `href='/`} {
		if strings.Contains(indexHTML, marker) {
			return true
		}
	}
	return false
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readFile(path string) ([]byte, bool) {
	contents, err := os.ReadFile(path)
	return contents, err == nil
}
