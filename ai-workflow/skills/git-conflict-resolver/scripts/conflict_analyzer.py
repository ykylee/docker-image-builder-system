"""3-way merge conflict analyzer."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List


@dataclass
class ConflictBlock:
    start_line: int
    end_line: int
    ours: str
    theirs: str
    base: str | None = None


class ConflictAnalyzer:
    """Parses and analyzes git conflict markers."""

    MARKER_OURS = "<<<<<<<"
    MARKER_BASE = "|||||||"
    MARKER_SEP = "======="
    MARKER_THEIRS = ">>>>>>>"

    def __init__(self, content: str):
        self.content = content
        self.lines = content.splitlines()

    def find_conflicts(self) -> List[ConflictBlock]:
        """Identify all conflict blocks in the content."""
        conflicts = []
        current_block = None
        
        # State tracking
        in_ours = False
        in_base = False
        in_theirs = False
        
        ours_content = []
        base_content = []
        theirs_content = []
        start_idx = -1

        for i, line in enumerate(self.lines):
            if line.startswith(self.MARKER_OURS):
                start_idx = i
                in_ours = True
                ours_content = []
            elif line.startswith(self.MARKER_BASE):
                in_ours = False
                in_base = True
                base_content = []
            elif line.startswith(self.MARKER_SEP):
                in_ours = False
                in_base = False
                in_theirs = True
                theirs_content = []
            elif line.startswith(self.MARKER_THEIRS):
                in_theirs = False
                conflicts.append(ConflictBlock(
                    start_line=start_idx + 1,
                    end_line=i + 1,
                    ours="\n".join(ours_content),
                    theirs="\n".join(theirs_content),
                    base="\n".join(base_content) if base_content else None
                ))
            else:
                if in_ours:
                    ours_content.append(line)
                elif in_base:
                    base_content.append(line)
                elif in_theirs:
                    theirs_content.append(line)
                    
        return conflicts

    def summarize(self) -> dict:
        """Return a summary of conflicts found."""
        conflicts = self.find_conflicts()
        return {
            "conflict_count": len(conflicts),
            "conflicts": [
                {
                    "lines": f"{c.start_line}-{c.end_line}",
                    "ours_len": len(c.ours),
                    "theirs_len": len(c.theirs),
                    "has_base": c.base is not None
                }
                for c in conflicts
            ]
        }
