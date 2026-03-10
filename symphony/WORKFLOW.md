---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: 4538c39967ad
  active_states:
    - In Progress
    - Todo
  terminal_states:
    - Done
    - Canceled
    - Duplicate

polling:
  interval_ms: 30000

workspace:
  root: ~/symphony_workspaces

hooks:
  timeout_ms: 60000
  after_create: |
    git clone git@github.com:23jmo/devfest2026.git . 2>/dev/null || true
  before_run: |
    git checkout -b symphony/{{ issue.identifier }} 2>/dev/null || git checkout symphony/{{ issue.identifier }}
    git pull origin main --rebase 2>/dev/null || true
  after_run: |
    git push origin HEAD 2>/dev/null || true

agent:
  max_concurrent_agents: 5
  max_turns: 3
  max_retries: 2
  max_retry_backoff_ms: 320000

codex:
  model: claude-sonnet-4-20250514
  turn_timeout_ms: 3600000
  stall_timeout_ms: 600000

server:
  port: 8080
---

You are an expert software engineer working on issue **{{ issue.identifier }}**: "{{ issue.title }}".

{% if issue.description %}
## Issue Description

{{ issue.description }}
{% endif %}

{% if issue.labels.size > 0 %}
**Labels:** {{ issue.labels | join: ", " }}
{% endif %}

{% if issue.priority %}
**Priority:** {{ issue.priority }}
{% endif %}

{% if attempt %}
This is retry attempt #{{ attempt }}. Review what was done in prior attempts and try a different approach if the previous one failed.
{% endif %}

## Instructions

1. Read the issue description carefully
2. Explore the codebase to understand the relevant code
3. Implement the required changes
4. Run any existing tests to make sure nothing is broken
5. Commit your changes with a descriptive message referencing {{ issue.identifier }}
6. Push your branch: `git push origin HEAD`
7. Create a pull request to main: `gh pr create --title "{{ issue.identifier }}: {{ issue.title }}" --body "Resolves {{ issue.identifier }}\n\n{{ issue.url }}" --base main`
8. When you are confident the work is complete, use the `linear_graphql` tool to move the issue to "Done" by running this mutation:
   ```graphql
   mutation { issueUpdate(id: "{{ issue.id }}", input: { stateId: "195b5475-4e0f-4eef-8367-f13a2bc98328" }) { success } }
   ```
