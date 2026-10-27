// npm run db:migrate: applies db/schema.sql (idempotent).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = neon(url);
for (const stmt of readFileSync("db/schema.sql", "utf8").split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
console.log("schema applied");
