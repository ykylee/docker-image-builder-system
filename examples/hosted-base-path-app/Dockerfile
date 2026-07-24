# Phase 3 / TASK-169 (P3-M4): base-path-aware 예제 앱.
#
# 호스팅 규약(APP_BASE_PATH)을 실증하는 최소 앱. 시작 시 APP_BASE_PATH env 를
# 읽어 index.html 이 참조하는 자산 URL 에 prefix 를 붙인다. stripPrefix=true
# (기본) 경로에서 `host/<context-path>/` 로 접속하면 자산까지 정상 로드된다.
#
# 서버는 busybox httpd 로 루트(/)에서 정적 파일을 서빙한다(Ingress 가 prefix 를
# strip 하므로 앱 서버는 루트 기준). HTML 만 APP_BASE_PATH 로 prefix 를 emit.
FROM busybox
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
