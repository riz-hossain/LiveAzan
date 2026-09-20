import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  canRender,
  nextJob,
  pageScript,
  parseMessage,
  renderPage,
  resetRenderQueue,
  serveQueue,
  serveRenders,
  type Job,
  type Serving,
} from "../services/pageRender";
import { settle, waitFor } from "./helpers";

afterEach(() => resetRenderQueue());

/** Stands in for the hidden WebView: takes jobs and answers them as told. */
function renderer(answer: (job: Job) => { url: string; html: string } | string) {
  const stop = serveRenders();
  const served: string[] = [];
  let running = true;
  void (async () => {
    while (running) {
      const job = await nextJob();
      if (!job) break;
      served.push(job.url);
      const got = answer(job);
      if (typeof got === "string") job.fail(got);
      else job.settle(got);
    }
  })();
  return { served, stop: () => { running = false; stop(); } };
}

describe("asking a browser for a page", () => {
  it("refuses at once when nothing is mounted to draw it, so the reader carries on without", async () => {
    assert.equal(canRender(), false);
    await assert.rejects(renderPage("https://masjid.example/"), /no renderer is mounted/);
  });

  it("hands back the page the renderer drew", async () => {
    const r = renderer((job) => ({ url: `${job.url}final`, html: "<html>drawn</html>" }));
    const got = await renderPage("https://masjid.example/");
    assert.deepEqual(got, { url: "https://masjid.example/final", html: "<html>drawn</html>" });
    assert.deepEqual(r.served, ["https://masjid.example/"]);
    r.stop();
  });

  it("draws one page at a time, in the order they were asked for", async () => {
    const order: string[] = [];
    const r = renderer((job) => {
      order.push(job.url);
      return { url: job.url, html: "<html></html>" };
    });
    await Promise.all(["https://a.example/", "https://b.example/", "https://c.example/"].map((u) => renderPage(u)));
    assert.deepEqual(order, ["https://a.example/", "https://b.example/", "https://c.example/"]);
    r.stop();
  });

  it("passes on why a page could not be drawn", async () => {
    const r = renderer(() => "the site answered 503");
    await assert.rejects(renderPage("https://masjid.example/"), /the site answered 503/);
    r.stop();
  });

  it("does not let a queue build up behind a slow page", async () => {
    const stop = serveRenders();
    const held: Job[] = [];
    void (async () => {
      for (;;) {
        const job = await nextJob();
        if (!job) break;
        held.push(job); // never answered
      }
    })();
    const asked = ["1", "2", "3", "4", "5", "6", "7"].map((n) => renderPage(`https://${n}.example/`).catch((e) => String(e.message)));
    await waitFor(() => held.length > 0, "the renderer to take the first");
    const results = await Promise.all(asked.map((p) => Promise.race([p, settle(60).then(() => "still waiting")])));
    assert.ok(results.some((r) => r === "too many pages waiting to be drawn"), JSON.stringify(results));
    stop();
  });

  it("gives up on everything waiting when the renderer goes away", async () => {
    const stop = serveRenders();
    const asked = renderPage("https://masjid.example/");
    stop();
    await assert.rejects(asked, /the renderer went away/);
    assert.equal(canRender(), false);
  });
});

describe("what the page is asked to send back", () => {
  it("waits for the page to load, lets its scripts settle, and answers even if it never finishes", () => {
    const script = pageScript(2500);
    assert.match(script, /readyState === 'complete'/);
    assert.match(script, /addEventListener\('load'/);
    assert.match(script, /setTimeout\(send, 2500\)/);
    assert.match(script, /setTimeout\(send, 2500 \+ 8000\)/); // a page that never loads still answers
    assert.match(script, /document\.documentElement\.outerHTML/);
    assert.ok(script.trimEnd().endsWith("true;"), "an injected script must end in a value");
  });

  it("refuses to move an enormous page across", () => {
    assert.match(pageScript(1000, 4_000_000), /html\.length > 4000000/);
  });

  it("reads what the page sent, and treats anything else as a failure", () => {
    assert.deepEqual(parseMessage(JSON.stringify({ url: "https://masjid.example/", html: "<p>hi</p>" })), {
      url: "https://masjid.example/",
      html: "<p>hi</p>",
    });
    assert.deepEqual(parseMessage(JSON.stringify({ error: "the page is too big to read" })), { error: "the page is too big to read" });
    for (const junk of ["not json", "null", '"a string"', "42", JSON.stringify({ html: 5 }), JSON.stringify({ url: "x" })]) {
      assert.ok("error" in parseMessage(junk), junk);
    }
  });
});

describe("serving one page at a time", () => {
  /** Stands in for the WebView: records each page it is shown, and answers only when told. */
  function pane() {
    const shown: Serving[] = [];
    const hidden: number[] = [];
    const stop = serveQueue((s) => shown.push(s), () => hidden.push(shown.length));
    return { shown, hidden, stop };
  }

  it("shows a page, and hides it once it has answered", async () => {
    const p = pane();
    const asked = renderPage("https://masjid.example/");
    await waitFor(() => p.shown.length === 1, "the page to be shown");
    p.shown[0].done({ page: { url: "https://masjid.example/x", html: "<html>drawn</html>" } });
    assert.deepEqual(await asked, { url: "https://masjid.example/x", html: "<html>drawn</html>" });
    assert.equal(p.hidden.length, 1);
    p.stop();
  });

  it("answers a page only once, however many times it is told to", async () => {
    const p = pane();
    const asked = renderPage("https://masjid.example/");
    await waitFor(() => p.shown.length === 1, "the page to be shown");
    p.shown[0].done({ page: { url: "a", html: "first" } });
    p.shown[0].done({ page: { url: "b", html: "second" } });
    p.shown[0].done({ error: "too late" });
    assert.equal((await asked).html, "first");
    p.stop();
  });

  it("gives up on a page that never answers, and moves on to the next", async () => {
    const p = pane();
    const slow = renderPage("https://slow.example/", 40).catch((e) => `failed: ${e.message}`);
    await waitFor(() => p.shown.length === 1, "the slow page to be shown");
    assert.equal(await slow, "failed: the page took too long to draw");
    const next = renderPage("https://next.example/");
    await waitFor(() => p.shown.length === 2, "the next page to be shown");
    p.shown[1].done({ page: { url: "https://next.example/", html: "<html></html>" } });
    assert.ok(await next);
    p.stop();
  });

  it("does not let one page's clock answer for the page after it", async () => {
    const p = pane();
    // the first page is given a short clock and is answered properly before it runs out
    const first = renderPage("https://first.example/", 60);
    await waitFor(() => p.shown.length === 1, "the first page");
    p.shown[0].done({ page: { url: "https://first.example/", html: "first" } });
    assert.equal((await first).html, "first");
    // the second is given a long clock; the first one's must not cut it short
    const second = renderPage("https://second.example/", 5000);
    await waitFor(() => p.shown.length === 2, "the second page");
    await settle(120); // well past the first page's clock
    const raced = await Promise.race([second.then(() => "answered"), settle(30).then(() => "still going")]);
    assert.equal(raced, "still going", "the page before it answered for this one");
    p.shown[1].done({ page: { url: "https://second.example/", html: "second" } });
    assert.equal((await second).html, "second");
    p.stop();
  });

  it("gives up on the page in hand when the renderer goes away", async () => {
    const p = pane();
    const asked = renderPage("https://masjid.example/");
    await waitFor(() => p.shown.length === 1, "the page to be shown");
    p.stop();
    await assert.rejects(asked, /the renderer went away/);
    assert.equal(canRender(), false);
  });
});
