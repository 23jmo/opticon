// Linear GraphQL client (§11)

import type { Issue, BlockerRef, TrackerConfig } from "../types.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("linear-client");

const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 50;

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: { name: string };
  branchName: string | null;
  url: string;
  labels: { nodes: Array<{ name: string }> };
  relations: { nodes: Array<{ type: string; relatedIssue: { id: string; identifier: string; state: { name: string } } }> };
  createdAt: string | null;
  updatedAt: string | null;
}

interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export class LinearClient {
  private endpoint: string;
  private apiKey: string;
  private projectSlug: string;
  private activeStates: string[];
  private terminalStates: string[];

  constructor(config: TrackerConfig) {
    this.endpoint = config.endpoint ?? "https://api.linear.app/graphql";
    this.apiKey = config.api_key;
    this.projectSlug = config.project_slug;
    this.activeStates = config.active_states;
    this.terminalStates = config.terminal_states;
  }

  private async graphql<T>(gqlQuery: string, variables: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({ query: gqlQuery, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

      if (json.errors && json.errors.length > 0) {
        throw new Error(`Linear GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
      }

      return json.data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Execute a raw GraphQL query (for the linear_graphql tool).
   */
  async rawGraphql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeIssue(node: LinearIssueNode): Issue {
    const blockers: BlockerRef[] = [];
    for (const rel of node.relations.nodes) {
      if (rel.type === "blocks") {
        blockers.push({
          id: rel.relatedIssue.id,
          identifier: rel.relatedIssue.identifier,
          state: rel.relatedIssue.state.name,
        });
      }
    }

    return {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description,
      priority: node.priority !== undefined ? node.priority : null,
      state: node.state.name,
      branch_name: node.branchName,
      url: node.url,
      labels: node.labels.nodes.map((l) => l.name.toLowerCase()),
      blocked_by: blockers,
      created_at: node.createdAt,
      updated_at: node.updatedAt,
    };
  }

  /**
   * §11 Operation 1: Fetch candidate issues from the project, filtered by active states.
   * Paginated with page size 50.
   */
  async fetchCandidateIssues(): Promise<Issue[]> {
    const issues: Issue[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    type CandidateResult = { issues: { nodes: LinearIssueNode[]; pageInfo: LinearPageInfo } };

    while (hasMore) {
      const data: CandidateResult = await this.graphql<CandidateResult>(
        `query CandidateIssues($slug: String!, $states: [String!]!, $first: Int!, $after: String) {
          issues(
            filter: {
              project: { slugId: { eq: $slug } }
              state: { name: { in: $states } }
            }
            first: $first
            after: $after
            orderBy: createdAt
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              state { name }
              branchName
              url
              labels { nodes { name } }
              relations {
                nodes {
                  type
                  relatedIssue {
                    id
                    identifier
                    state { name }
                  }
                }
              }
              createdAt
              updatedAt
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
        {
          slug: this.projectSlug,
          states: this.activeStates,
          first: PAGE_SIZE,
          after: cursor,
        },
      );

      for (const node of data.issues.nodes) {
        issues.push(this.normalizeIssue(node));
      }

      hasMore = data.issues.pageInfo.hasNextPage;
      cursor = data.issues.pageInfo.endCursor;
    }

    log.info(`Fetched ${issues.length} candidate issues`);
    return issues;
  }

  /**
   * §11 Operation 2: Batch fetch issue states by IDs for reconciliation.
   */
  async fetchIssueStatesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const data = await this.graphql<{
      issues: { nodes: Array<{ id: string; state: { name: string } }> };
    }>(
      `query IssueStates($ids: [ID!]!) {
        issues(filter: { id: { in: $ids } }) {
          nodes {
            id
            state { name }
          }
        }
      }`,
      { ids },
    );

    const stateMap = new Map<string, string>();
    for (const node of data.issues.nodes) {
      stateMap.set(node.id, node.state.name);
    }

    return stateMap;
  }

  /**
   * §11 Operation 3: Fetch issues by terminal states (for startup cleanup).
   */
  async fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    const issues: Issue[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    type StateResult = { issues: { nodes: LinearIssueNode[]; pageInfo: LinearPageInfo } };

    while (hasMore) {
      const data: StateResult = await this.graphql<StateResult>(
        `query IssuesByStates($slug: String!, $states: [String!]!, $first: Int!, $after: String) {
          issues(
            filter: {
              project: { slugId: { eq: $slug } }
              state: { name: { in: $states } }
            }
            first: $first
            after: $after
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              state { name }
              branchName
              url
              labels { nodes { name } }
              relations {
                nodes {
                  type
                  relatedIssue {
                    id
                    identifier
                    state { name }
                  }
                }
              }
              createdAt
              updatedAt
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
        {
          slug: this.projectSlug,
          states,
          first: PAGE_SIZE,
          after: cursor,
        },
      );

      for (const node of data.issues.nodes) {
        issues.push(this.normalizeIssue(node));
      }

      hasMore = data.issues.pageInfo.hasNextPage;
      cursor = data.issues.pageInfo.endCursor;
    }

    return issues;
  }

  updateConfig(config: TrackerConfig): void {
    this.endpoint = config.endpoint ?? "https://api.linear.app/graphql";
    this.apiKey = config.api_key;
    this.projectSlug = config.project_slug;
    this.activeStates = config.active_states;
    this.terminalStates = config.terminal_states;
  }
}
