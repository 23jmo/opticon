import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  agentCount: integer("agent_count").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const todos = pgTable("todos", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status").notNull(),
  assignedTo: text("assigned_to"),
  result: text("result"),
});

export const replays = pgTable("replays", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull(),
  manifestUrl: text("manifest_url").notNull(),
  frameCount: integer("frame_count").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
