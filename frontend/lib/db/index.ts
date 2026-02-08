import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Load .env.local when running via tsx server.ts (Node.js only, not Edge)
if (typeof process !== "undefined" && process.cwd && !process.env.DATABASE_URL) {
  try {
    require("dotenv").config({ path: ".env.local" });
  } catch {
    // dotenv not available in Edge Runtime — env vars loaded by Next.js
  }
}

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
