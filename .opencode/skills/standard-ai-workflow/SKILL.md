<!-- standard-ai-workflow-kit: v0.15.19-beta -->

---
name: standard-ai-workflow
description: Load the project workflow docs before starting or updating work in this repository.
---

# Standard AI Workflow

Use this skill when you need to start a session, update backlog state, sync documents, or prepare a handoff.

Always read:

- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/sessions`
- `ai-workflow/memory/active/backlog`
- `docs/PROJECT_PROFILE.md`

If the repository is still in adoption, also read:

- `ai-workflow/memory/active/repository_assessment.md`

Follow these rules:

- Write user-facing status updates, work reports, and document drafts in Korean by default.
- Keep code, commands, file paths, config keys, and external product names in their original form when needed.
- Brief the task before editing files.
- Keep task status aligned with backlog records.
- Do not mark work done without validation evidence.
- Update `state.json`, the handoff, and the latest backlog before ending a session.
- Keep internal reasoning and intermediate classification compact, and avoid long repeated explanations to the user.
- Leave only essential facts in handoff/backlog so session context stays lean.
- Treat `ai-workflow/` as workflow metadata only. Ignore it during normal project document exploration unless the task is explicitly about workflow docs or session state.
