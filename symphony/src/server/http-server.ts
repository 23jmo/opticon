// HTTP server lifecycle (§13.7)

import { createServer, type Server } from "node:http";
import { Router, type RouteHandler } from "./router.js";
import { renderDashboard } from "./dashboard.js";
import { buildStateResponse, buildIssueDetailResponse } from "./api-handlers.js";
import { RefreshCoalescer } from "./refresh-coalescer.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("http-server");

export function createHttpServer(
  port: number,
  orchestrator: Orchestrator,
): { server: Server; start: () => Promise<void>; stop: () => Promise<void> } {
  const router = new Router();
  const refreshCoalescer = new RefreshCoalescer(() => orchestrator.refresh());

  // GET / — Dashboard
  router.get("/", ((_, res) => {
    const html = renderDashboard(
      orchestrator.state,
      orchestrator.getRetryQueue().getAll(),
      orchestrator.getRecentEvents(),
    );
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }) as RouteHandler);

  // GET /api/v1/state — System state JSON
  router.get("/api/v1/state", ((_, res) => {
    const data = buildStateResponse(
      orchestrator.state,
      orchestrator.getRetryQueue().getAll(),
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }) as RouteHandler);

  // GET /api/v1/:issue_identifier — Issue detail
  router.get("/api/v1/:issue_identifier", ((_, res, params) => {
    const detail = buildIssueDetailResponse(
      orchestrator.state,
      params.issue_identifier,
      orchestrator.getRecentEvents(),
    );

    if (!detail) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Issue not found or not running" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(detail));
  }) as RouteHandler);

  // POST /api/v1/refresh — Trigger immediate poll
  router.post("/api/v1/refresh", (async (_, res) => {
    refreshCoalescer.request().catch(() => {});
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "accepted" }));
  }) as RouteHandler);

  const server = createServer(async (req, res) => {
    try {
      const handled = await router.handle(req, res);
      if (!handled) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err) {
      log.error(`Request error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  return {
    server,
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => {
          log.info(`HTTP server listening on http://127.0.0.1:${port}`);
          resolve();
        });
        server.on("error", reject);
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          log.info("HTTP server stopped");
          resolve();
        });
      }),
  };
}
