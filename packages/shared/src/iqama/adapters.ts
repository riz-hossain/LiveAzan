/**
 * A `fetch` -- React Native's, Node's, a browser's -- turned into what the reader asks
 * for: a page as text, where it ended up, with a timeout, and without downloading what
 * is not text.
 *
 * The reader never fetches anything itself, so this is the one place a phone's network
 * meets it, and the one place worth getting right for a phone: a mosque site that
 * answers slowly or with a 20 MB PDF must not cost the person's data or their patience.
 */

import type { FetchText, HttpResponse } from "./pipeline";

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

/** "Retry-After" as milliseconds: whole seconds, or a date. Undefined when absent or unreadable. */
function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

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
      const wait = response.status === 429 || response.status === 503 ? retryAfterMs(response.headers.get("retry-after")) : undefined;
      return {
        url: response.url || url,
        status: response.status,
        contentType,
        body: skip ? "" : await response.text(),
        ...(wait !== undefined ? { retryAfterMs: wait } : {}),
      };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };
}

// --- being polite to a host that limits how fast it is asked ------------------------------------------------------------

export interface PoliteOptions {
  /** The addresses the limit is for: MAWAQIT's, say. Anything else goes straight through. */
  applies: (url: string) => boolean;
  /** The least time between the starts of two requests to them. */
  minGapMs: number;
  /** How long to leave them alone after a 429 that does not say. Default a minute. */
  coolMs?: number;
  /** The longest to leave them alone, whatever they say. Default fifteen minutes. */
  maxCoolMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A fetch that keeps to a host's rate limit.
 *
 * Requests to the limited host start no closer together than `minGapMs`, each caller
 * taking its turn. When the host answers 429, nothing more is sent to it until it said
 * it would be ready (its Retry-After, or a minute): the callers still waiting, and any
 * that come, are answered with a 429 of their own and no request, so that a batch that
 * meets the limit carries on with everything else instead of asking again and again.
 *
 * This is for whoever asks in bulk (the server's weekly job, the research script). One
 * person opening one mosque on a phone asks a few times an hour and never meets it; a
 * loop over three hundred mosques asks three times a second, and MAWAQIT's limit is
 * about sixty in a short while, after which it blocks for minutes.
 */
export function politeTo(inner: FetchText, options: PoliteOptions): FetchText {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let nextStart = 0;
  let coolUntil = 0;

  const limited = (url: string): HttpResponse => ({ url, status: 429, contentType: "text/plain", body: "", retryAfterMs: Math.max(0, coolUntil - now()) });

  return async (url, request) => {
    if (!options.applies(url)) return inner(url, request);
    if (now() < coolUntil) return limited(url);

    const at = Math.max(now(), nextStart);
    nextStart = at + options.minGapMs;
    if (at > now()) await sleep(at - now());
    if (now() < coolUntil) return limited(url); // one ahead of this request was refused while it waited its turn

    const response = await inner(url, request);
    if (response.status === 429) {
      const wait = Math.min(options.maxCoolMs ?? 900_000, response.retryAfterMs ?? options.coolMs ?? 60_000);
      coolUntil = Math.max(coolUntil, now() + wait);
    }
    return response;
  };
}
