import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { politeTo, textFetcher, type FetchLike, type ResponseLike } from "./adapters";
import type { FetchText, HttpResponse } from "./pipeline";

const reply = (over: Partial<ResponseLike> & { type?: string; length?: string; body?: string; retryAfter?: string } = {}): ResponseLike & { read: number } => {
  const headers: Record<string, string> = {};
  if (over.type !== undefined) headers["content-type"] = over.type;
  if (over.length !== undefined) headers["content-length"] = over.length;
  if (over.retryAfter !== undefined) headers["retry-after"] = over.retryAfter;
  const made = {
    url: over.url,
    status: over.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    read: 0,
    async text() {
      made.read += 1;
      return over.body ?? "<html></html>";
    },
  };
  return made;
};

describe("turning a fetch into the reader's", () => {
  it("gives the status, type, body and where the request ended up", async () => {
    const fetchImpl: FetchLike = async () => reply({ url: "https://masjid.example/final", type: "text/html; charset=utf-8", body: "<p>hi</p>" });
    const got = await textFetcher(fetchImpl)("https://masjid.example/start");
    assert.deepEqual(got, { url: "https://masjid.example/final", status: 200, contentType: "text/html; charset=utf-8", body: "<p>hi</p>" });
  });

  it("names the address it asked for when the runtime does not say where it ended up", async () => {
    const got = await textFetcher(async () => reply({ url: "", type: "text/html" }))("https://masjid.example/start");
    assert.equal(got.url, "https://masjid.example/start");
  });

  it("treats a refusal as an answer, not a failure", async () => {
    const got = await textFetcher(async () => reply({ status: 404, type: "text/html", body: "gone" }))("https://masjid.example/x");
    assert.equal(got.status, 404);
    assert.equal(got.body, "gone");
  });

  it("calls itself what the caller says for that address", async () => {
    const seen: Record<string, string>[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(init.headers);
      return reply({ type: "text/html" });
    };
    const fetchText = textFetcher(fetchImpl, { userAgent: (url) => (url.includes("mawaqit") ? "Browser/1.0" : "LiveAzan/1.0") });
    await fetchText("https://mawaqit.net/en/x");
    await fetchText("https://masjid.example/");
    assert.equal(seen[0]["User-Agent"], "Browser/1.0");
    assert.equal(seen[1]["User-Agent"], "LiveAzan/1.0");
  });

  it("does not download a PDF or a picture: the type says enough", async () => {
    const pdf = reply({ type: "application/pdf", body: "%PDF-1.4 ..." });
    const picture = reply({ type: "image/jpeg" });
    const got = await textFetcher(async () => pdf)("https://masjid.example/times.pdf");
    assert.equal(got.contentType, "application/pdf");
    assert.equal(got.body, "");
    assert.equal(pdf.read, 0);
    await textFetcher(async () => picture)("https://masjid.example/times.jpg");
    assert.equal(picture.read, 0);
  });

  it("does not download a page that says it is enormous", async () => {
    const big = reply({ type: "text/html", length: String(50_000_000) });
    const got = await textFetcher(async () => big)("https://masjid.example/");
    assert.equal(got.body, "");
    assert.equal(big.read, 0);
    const fine = reply({ type: "text/html", length: "40000" });
    await textFetcher(async () => fine)("https://masjid.example/");
    assert.equal(fine.read, 1);
  });

  it("gives up at the time it was given when the site is too slow", async () => {
    const stuck: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
      });
    const started = Date.now();
    await assert.rejects(textFetcher(stuck)("https://slow.example/", { timeoutMs: 20 }), /aborted/);
    assert.ok(Date.now() - started < 2000, "it waited far longer than it was told to");
  });
});

describe("being told to wait", () => {
  it("reads Retry-After as seconds, or as a date, from a refusal", async () => {
    const seconds = await textFetcher(async () => reply({ status: 429, type: "text/plain", retryAfter: "391" }))("https://mawaqit.net/x");
    assert.equal(seconds.status, 429);
    assert.equal(seconds.retryAfterMs, 391_000);
    const date = new Date(Date.now() + 120_000).toUTCString();
    const dated = await textFetcher(async () => reply({ status: 503, type: "text/plain", retryAfter: date }))("https://mawaqit.net/x");
    assert.ok(dated.retryAfterMs! > 100_000 && dated.retryAfterMs! <= 120_000, String(dated.retryAfterMs));
  });

  it("says nothing of it when there was none, or when the answer was not a refusal", async () => {
    const none = await textFetcher(async () => reply({ status: 429, type: "text/plain" }))("https://mawaqit.net/x");
    assert.equal(none.retryAfterMs, undefined);
    const fine = await textFetcher(async () => reply({ status: 200, type: "text/html", retryAfter: "60" }))("https://mawaqit.net/x");
    assert.equal(fine.retryAfterMs, undefined);
    const junk = await textFetcher(async () => reply({ status: 429, type: "text/plain", retryAfter: "soon" }))("https://mawaqit.net/x");
    assert.equal(junk.retryAfterMs, undefined);
  });
});

