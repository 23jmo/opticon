import { Agent, ThinkingEntry } from "./types";

export interface AgentActivity {
  label: string;
  appName: string;
  url: string;
  gradient: string;
  badgeClass: string;
}

export const MOCK_PROMPT =
  "Write a comprehensive research paper on Google Docs about the rise of Daedalus Labs and their impact on AI agent development, including market analysis and technical architecture review";

export const MOCK_AGENTS: Agent[] = [
  { id: "agent-001", sessionId: "demo", status: "active", currentTaskId: null },
  { id: "agent-002", sessionId: "demo", status: "active", currentTaskId: null },
  { id: "agent-003", sessionId: "demo", status: "active", currentTaskId: null },
  { id: "agent-004", sessionId: "demo", status: "booting", currentTaskId: null },
];

export const MOCK_AGENT_ACTIVITIES: Record<string, AgentActivity> = {
  "agent-001": {
    label: "Research",
    appName: "Chrome",
    url: "scholar.google.com",
    gradient: "from-blue-950/80 to-slate-950",
    badgeClass: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20",
  },
  "agent-002": {
    label: "Writing",
    appName: "Chrome",
    url: "docs.google.com/document/d/1a2b3c...",
    gradient: "from-indigo-950/80 to-slate-950",
    badgeClass: "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20",
  },
  "agent-003": {
    label: "Analysis",
    appName: "Terminal",
    url: "~/ — bash",
    gradient: "from-emerald-950/80 to-slate-950",
    badgeClass: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20",
  },
  "agent-004": {
    label: "Review",
    appName: "Waiting...",
    url: "",
    gradient: "from-amber-950/80 to-slate-950",
    badgeClass: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20",
  },
};

const now = Date.now();

export const MOCK_THINKING_ENTRIES: ThinkingEntry[] = [
  {
    id: "t-001-1",
    agentId: "agent-001",
    timestamp: new Date(now - 50000).toISOString(),
    action: "Opening Chrome browser",
    toolName: "click",
    toolArgs: { x: 48, y: 720, element: "Chrome icon" },
  },
  {
    id: "t-002-1",
    agentId: "agent-002",
    timestamp: new Date(now - 48000).toISOString(),
    action: "Opening Google Docs",
    toolName: "click",
    toolArgs: { x: 312, y: 245, element: "Google Docs shortcut" },
  },
  {
    id: "t-001-2",
    agentId: "agent-001",
    timestamp: new Date(now - 44000).toISOString(),
    action: "Navigating to Google Scholar",
    reasoning:
      "I need to find academic papers about Daedalus Labs to support the research paper with credible sources.",
    toolName: "type_text",
    toolArgs: { text: "scholar.google.com" },
  },
  {
    id: "t-003-1",
    agentId: "agent-003",
    timestamp: new Date(now - 42000).toISOString(),
    action: "Opening terminal",
    toolName: "click",
    toolArgs: { x: 96, y: 720, element: "Terminal icon" },
  },
  {
    id: "t-002-2",
    agentId: "agent-002",
    timestamp: new Date(now - 40000).toISOString(),
    action: "Creating new document",
    reasoning:
      "Setting up the research paper document with proper formatting before other agents contribute content.",
    toolName: "click",
    toolArgs: { x: 200, y: 180, element: "Blank document" },
  },
  {
    id: "t-001-3",
    agentId: "agent-001",
    timestamp: new Date(now - 36000).toISOString(),
    action: 'Searching for "Daedalus Labs AI agents multi-agent systems"',
    toolName: "type_text",
    toolArgs: { text: "Daedalus Labs AI agents multi-agent systems" },
  },
  {
    id: "t-001-3b",
    agentId: "agent-001",
    timestamp: new Date(now - 35500).toISOString(),
    action: "Submitting search query",
    toolName: "press_key",
    toolArgs: { key: "Enter" },
  },
  {
    id: "t-003-2",
    agentId: "agent-003",
    timestamp: new Date(now - 34000).toISOString(),
    action: "Running market data collection script",
    reasoning:
      "Collecting public data on AI agent startups, funding rounds, and market positioning for competitive landscape analysis.",
    toolName: "type_text",
    toolArgs: { text: "python collect_market_data.py" },
  },
  {
    id: "t-002-3",
    agentId: "agent-002",
    timestamp: new Date(now - 30000).toISOString(),
    action: 'Setting document title: "The Rise of Daedalus Labs"',
    toolName: "type_text",
    toolArgs: { text: "The Rise of Daedalus Labs" },
  },
  {
    id: "t-001-4",
    agentId: "agent-001",
    timestamp: new Date(now - 26000).toISOString(),
    action: "Reading paper: Multi-Agent Orchestration Frameworks",
    reasoning:
      "This paper discusses the foundational architecture that Daedalus Labs builds upon. Key sections on agent coordination and task decomposition are directly relevant.",
    toolName: "click",
    toolArgs: { x: 345, y: 312, element: "Paper title link" },
  },
  {
    id: "t-003-3",
    agentId: "agent-003",
    timestamp: new Date(now - 22000).toISOString(),
    action: "Analyzing Daedalus Labs GitHub repositories",
    toolName: "type_text",
    toolArgs: { text: "python analyze_repos.py --org daedalus-labs" },
  },
  {
    id: "t-002-4",
    agentId: "agent-002",
    timestamp: new Date(now - 20000).toISOString(),
    action: "Writing introduction section",
    reasoning:
      "Starting with the thesis: Daedalus Labs has fundamentally changed how AI agents interact with computing environments.",
    toolName: "type_text",
    toolArgs: {
      text: "The landscape of artificial intelligence has undergone a fundamental transformation...",
    },
  },
  {
    id: "t-003-4",
    agentId: "agent-003",
    timestamp: new Date(now - 16000).toISOString(),
    action: "Generating comparison charts",
    reasoning:
      "Creating visual charts comparing Daedalus Labs vs competitors in architecture, performance, and developer experience.",
    toolName: "type_text",
    toolArgs: { text: "python generate_charts.py" },
  },
  {
    id: "t-001-5",
    agentId: "agent-001",
    timestamp: new Date(now - 12000).toISOString(),
    action: "Scrolling through research paper",
    toolName: "scroll",
    toolArgs: { direction: "down", amount: 5 },
  },
  {
    id: "t-004-1",
    agentId: "agent-004",
    timestamp: new Date(now - 10000).toISOString(),
    action: "Initializing desktop environment",
  },
  {
    id: "t-002-5",
    agentId: "agent-002",
    timestamp: new Date(now - 8000).toISOString(),
    action: "Moving cursor to outline section",
    toolName: "move_mouse",
    toolArgs: { x: 400, y: 520 },
  },
  {
    id: "t-001-6",
    agentId: "agent-001",
    timestamp: new Date(now - 5000).toISOString(),
    action: "Searching for market analysis reports",
    reasoning:
      "Need industry reports on AI agent market size and growth projections for the market analysis section.",
    toolName: "type_text",
    toolArgs: { text: "AI agent market size 2024 report" },
  },
  {
    id: "t-004-2",
    agentId: "agent-004",
    timestamp: new Date(now - 3000).toISOString(),
    action: "Waiting for research tasks to complete",
    reasoning:
      "My role is to review and edit the final document. Waiting for other agents to finish research and writing first.",
  },
];
