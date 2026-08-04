# syntax=docker/dockerfile:1.7
# =============================================================================
#  docker-image-builder-system — Runner image
# =============================================================================
#  Self-dogfood 용 runner container. build-server 의 `/builds/claim` 을
#  polling 해서 build 요청을 가져오고 docker CLI 로 build / test / deploy
#  단계를 실행한다.
#
#  사용 예:
#    docker build -t dibs/runner:dev -f apps/runner/Dockerfile .
#    docker run -d --name dibs-runner \
#      -e HOST_SERVER_BASE_URL=http://build-server:3000 \
#      -e RUNNER_ID=docker-runner-1 \
#      -v /var/run/docker.sock:/var/run/docker.sock \
#      -e DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)" \
#      dibs/runner:dev
#
#  host docker socket 권한:
#    - 호스트의 docker socket 은 보통 `root:docker` mode 0660.
#    - 컨테이너 안의 `runner` user 가 같은 gid 를 supplementary group 으로
#      갖도록 외부에서 `DOCKER_SOCKET_GID` env 로 전달 (compose 의 `group_add`
#      와 함께). Dockerfile 자체에는 임의 gid 고정 X (호스트마다 다름).
#
#  DinD (docker-in-docker) 모드는 후속 TASK — privileged 모드 + 별도
#  storage driver 설정 필요.
# =============================================================================

# ---------- stage 1: build ----------
FROM golang:1.22-alpine AS builder

WORKDIR /src

# git 은 module private repository fetch 대비 (lockfile 에 git dep 없음).
# ca-certificates 는 build 단계에서 HTTPS module fetch 검증용.
RUN apk add --no-cache git ca-certificates

# 의존성 캐시 — go.mod / go.sum 만 먼저 copy.
COPY apps/runner/go.mod apps/runner/go.sum* ./
RUN go mod download

# 소스 copy 후 build.
COPY apps/runner/ .
# `-trimpath` — build output 에 host filesystem 경로 노출 안 함 (reproducible).
# `-ldflags "-s -w"` — 디버그 심볼 제거 → binary size ↓.
RUN CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/runner ./cmd/runner

# ---------- stage 2: runtime ----------
FROM alpine:3.20 AS runtime

# docker CLI + Buildx(BuildKit frontend) + tini + ca-certs. Alpine 3.20
# repository의 docker-cli-buildx 패키지를 함께 설치해 `docker build`가
# legacy builder로 fallback하지 않도록 한다.
#
# 비-root 사용자:
# - `runner` (uid 1500) — primary group 으로 사용.
# - `docker` group — host 의 docker socket gid 와 무관하게, container 안에서
#   docker CLI 가 socket R/W 할 때 group 권한의 fallback. compose 의
#   `group_add: ["${DOCKER_SOCKET_GID}"]` 가 host gid 를 supplementary group
#   으로 추가 → docker group 의 supplementary 와 결합되어 socket 접근.
# - alpine busybox adduser 의 `-G` flag 는 첫 번째 등장만 primary group 으로
#   적용되고 이후는 무시되므로, `addgroup runner docker` 로 docker group 을
#   runner 의 supplementary group 으로 추가.
RUN apk add --no-cache docker-cli docker-cli-buildx tini ca-certificates \
 && addgroup -S docker \
 && addgroup -S -g 1500 runner \
 && adduser -S -u 1500 -G runner runner \
 && addgroup runner docker

WORKDIR /app

COPY --from=builder /out/runner /app/runner

# 운영자가 명시적으로 설정해야 하는 env.
# - HOST_SERVER_BASE_URL: build-server 의 base URL. compose / k8s 가 env 로
#   주입 (예: `http://build-server:3000`).
# - RUNNER_ID: runner 식별자. 여러 runner 가 있을 때 claim 순서 / log trace
#   용. default `runner-default` 은 단일 runner 로컬 dev 용.
ENV RUNNER_POLL_INTERVAL=5s \
    HOST_SERVER_BASE_URL=http://127.0.0.1:3000 \
    RUNNER_ID=runner-default

# EXPOSE 미선언 — runner binary 는 HTTP server 를 노출하지 않음 (worker loop
# 만 돌림). 운영 환경에서 라우터 / LB 가 HTTP traffic 만 보낼 때 명시적으로
# 충돌하지 않도록.

# tini 가 SIGTERM 을 child (runner) 에 propagate → graceful shutdown.
# non-root 실행 — 호스트 docker socket 에 대한 권한은 compose 의 group_add
# 또는 k8s 의 supplementalGroups 가 host gid 를 supplementary group 으로
# 주입하는 방식으로 처리.
USER runner
ENTRYPOINT ["/sbin/tini", "--", "/app/runner"]
