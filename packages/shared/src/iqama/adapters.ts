/**
 * A `fetch` -- React Native's, Node's, a browser's -- turned into what the reader asks
 * for: a page as text, where it ended up, with a timeout, and without downloading what
 * is not text.
 *
 * The reader never fetches anything itself, so this is the one place a phone's network
 * meets it, and the one place worth getting right for a phone: a mosque site that
 * answers slowly or with a 20 MB PDF must not cost the person's data or their patience.
 */

import type { FetchText } from "./pipeline";

/** The parts of a fetch Response that are used, so any fetch fits. */
export interface ResponseLike {
  /** Where the request ended up after redirects. Some runtimes leave it empty. */
  url?: string;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: unknown }) => Promise<ResponseLike>;

export interface TextFetcherOptions {
  /** What to call ourselves for an address; some hosts turn away a stock React Native agent. */
  userAgent?: (url: string) => string;
  /** A page bigger than this is not a timetable and is not read. Default 3 MB. */
  maxBytes?: number;
  /** When the caller names no timeout. Default 12 seconds. */
  timeoutMs?: number;
}

/** Things that are not markup or JSON, however small; the reader learns of a PDF from the type alone. */
const NOT_TEXT = /^(?:image|audio|video|font)\/|^application\/(?:pdf|zip|octet-stream|x-)/i;

type Aborter = { signal: unknown; abort(): void };

export function textFetcher(fetchImpl: FetchLike, options: TextFetcherOptions = {}): FetchText {
  const maxBytes = options.maxBytes ?? 3_000_000;
  return async (url, request) => {
    const Abort = (globalThis as { AbortController?: new () => Aborter }).AbortController;
    const controller = Abort ? new Abort() : null;
    const timer = controller ? setTimeout(() => controller.abort(), request?.timeoutMs ?? options.timeoutMs ?? 12_000) : null;
    try {
      const headers: Record<string, string> = { Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" };
      const agent = options.userAgent?.(url);
      if (agent) headers["User-Agent"] = agent;
      const response = await fetchImpl(url, { headers, signal: controller?.signal });
      const contentType = response.headers.get("content-type") ?? "";
      const length = Number(response.headers.get("content-length") ?? "");
      const skip = NOT_TEXT.test(contentType) || (Number.isFinite(length) && length > maxBytes);
      return { url: response.url || url, status: response.status, contentType, body: skip ? "" : await response.text() };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };
}
