#!/bin/sh
# Phase 3 / TASK-169 (P3-M4): base-path-aware 예제 앱 진입점.
#
# 핵심 규약: 앱은 시작 시 APP_BASE_PATH env(호스팅 시스템이 주입, 기본 "/")를
# 읽어, 브라우저에 emit 하는 **자산/링크 URL 에 그 prefix 를 붙인다.**
# 그래야 `host/<context-path>/` 하위에서 자산이 올바르게 로드된다.
set -eu

BASE="${APP_BASE_PATH:-/}"
# 슬래시 정규화(항상 앞뒤 슬래시).
case "$BASE" in
  /*) : ;;
  *) BASE="/$BASE" ;;
esac
case "$BASE" in
  */) : ;;
  *) BASE="$BASE/" ;;
esac

mkdir -p /www

# 자산: 절대경로가 아니라 APP_BASE_PATH prefix 를 붙여 emit 하는 것이 규약.
cat > /www/app.js <<EOF
document.getElementById("out").textContent =
  "hosted OK — APP_BASE_PATH=${BASE}";
EOF

cat > /www/index.html <<EOF
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>hosted-base-path-app</title></head>
  <body>
    <h1>docker-image-builder-system hosted app</h1>
    <p id="out">loading…</p>
    <!-- 규약: 자산 URL 에 APP_BASE_PATH prefix. "/app.js" (절대 루트) 로 쓰면
         context-path 하위 호스팅에서 깨진다. -->
    <script src="${BASE}app.js"></script>
  </body>
</html>
EOF

echo "hosted-base-path-app: serving on :8080 (APP_BASE_PATH=${BASE})"
exec httpd -f -v -p 8080 -h /www
