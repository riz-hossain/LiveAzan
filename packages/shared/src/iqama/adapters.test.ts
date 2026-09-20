import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { textFetcher, type FetchLike, type ResponseLike } from "./adapters";

const reply = (over: Partial<ResponseLike> & { type?: string; length?: string; body?: string } = {}): ResponseLike & { read: number } => {
  const headers: Record<string, string> = {};
  if (over.type !== undefined) headers["content-type"] = over.type;
  if (over.length !== undefined) headers["content-length"] = over.length;
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
