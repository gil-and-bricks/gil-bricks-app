/**
 * Minimal D1 surface used by this Worker — declared locally so the Astro
 * app's DOM-lib tsconfig doesn't have to swallow the full workers-types
 * globals (they conflict with lib.dom).
 */
interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/**
 * DP4 — the slice of R2 a saved pack needs, and nothing more.
 *
 * Hand-written for the same reason D1Database above is: this package declares
 * the Cloudflare surface it actually uses rather than pulling in the whole
 * workers-types package, so the types say what the Worker is allowed to do.
 */
interface R2ObjectBody {
  text(): Promise<string>;
}

interface R2Bucket {
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}
