import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

/** Tagged-template SQL over Neon's HTTP driver; values are always parameters, never spliced. */
export function sql<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    client = neon(process.env.DATABASE_URL);
  }
  return client(strings, ...values) as Promise<T[]>;
}
