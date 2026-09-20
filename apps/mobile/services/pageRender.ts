/**
 * Asking a browser for a page, from the app.
 *
 * A great many mosque sites print nothing in the HTML their server sends and write their times
 * in afterwards with a script: the London Muslim Mosque's own HTML still holds a timetable from
 * last month, which its scripts replace with today's when a browser runs them. The reader is
 * handed pages as text and cannot run anything, so those mosques were unreadable.
 *
 * This is the queue behind that. `renderPage(url)` returns the page as a browser left it; the
 * hidden WebView in components/PageRenderer.tsx is what actually loads it, one page at a time.
 * Nothing here imports React Native, so the waiting, the timeouts and the giving-up are tested
 * on their own (test/pageRender.test.ts).
 *
 * If no renderer is mounted -- on the web, or before the app has drawn -- every request is
 * refused at once and the reader carries on with what it can read as text.
 */

export interface Rendered {
  /** Where the page ended up, after its redirects. */
  url: string;
  html: string;
}

export interface Job {
  url: string;
  /** Milliseconds this job may take in all, from the moment the renderer picks it up. */
  timeoutMs: number;
  settle(page: Rendered): void;
  fail(reason: string): void;
}

/** How long one page may take: a mosque site that has not settled in this long will not. */
export const RENDER_TIMEOUT_MS = 20_000;
/** A page bigger than this is not a timetable, and moving it out of the WebView is not free. */
export const MAX_HTML = 4_000_000;

let waiting: Job[] = [];
let serving = false;
let wake: (() => void) | null = null;

/**
 * The page as a browser leaves it. Rejects when nothing is mounted to draw it, when the queue is
 * already long, or when the page takes too long -- in every case the caller simply goes without.
 */
export function renderPage(url: string, timeoutMs: number = RENDER_TIMEOUT_MS): Promise<Rendered> {
  if (!serving) return Promise.reject(new Error("no renderer is mounted"));
  if (waiting.length >= 4) return Promise.reject(new Error("too many pages waiting to be drawn"));
  return new Promise<Rendered>((resolve, reject) => {
    waiting.push({ url, timeoutMs, settle: resolve, fail: (reason) => reject(new Error(reason)) });
    wake?.();
  });
}

/** Whether a renderer is mounted, for a caller that wants to say so. */
export const canRender = (): boolean => serving;

// --- what the hidden WebView uses -------------------------------------------------------------

/**
 * Called by the renderer when it mounts. Returns the function to call when it goes away; while
 * it is mounted, `next` hands it one job at a time.
 */
export function serveRenders(): () => void {
  serving = true;
  return () => {
    serving = false;
    wake = null;
    const orphans = waiting;
    waiting = [];
    for (const job of orphans) job.fail("the renderer went away");
  };
}

/** The next page to draw, waiting until there is one. Null once the renderer has gone. */
export async function nextJob(): Promise<Job | null> {
  while (serving) {
    const job = waiting.shift();
    if (job) return job;
    await new Promise<void>((resolve) => {
      wake = resolve;
      if (!serving) resolve();
    });
    wake = null;
  }
  return null;
}

/** For the tests, and for a fresh start: forget everything waiting. */
export function resetRenderQueue(): void {
  serving = false;
  wake = null;
  const orphans = waiting;
  waiting = [];
  for (const job of orphans) job.fail("the renderer went away");
}

/** One page being drawn: the renderer answers it exactly once, whoever gets there first. */
export interface Serving {
  id: number;
  url: string;
  done(outcome: { page?: Rendered; error?: string }): void;
}

/**
 * Takes pages off the queue one at a time and hands each to `show`, which must arrange for
 * `done` to be called -- by the page, by an error, or not at all, in which case the job's own
 * timeout answers it. `hide` is called when a page is finished with.
 *
 * Each page gets its own flag and its own timer: a timeout left over from the page before must
 * never be able to answer for the page after, which is the kind of mistake that shows one
 * mosque's times under another's name. Returns the function to call when the renderer goes
 * away, which gives up on the page in hand as well as everything queued.
 */
export function serveQueue(show: (serving: Serving) => void, hide: () => void): () => void {
  const stopServing = serveRenders();
  let alive = true;
  let inHand: Serving | null = null;
  let id = 0;

  void (async () => {
    while (alive) {
      const job = await nextJob();
      if (!job || !alive) break;
      await new Promise<void>((moveOn) => {
        let answered = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const serving: Serving = {
          id: ++id,
          url: job.url,
          done: ({ page, error }) => {
            if (answered) return;
            answered = true;
            if (timer !== null) clearTimeout(timer);
            inHand = null;
            if (page) job.settle(page);
            else job.fail(error ?? "the page could not be read");
            hide();
            moveOn();
          },
        };
        timer = setTimeout(() => serving.done({ error: "the page took too long to draw" }), job.timeoutMs);
        inHand = serving;
        show(serving);
      });
    }
  })();

  return () => {
    alive = false;
    stopServing();
    inHand?.done({ error: "the renderer went away" });
  };
}

// --- what runs inside the page ------------------------------------------------------------------

/**
 * The script the WebView runs in the page: wait for it to load, give its scripts a moment to
 * write the times in, then hand the document back. It reports its own size so that an enormous
 * page is refused rather than moved across.
 */
export function pageScript(settleMs: number, maxHtml: number = MAX_HTML): string {
  return `(function () {
  var sent = false;
  function send() {
    if (sent) return;
    sent = true;
    try {
      var html = document.documentElement.outerHTML;
      var payload = html.length > ${maxHtml}
        ? { error: 'the page is too big to read' }
        : { url: location.href, html: html };
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ error: String(e) })); } catch (ignored) {}
    }
  }
  if (document.readyState === 'complete') setTimeout(send, ${settleMs});
  else window.addEventListener('load', function () { setTimeout(send, ${settleMs}); });
  // a page that never finishes loading still has to answer
  setTimeout(send, ${settleMs} + 8000);
})();
true;`;
}

/** What the script sends back, once it is known to be an object. */
export function parseMessage(raw: string): Rendered | { error: string } {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "the page sent something unreadable" };
  }
  if (!payload || typeof payload !== "object") return { error: "the page sent something unreadable" };
  const got = payload as Partial<Rendered> & { error?: string };
  if (typeof got.error === "string") return { error: got.error };
  if (typeof got.html === "string" && typeof got.url === "string") return { url: got.url, html: got.html };
  return { error: "the page sent something unreadable" };
}
