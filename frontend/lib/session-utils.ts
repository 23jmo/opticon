export function getStatusDotColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "running":
    case "pending_approval":
      return "bg-cyan-400";
    case "paused":
      return "bg-amber-400";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

export function getStatusTag(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "completed":
      return {
        label: "Finished",
        className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
      };
    case "running":
      return {
        label: "Running",
        className: "bg-cyan-400/10 text-cyan-400 ring-cyan-400/20",
      };
    case "pending_approval":
      return {
        label: "Processing",
        className: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
      };
    case "decomposing":
      return {
        label: "Decomposing",
        className: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
      };
    case "paused":
      return {
        label: "Paused",
        className: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-red-500/10 text-red-400 ring-red-500/20",
      };
    default:
      return {
        label: "Pending",
        className: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
      };
  }
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
