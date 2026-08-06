# Wiki Schema

## Page rules

- 모든 페이지는 Markdown 파일이어야 합니다.
- `index.md`는 `#` 제목으로 시작해야 합니다.
- 각 `##` section에는 하나 이상의 `### [[page.md]] {#anchor}` entry가 있어야 합니다.
- anchor는 문서 전체에서 유일해야 하며 비어 있으면 안 됩니다.
- entry path는 `ai-workflow/wiki/` 하위의 실제 파일을 가리켜야 합니다.
- 상세 제품·설계·운영 사실은 canonical 문서에 두고 wiki 페이지에는 요약과 링크만 둡니다.

## Location rule

wiki는 `ai-workflow/wiki/` 한 곳만 사용합니다. `docs/wiki/`, `.wiki/`, `workflow-source/wiki/`, root `wiki/`를 추가하지 않습니다.
