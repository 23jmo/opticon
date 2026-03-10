// Server-rendered HTML dashboard template (§13.7)

import type { OrchestratorState, RetryEntry, RuntimeEvent } from "../types.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function renderDashboard(
  state: OrchestratorState,
  retryEntries: RetryEntry[],
  recentEvents: RuntimeEvent[],
): string {
  const running = Array.from(state.running.values());

  const runningRows = running
    .map((entry) => {
      const elapsed = formatDuration(Date.now() - entry.started_at_ms);
      const turns = entry.session?.turn_count ?? 0;
      const tokens = entry.session?.codex_total_tokens ?? 0;
      const lastMsg = entry.session?.last_codex_message
        ? escapeHtml(entry.session.last_codex_message.slice(0, 80))
        : "-";

      return `<tr>
        <td>${escapeHtml(entry.issue.identifier)}</td>
        <td>${escapeHtml(entry.issue.title.slice(0, 60))}</td>
        <td>${escapeHtml(entry.issue.state)}</td>
        <td>${elapsed}</td>
        <td>${turns}</td>
        <td>${tokens.toLocaleString()}</td>
        <td class="msg">${lastMsg}</td>
      </tr>`;
    })
    .join("\n");

  const retryRows = retryEntries
    .map((entry) => {
      const dueIn = Math.max(0, entry.due_at_ms - Date.now());
      return `<tr>
        <td>${escapeHtml(entry.identifier)}</td>
        <td>${entry.attempt}</td>
        <td>${formatDuration(dueIn)}</td>
        <td>${entry.error ? escapeHtml(entry.error.slice(0, 80)) : "-"}</td>
      </tr>`;
    })
    .join("\n");

  const eventRows = recentEvents
    .slice(-20)
    .reverse()
    .map((event) => {
      return `<tr>
        <td>${escapeHtml(event.timestamp.slice(11, 19))}</td>
        <td>${escapeHtml(event.type)}</td>
        <td>${escapeHtml(event.issue_id.slice(0, 8))}</td>
        <td class="msg">${event.data?.message ? escapeHtml(String(event.data.message).slice(0, 80)) : "-"}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Symphony Dashboard</title>
  <meta http-equiv="refresh" content="5">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0f; color: #e0e0e8; padding: 1.5rem; }
    h1 { font-size: 1.5rem; color: #7dd3fc; margin-bottom: 1rem; }
    h2 { font-size: 1.1rem; color: #a5b4fc; margin: 1.5rem 0 0.5rem; }
    .stats { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .stat { background: #16161f; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1rem 1.5rem; min-width: 140px; }
    .stat-label { font-size: 0.75rem; color: #8888a0; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: #e0e0f0; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    th { text-align: left; padding: 0.5rem; font-size: 0.75rem; color: #8888a0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2a2a3a; }
    td { padding: 0.5rem; font-size: 0.85rem; border-bottom: 1px solid #1a1a2a; }
    td.msg { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a0a0b0; }
    .empty { color: #666680; font-style: italic; padding: 1rem 0; }
    footer { margin-top: 2rem; font-size: 0.75rem; color: #555570; }
  </style>
</head>
<body>
  <h1>Symphony</h1>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Running</div>
      <div class="stat-value">${state.running.size}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Retrying</div>
      <div class="stat-value">${retryEntries.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Completed</div>
      <div class="stat-value">${state.completed.size}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Tokens</div>
      <div class="stat-value">${state.codex_totals.total_tokens.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Runtime</div>
      <div class="stat-value">${formatDuration(state.codex_totals.seconds_running * 1000)}</div>
    </div>
  </div>

  <h2>Running Sessions</h2>
  ${running.length > 0 ? `<table>
    <thead><tr><th>Issue</th><th>Title</th><th>State</th><th>Elapsed</th><th>Turns</th><th>Tokens</th><th>Last Message</th></tr></thead>
    <tbody>${runningRows}</tbody>
  </table>` : '<p class="empty">No running sessions</p>'}

  <h2>Retry Queue</h2>
  ${retryEntries.length > 0 ? `<table>
    <thead><tr><th>Issue</th><th>Attempt</th><th>Due In</th><th>Error</th></tr></thead>
    <tbody>${retryRows}</tbody>
  </table>` : '<p class="empty">Retry queue empty</p>'}

  <h2>Recent Events</h2>
  ${recentEvents.length > 0 ? `<table>
    <thead><tr><th>Time</th><th>Type</th><th>Issue</th><th>Message</th></tr></thead>
    <tbody>${eventRows}</tbody>
  </table>` : '<p class="empty">No recent events</p>'}

  <footer>Symphony &middot; Auto-refreshes every 5s</footer>
</body>
</html>`;
}
