# 아키텍처와 설계

## 구성 요소

- Build Server: build request, source archive, persistence, query API, hosted service registry
- React Build Monitor: 사용자 build/service 화면, admin 운영 화면, API Docs
- Runner: source fetch, Docker build/run/test, Kubernetes·Helm·ArgoCD deployment
- Hosting: context path/subdomain 기반 서비스 노출과 lifecycle 관리
- Service DB: host PostgreSQL schema/role/Secret 및 선택적 migration gate

## canonical 설계 문서

- [System Context](../../docs/sdlc/design/01-system-context-and-responsibilities.md)
- [Domain Model](../../docs/sdlc/design/02-domain-model-and-state-transitions.md)
- [API Contract](../../docs/sdlc/design/03-api-contract-design.md)
- [Data Model](../../docs/sdlc/design/04-data-model-design.md)
- [Build and Preview Flow](../../docs/sdlc/design/05-build-and-preview-execution-flow.md)
- [Dockerfile Generation](../../docs/design/dockerfile-generation.md)
- [Service Database Isolation](../../docs/design/service-database-isolation.md)
