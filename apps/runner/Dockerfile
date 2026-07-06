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
#      dibs/runner:dev
#
#  주의: container 안에서 host docker 데몬에 접근해야 실제 build 가 동작.
#  -v /var/run/docker.sock:/var/run/docker.sock mount 필요. build/test/deploy
#  단계의 모든 호출은 container 안의 docker CLI 가 host 데몬에 RPC.
#
#  DinD (docker-in-docker) 모드는 후속 TASK 에서 (DinD 는 privileged 모드
#  필요 + 별도 storage driver 설정).
# =============================================================================

# ---------- stage 1: build ----------
FROM golang:1.22-alpine AS builder

WORKDIR /src

# git 은 module private repository fetch 대비.
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

# docker CLI + tini + ca-certs. alpine 의 musl 환경에서 docker CLI 정적
# binary 는 `static` 으로 packaging 되어 있어 추가 의존성 없음.
RUN apk add --no-cache docker-cli tini ca-certificates \
 && addgroup -S runner && adduser -S -G runner runner

WORKDIR /app

COPY --from=builder /out/runner /app/runner

# USER runner — docker CLI 호출은 socket group 으로 권한 escape. 단 socket
# mount 시 socket 자체 권한 (0660 + docker group) 으로 host docker 그룹과
# container 안 group 이 일치해야 함. compose 에서 group 동기화 처리.
# (TASK-079 등 후속에서 DinD / docker rootless 검토.)

ENV RUNNER_POLL_INTERVAL=5s \
    HOST_SERVER_BASE_URL=http://127.0.0.1:3000 \
    RUNNER_ID=runner-default

EXPOSE 3000

# tini 가 SIGTERM 을 child (runner) 에 propagate → graceful shutdown.
ENTRYPOINT ["/sbin/tini", "--", "/app/runner"]