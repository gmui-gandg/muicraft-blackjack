# Project workflow guidance

`docs/PRD.md` section 3 is normative; `MISSION.md` defines release scope.
Only the maintainer can approve rule, architecture, or roadmap changes.

Use shared pinned Archon workflows for all factory AI stages. Do not implement
private workflow copies or dispatch coding-agent subprocesses from factory code.
The current Codex provider must not be run until the documented sandbox conflict
is resolved without weakening the maintainer's security requirements.

No unattended scheduling, automatic merges, GitHub automation, or deployments.
Merge approval and publication approval are separate decisions. Existing GitHub
authentication is permission to access the repository, not blanket authorization
to publish issues or approve a merge.

Preserve secrets, SSH, AppArmor, and Codex controls. Do not modify infrastructure
or expose web services. A production Dockerfile does not authorize Docker daemon
installation, privileged execution, image publication, or deployment.

Do not modify protected governance or verification files from a delivery task.
Do not delete, bypass, or weaken tests to obtain a passing gate. Static/unit
checks do not replace runtime verification, private holdouts, or human UX review.
Report unavailable and unimplemented checks truthfully.
