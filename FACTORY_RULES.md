# Project workflow guidance

`docs/PRD.md` section 3 is normative; `MISSION.md` defines release scope.
Only the maintainer can approve rule, architecture, or roadmap changes.

Use shared pinned Archon workflows for all factory AI stages. Do not implement
private workflow copies or dispatch coding-agent subprocesses from factory code.
The owner authorized the pinned provider's normal full-access, non-root Codex
workers on 2026-10-25 for supervised approved tasks. Follow the scoped exception
in `AGENTS.md`; do not change the global sandbox, AppArmor, SSH, or cached source.

No unattended scheduling, automatic merges, GitHub automation, or deployments.
Merge approval and publication approval are separate decisions. Existing GitHub
authentication is permission to access the repository, not blanket authorization
to publish issues or approve a merge.

Preserve secrets, SSH, AppArmor, and host/desktop controls. Do not modify infrastructure
or expose web services. A production Dockerfile does not authorize Docker daemon
installation, privileged execution, image publication, or deployment.

Do not modify protected governance or verification files from a delivery task.
Do not delete, bypass, or weaken tests to obtain a passing gate. Static/unit
checks do not replace runtime verification, private holdouts, or human UX review.
Report unavailable and unimplemented checks truthfully.
