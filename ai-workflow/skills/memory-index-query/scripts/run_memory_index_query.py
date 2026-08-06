"""memory-index-query skill 표준 entry (v0.11.22+ Phase 3).

ADR-005 memory_index retrieval 3-tuple 의 CLI 진입점. read-only (디스크 변경 ❌).
session-start / doc-sync / backlog-update 가 본 entry 만 호출하면 retrieval layer 자동 활용.

Catalog §5 의 `scripts/run_<skill>.py` 패턴 정합.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# site-packages 의 stale workflow_kit shadowing 회피 (mavis memory §v0.11.18 §1 패턴).
SOURCE_ROOT = Path(__file__).resolve().parents[3]
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from workflow_kit.common.state.memory_index import query_memory_index_for_dispatcher


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Memory Index Query (v0.11.22+ Phase 3, ADR-005 retrieval 3-tuple)"
    )
    parser.add_argument("--workspace-root", required=True,
                        help="memory_index/ entries/ 가 있는 workspace root")
    parser.add_argument("--query-tokens", required=True,
                        help="comma-separated token list. 예: 'memora,memory retrieval'")
    parser.add_argument("--top-k", default=10, type=int,
                        help="default 10, range 1..100")
    parser.add_argument("--max-depth", default=2, type=int,
                        help="linked expansion depth cap, default 2, range 0..3")
    parser.add_argument("--use-bm25-fallback", action="store_true",
                        help="Phase 2b: 1단계 miss 시 BM25 2단계 fallback opt-in")
    parser.add_argument("--json", action="store_true",
                        help="stdout JSON (default human-readable text)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    query_tokens = [t.strip() for t in args.query_tokens.split(",") if t.strip()]
    if not query_tokens:
        print("ERROR: --query-tokens 가 비어있음", file=sys.stderr)
        return 2
    try:
        result = query_memory_index_for_dispatcher(
            Path(args.workspace_root),
            query_tokens,
            top_k=args.top_k,
            max_depth=args.max_depth,
            use_bm25_fallback=args.use_bm25_fallback,
        )
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))
    else:
        print(f"status: {result.status.value}")
        print(f"selected_count: {result.selected_count}")
        print(f"cue_hits: {result.cue_hits}")
        print(f"bm25_hits: {result.bm25_hits}")
        print(f"expansion_hits: {result.expansion_hits}")
        print(f"expansion_depth_used: {result.expansion_depth_used}")
        print(f"selected_ids: {','.join(result.selected_ids) or '<empty>'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