describe("keeping to a host's rate limit", () => {
  // a clock that only moves when something sleeps, and a network that records when it was asked
  function setup(answer: (url: string, calls: number) => Partial<HttpResponse> = () => ({})) {
    let t = 0;
    const asked: Array<{ url: string; at: number }> = [];
    const inner: FetchText = async (url) => {
      asked.push({ url, at: t });
      return { url, status: 200, contentType: "text/html", body: "", ...answer(url, asked.length) };
    };
    const now = () => t;
    const sleep = async (ms: number) => {
      t += ms;
    };
    const applies = (url: string) => url.includes("mawaqit.net");
    return { asked, now, sleep, inner, applies, advance: (ms: number) => (t += ms) };
  }

  it("starts requests to the limited host no closer together than asked, and lets everything else straight through", async () => {
    const s = setup();
    const polite = politeTo(s.inner, { applies: s.applies, minGapMs: 2000, now: s.now, sleep: s.sleep });
    await polite("https://mawaqit.net/a");
    await polite("https://mawaqit.net/b");
    await polite("https://masjid.example/");
    await polite("https://mawaqit.net/c");
    assert.deepEqual(s.asked.map((r) => [r.url, r.at]), [
      ["https://mawaqit.net/a", 0],
      ["https://mawaqit.net/b", 2000],
      ["https://masjid.example/", 2000],
      ["https://mawaqit.net/c", 4000],
    ]);
  });

  it("gives callers that come together each their own turn", async () => {
    // in real time, with a small gap: the fake clock above is moved by every sleeper, which is no way to tell who went when
    const starts: number[] = [];
    const inner: FetchText = async (url) => {
      starts.push(Date.now());
      return { url, status: 200, contentType: "text/html", body: "" };
    };
    const polite = politeTo(inner, { applies: () => true, minGapMs: 40 });
    await Promise.all([polite("https://mawaqit.net/a"), polite("https://mawaqit.net/b"), polite("https://mawaqit.net/c")]);
    starts.sort((x, y) => x - y);
    assert.equal(starts.length, 3);
    assert.ok(starts[1] - starts[0] >= 30, `second started ${starts[1] - starts[0]} ms after the first`);
    assert.ok(starts[2] - starts[1] >= 30, `third started ${starts[2] - starts[1]} ms after the second`);
  });

  it("leaves the host alone for as long as it asked, and asks nothing while it does", async () => {
    const s = setup((_url, calls) => (calls === 1 ? { status: 429, retryAfterMs: 5000 } : {}));
    const polite = politeTo(s.inner, { applies: s.applies, minGapMs: 10_000, now: s.now, sleep: s.sleep });
    assert.equal((await polite("https://mawaqit.net/a")).status, 429);
    s.advance(1000);
    const before = s.now();
    const held = await polite("https://mawaqit.net/b");
    assert.equal(s.now(), before, "a refusal while standing back must not wait for its turn first");
    assert.equal(held.status, 429);
    assert.ok(held.retryAfterMs! > 3000 && held.retryAfterMs! <= 4000, String(held.retryAfterMs));
    assert.equal(s.asked.length, 1, "it asked again while it was told to wait");
    // the rest of the web is not held up by it
    assert.equal((await polite("https://masjid.example/")).status, 200);
    // and when the time is up it asks again
    s.advance(5000);
    assert.equal((await polite("https://mawaqit.net/c")).status, 200);
    assert.equal(s.asked.filter((r) => r.url.includes("mawaqit")).length, 2);
  });

  it("stops the callers waiting in line as soon as one is refused", async () => {
    const s = setup((_url, calls) => (calls === 1 ? { status: 429, retryAfterMs: 60_000 } : {}));
    const polite = politeTo(s.inner, { applies: s.applies, minGapMs: 2000, now: s.now, sleep: s.sleep });
    const got = await Promise.all([polite("https://mawaqit.net/a"), polite("https://mawaqit.net/b"), polite("https://mawaqit.net/c")]);
    assert.deepEqual(got.map((r) => r.status), [429, 429, 429]);
    assert.equal(s.asked.length, 1);
  });

  it("waits a minute when it is not told how long, and never longer than the most it will wait", async () => {
    const quiet = setup((_url, calls) => (calls === 1 ? { status: 429 } : {}));
    const a = politeTo(quiet.inner, { applies: quiet.applies, minGapMs: 100, now: quiet.now, sleep: quiet.sleep });
    await a("https://mawaqit.net/1");
    quiet.advance(59_000);
    assert.equal((await a("https://mawaqit.net/2")).status, 429);
    quiet.advance(2_000);
    assert.equal((await a("https://mawaqit.net/3")).status, 200);

    const long = setup((_url, calls) => (calls === 1 ? { status: 429, retryAfterMs: 10_000_000 } : {}));
    const b = politeTo(long.inner, { applies: long.applies, minGapMs: 100, maxCoolMs: 900_000, now: long.now, sleep: long.sleep });
    await b("https://mawaqit.net/1");
    long.advance(899_000);
    assert.equal((await b("https://mawaqit.net/2")).status, 429);
    long.advance(2_000);
    assert.equal((await b("https://mawaqit.net/3")).status, 200);
  });

  it("does not stand back for other refusals", async () => {
    const s = setup((_url, calls) => (calls === 1 ? { status: 404 } : {}));
    const polite = politeTo(s.inner, { applies: s.applies, minGapMs: 100, now: s.now, sleep: s.sleep });
    await polite("https://mawaqit.net/a");
    assert.equal((await polite("https://mawaqit.net/b")).status, 200);
  });
});
