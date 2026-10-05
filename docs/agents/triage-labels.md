# Triage Labels

The skills speak in terms of five canonical triage roles. These are the corresponding GitHub label strings for this repo.

| Canonical role    | GitHub label           | Meaning                                  |
| ----------------- | ---------------------- | ---------------------------------------- |
| `needs-triage`    | `status: needs-triage` | Maintainer needs to evaluate this issue  |
| `needs-info`      | `status: needs-info`   | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`      | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`      | Requires human implementation            |
| `wontfix`         | `wontfix`              | Will not be actioned                     |

When a skill mentions a canonical role, use the corresponding GitHub label.

Status labels replace each other: when applying a new `status: …` label, remove the previous one. The full label system, including type, priority, area, and severity labels, is in [`docs/development/labels.md`](../development/labels.md).
