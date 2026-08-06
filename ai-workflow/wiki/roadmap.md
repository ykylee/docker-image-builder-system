# 실서비스 진입 로드맵

현재는 내부 self-dogfood 단계이며, 외부 다중 사용자 서비스는 아직 승인할 수 없습니다.

## 우선순위

1. Phase 0: private network와 운영 경계 봉인
2. Phase 1: 인증과 테넌트 권한
3. Phase 2: Runner 인증과 실행 격리
4. Phase 3: control-plane 영속성 및 queue recovery
5. Phase 4: 서비스 DB provisioning retry와 lifecycle 완성
6. Phase 5~6: 관측성·비용 통제와 제한적 private beta

## 원본 문서

- [실서비스 진입 계획](../../.omx/plans/production-readiness-roadmap-2026-08-05.md)
- [현재 구현 현황 및 실사용 준비도](../../docs/operations/current-state-and-readiness-2026-08-05.md)
