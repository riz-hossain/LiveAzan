/**
 * Finding a mosque's iqama times the way a person would, and saying how sure.
 *
 * Somebody who wants a mosque's times looks it up on MAWAQIT if it is there,
 * otherwise goes to its website and reads the times off it, and where a mosque
 * publishes nothing, walks over to the next one. This does the same, in that order,
 * for whoever calls it -- the app, the server, a test -- with the network handed
 * in, so none of them needs anything it does not already have.
 *
 * Sources, best first, and each stops the search only if it yields something a
 * mosque could have:
 *
 *   1. the mosque's MAWAQIT page (a year of times), found by slug or by where the
 *      mosque is;
 *   2. its own timetable plugin (WordPress "Daily Prayer Time for Mosques");
 *   3. a MAWAQIT or Masjidbox page its website embeds;
 *   4. the website itself -- the home page, the pages it links to as prayer times,
 *      the frames it embeds -- and, if a browser is available, the same again after
 *      the page's scripts have run.
 *
 * A MAWAQIT listing and the mosque's own page can each be well-formed and disagree.
 * When they do, and the page read with some certainty, the page is what is offered
 * -- it is the mosque speaking for itself -- and the listing is kept as the
 * alternative. In every case checked by hand while this was built, it was the listing
 * that was out of date or had no iqama entered.
 *
 * Nothing here decides what to show a person. It returns a reading with its
 * confidence, its warnings and whatever disagreed; the caller shows those.
 */

import { sunToday } from "./astro";
import { isoDate } from "./clock";
import {
  dptDayFromRows,
  dptApiUrl,
  dptCandidates,
  dptRows,
  dptJumuah,
  dptSameSite,
  whyPluginNotUsable,
} from "./dpt";
import { findCoordinates, pageLinks, pageTitle } from "./html";
import {
  mawaqitDayFromPage,
  mawaqitDayFromSearch,
  looksLikeMawaqit,
  MawaqitError,
  mawaqitPageUrl,
  parseMawaqitConf,
  parseMawaqitSearch,
  mawaqitSearchUrl,
  mawaqitSlug,
  whyMawaqitNotUsable,
  type MawaqitSearchItem,
} from "./mawaqit";
import { extractIqama, type PageReading } from "./pageReader";
import { distanceKm, neighbours, samePlace, type Place } from "./place";
import { differing, warningsFor } from "./validate";
import {
  type DayTimes,
  type IqamaReading,
  type PrayerKey,
  type ReadingSource,
  type Where,
  type Ymd,
} from "./types";

// --- what the caller hands in -----------------------------------------------------------

export interface HttpResponse {
  /** Where the request ended up, after redirects. */
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** For a 429 or 503 that said how long to wait ("Retry-After"), in milliseconds. */
  retryAfterMs?: number;
}

/**
 * Fetch a page as text. Resolves for any HTTP status -- a refusal is an answer -- and
 * rejects only when the site cannot be reached at all (no such host, refused, timed out).
 */
export type FetchText = (url: string, options?: { timeoutMs?: number }) => Promise<HttpResponse>;

/** Open a page in a real browser and hand back the document its scripts left. Optional. */
export type Render = (url: string) => Promise<{ url: string; html: string }>;

export interface ReadContext {
  fetchText: FetchText;
  render?: Render;
  /** The day on the mosque's own wall. */
  today: Ymd;
  /** Where the mosque is, with its own UTC offset when that is not the phone's or the server's. */
  where?: Where | null;
  /** The whole attempt is given up on after this long. Default a minute. */
  budgetMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

export interface MosqueInput extends Place {
  website?: string | null;
  /** MAWAQIT's slug for this mosque, if already known. */
  mawaqitSlug?: string | null;
  /** MAWAQIT's uuid for this mosque, if that is what is known. */
  mawaqitId?: string | null;
}

export interface Disagreement {
  /** Prayers on which the two differ by more than ten minutes. */
  prayers: PrayerKey[];
  /** The reading that was chosen, and the one it was chosen over. */
  chosen: ReadingSource;
  other: ReadingSource;
}

export interface MosqueOutcome {
  /** The best reading, or null when nothing readable was found. */
  reading: IqamaReading | null;
  /** Other readings of the same day that were set aside because they disagreed. */
  alternatives: IqamaReading[];
  disagreement?: Disagreement;
  /** Why the sources that failed failed, in words for a person. */
  problems: string[];
}

// --- small things ---------------------------------------------------------------------------

const DEFAULT_BUDGET_MS = 60_000;
const FETCH_MS = 12_000;

class Budget {
  private readonly started: number;
  constructor(private readonly ctx: ReadContext) {
    this.started = (ctx.now ?? Date.now)();
  }
  left(): number {
    return (this.ctx.budgetMs ?? DEFAULT_BUDGET_MS) - ((this.ctx.now ?? Date.now)() - this.started);
  }
}

/** Runs `work` over `items`, at most `limit` at once, keeping the order of the results. */
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      out[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function tryFetch(ctx: ReadContext, url: string): Promise<HttpResponse | null> {
  try {
    return await ctx.fetchText(url, { timeoutMs: FETCH_MS });
  } catch {
    return null;
  }
}

function readingFromDay(day: DayTimes, source: ReadingSource, page: string, ctx: ReadContext): IqamaReading {
  const warnings = warningsFor(day.iqama, { today: ctx.today, where: ctx.where, adhan: day.adhan });
  return {
    times: day.iqama,
    source,
    how: "exact",
    asOf: isoDate(ctx.today),
    page,
    computed: [],
    sunChecked: !!ctx.where && sunToday(ctx.where, ctx.today) !== null,
    ...(day.jumuah ? { jumuah: day.jumuah } : {}),
    warnings,
  };
}

function readingFromPage(page: PageReading, url: string, source: ReadingSource, ctx: ReadContext): IqamaReading {
  return {
    times: page.times,
    source,
    how: page.how,
    asOf: isoDate(ctx.today),
    page: url,
    computed: page.computed,
    ...(page.maghribRule ? { maghribRule: page.maghribRule } : {}),
    sunChecked: page.sunChecked,
    ...(page.validUntil ? { validUntil: page.validUntil } : {}),
    warnings: [],
  };
}

/** Whether a page mentions its timetable as a picture or a PDF -- the sentence for why nothing was read. */
const FILE_HINT = /(?:prayer|salah|salat|iqama|timetable|timing|schedule)[^"'<>]{0,60}\.(?:jpe?g|png|webp|gif|pdf)/i;

export function postedAsFile(html: string): "an image" | "a PDF" | "" {
  const found = FILE_HINT.exec(html ?? "");
  if (!found) return "";
  return found[0].toLowerCase().endsWith(".pdf") ? "a PDF" : "an image";
}

// --- the website itself ------------------------------------------------------------------------------

export type WebsiteResult =
  | { ok: true; reading: IqamaReading; title: string; homeHtml: string }
  | { ok: false; reason: "unreachable" | "no_times" | "image" | "pdf"; detail: string; homeHtml: string };

/**
 * Read a site's times off its pages: the home page first; then, only if that has
 * nothing, the pages it links to that look like a prayer-times page and the frames it
 * embeds; then, if a browser is to hand, the same again once the scripts have run.
 */
export async function readWebsite(
  siteUrl: string,
  ctx: ReadContext,
  source: ReadingSource = "website",
  prefetched?: HttpResponse | null
): Promise<WebsiteResult> {
  const clock = new Budget(ctx);
  const home = prefetched ?? (await tryFetch(ctx, siteUrl));
  const homeHtml = home && /html|text|xml/i.test(home.contentType || "text/html") ? home.body : "";
  let title = pageTitle(homeHtml);

  if (home && homeHtml) {
    const found = await readStatic(home.url, homeHtml, ctx);
    if (found) return { ok: true, reading: readingFromPage(found.reading, found.url, source, ctx), title, homeHtml };
  }

  let drawn: string | null = null;
  if (ctx.render && clock.left() > 5_000) {
    const attempt = await readRendered(siteUrl, homeHtml, ctx, clock);
    drawn = attempt.home;
    if (attempt.found) {
      title = title || pageTitle(attempt.home ?? "");
      return { ok: true, reading: readingFromPage(attempt.found.reading, attempt.found.url, source, ctx), title, homeHtml };
    }
  }

  if (!home && drawn === null) {
    return { ok: false, reason: "unreachable", detail: "could not open the site", homeHtml };
  }
  const posted = postedAsFile(homeHtml || drawn || "");
  if (posted) {
    return {
      ok: false,
      reason: posted === "a PDF" ? "pdf" : "image",
      detail: `its timetable is posted as ${posted}, which cannot be read yet`,
      homeHtml,
    };
  }
  return { ok: false, reason: "no_times", detail: "no page on that site prints its congregation times in a form that can be read", homeHtml };
}

async function readStatic(
  homeUrl: string,
  homeHtml: string,
  ctx: ReadContext
): Promise<{ reading: PageReading; url: string } | null> {
  const direct = extractIqama(homeHtml, { today: ctx.today, where: ctx.where });
  if (direct) return { reading: direct, url: homeUrl };
  const { subpages, frames } = pageLinks(homeHtml, homeUrl);
  const wanted = [...subpages, ...frames];
  if (wanted.length === 0) return null;
  const pages = await mapLimit(wanted, 4, (url) => tryFetch(ctx, url));
  const coords = ctx.where ?? findCoordinates(homeHtml);
  let best: { reading: PageReading; url: string } | null = null;
  for (const got of pages) {
    if (!got || !/html|text|xml/i.test(got.contentType || "text/html")) continue;
    const reading = extractIqama(got.body, { today: ctx.today, where: coords });
    if (reading && (best === null || reading.quality > best.reading.quality)) best = { reading, url: got.url };
  }
  return best;
}

async function readRendered(
  siteUrl: string,
  staticHome: string,
  ctx: ReadContext,
  clock: Budget
): Promise<{ found: { reading: PageReading; url: string } | null; home: string | null }> {
  const render = ctx.render!;
  const draw = async (url: string): Promise<{ url: string; html: string } | null> => {
    if (clock.left() <= 0) return null;
    try {
      return await render(url);
    } catch (error) {
      ctx.log?.(`could not render ${url}: ${String(error)}`);
      return null;
    }
  };
  const home = await draw(siteUrl);
  if (!home || !home.html) return { found: null, home: null };
  const coords = ctx.where ?? findCoordinates(home.html) ?? findCoordinates(staticHome);
  const first = extractIqama(home.html, { today: ctx.today, where: coords });
  if (first) return { found: { reading: first, url: home.url }, home: home.html };

  let { subpages, frames } = pageLinks(home.html, home.url);
  if (staticHome) {
    const more = pageLinks(staticHome, siteUrl);
    subpages = [...subpages, ...more.subpages.filter((u) => !subpages.includes(u))];
    frames = [...frames, ...more.frames.filter((u) => !frames.includes(u))];
  }
  const wanted: string[] = [];
  const key = (u: string): string => u.replace(/\/+$/, "");
  for (const url of [...frames, ...subpages]) {
    if (!wanted.some((w) => key(w) === key(url)) && key(url) !== key(home.url)) wanted.push(url); // a frame is the widget itself
  }
  const pages = await mapLimit(wanted.slice(0, 4), 3, draw);
  let best: { reading: PageReading; url: string } | null = null;
  for (const got of pages) {
    if (!got) continue;
    const reading = extractIqama(got.html, { today: ctx.today, where: coords });
    if (reading && (best === null || reading.quality > best.reading.quality)) best = { reading, url: got.url };
  }
  return { found: best, home: home.html };
}

// --- MAWAQIT ------------------------------------------------------------------------------------------

export type MawaqitResult = { ok: true; reading: IqamaReading } | { ok: false; detail: string };

/** MAWAQIT sits behind a per-address rate limit; when it says stop, that is what is reported. */
const MAWAQIT_LIMITING = "mawaqit.net is limiting requests just now, so its listing was not checked";

/** A mosque's MAWAQIT page, read for today. */
export async function readMawaqitPage(slug: string, ctx: ReadContext): Promise<MawaqitResult> {
  const url = mawaqitPageUrl(slug);
  const got = await tryFetch(ctx, url);
  if (got?.status === 429) return { ok: false, detail: MAWAQIT_LIMITING };
  if (!got || got.status >= 400) return { ok: false, detail: "could not reach that mawaqit page" };
  let conf;
  try {
    conf = parseMawaqitConf(got.body);
  } catch (error) {
    return { ok: false, detail: error instanceof MawaqitError ? error.message : "that mawaqit page is unreadable" };
  }
  const why = whyMawaqitNotUsable(conf);
  if (why) return { ok: false, detail: why };
  const day = mawaqitDayFromPage(conf, ctx.today);
  if (!day) return { ok: false, detail: "that mawaqit page has no times for today" };
  return { ok: true, reading: readingFromDay(day, "mawaqit", url, ctx) };
}

/**
 * The MAWAQIT listing for a mosque, by slug if known, else by where it is. The page
 * is preferred (a year of times, with the reasons a listing is unusable); the search
 * result's own day is what is left when the page cannot be read.
 */
export async function readMawaqit(mosque: MosqueInput, ctx: ReadContext): Promise<MawaqitResult> {
  let slug = mosque.mawaqitSlug ? mawaqitSlug(mosque.mawaqitSlug) : "";
  let item: MawaqitSearchItem | undefined;
  if (!slug) {
    const found = await tryFetch(ctx, mawaqitSearchUrl(mosque.latitude, mosque.longitude, 2));
    if (found?.status === 429) return { ok: false, detail: MAWAQIT_LIMITING };
    if (!found || found.status >= 400) return { ok: false, detail: "could not search mawaqit.net" };
    let candidates: MawaqitSearchItem[] = [];
    try {
      candidates = parseMawaqitSearch(JSON.parse(found.body));
    } catch {
      return { ok: false, detail: "mawaqit.net sent back something unreadable" };
    }
    const scored = candidates
      .filter((c) => typeof c.latitude === "number" && typeof c.longitude === "number")
      .filter((c) => (mosque.mawaqitId ? c.uuid === mosque.mawaqitId : samePlace(mosque, { name: c.name ?? c.label ?? "", latitude: c.latitude!, longitude: c.longitude! })))
      .sort((a, b) => distanceKm(mosque.latitude, mosque.longitude, a.latitude!, a.longitude!) - distanceKm(mosque.latitude, mosque.longitude, b.latitude!, b.longitude!));
    item = scored[0];
    if (!item?.slug) return { ok: false, detail: "that mosque is not on mawaqit.net" };
    slug = item.slug;
  }
  const page = await readMawaqitPage(slug, ctx);
  if (page.ok) return page;
  if (item) {
    const day = mawaqitDayFromSearch(item);
    if (day) return { ok: true, reading: readingFromDay(day, "mawaqit", mawaqitPageUrl(slug), ctx) };
  }
  return page;
}

// --- the mosque's own plugin ----------------------------------------------------------------------------

export type PluginResult = { state: "none" } | { state: "broken"; detail: string } | { state: "ok"; reading: IqamaReading };

/** The mosque's WordPress timetable plugin, if it runs one. */
export async function readPlugin(siteUrl: string, ctx: ReadContext): Promise<PluginResult> {
  for (const base of dptCandidates(siteUrl)) {
    const today = await tryFetch(ctx, dptApiUrl(base, "today"));
    if (!today || today.status >= 400 || !dptSameSite(base, today.url)) continue; // nothing of ours here; try the parent
    let payload: unknown;
    try {
      payload = JSON.parse(today.body);
    } catch {
      continue;
    }
    if (!Array.isArray(payload)) continue;
    // Walking up the path stops at the first address that answers, even with nothing: on a
    // multisite the parent is a different mosque, and its times instead would be worse than none.
    const year = await tryFetch(ctx, dptApiUrl(base, "year"));
    if (!year || year.status >= 400) return { state: "broken", detail: "the site's timetable could not be read" };
    let rows;
    try {
      rows = dptRows(JSON.parse(year.body));
    } catch {
      return { state: "broken", detail: "the site's timetable came back unreadable" };
    }
    const why = whyPluginNotUsable(rows, ctx.today);
    if (why) return { state: "broken", detail: why };
    const day = dptDayFromRows(rows, ctx.today, dptJumuah(payload));
    if (!day) return { state: "broken", detail: "the site's timetable has no row for today" };
    return { state: "ok", reading: readingFromDay(day, "plugin", dptApiUrl(base, "year"), ctx) };
  }
  return { state: "none" };
}

// --- a page the mosque's site embeds ---------------------------------------------------------------------

const LINK_MAWAQIT = /mawaqit\.net\/(?:[a-z]{2}\/)?(?:[mw]\/)?([a-z0-9][a-z0-9-]{5,})/gi;
const LINK_MASJIDBOX = /masjidbox\.com\/prayer-times\/([a-z0-9][a-z0-9_-]{2,})/gi;

/**
 * The one MAWAQIT or Masjidbox page a site embeds, or null.
 *
 * Exactly one, and only one: a page that links several is pointing at other mosques
 * rather than saying it is one of them, and reading the wrong mosque's times is worse
 * than reading none.
 */
export function embeddedPage(html: string): { kind: "mawaqit" | "masjidbox"; slug: string; url: string } | null {
  const found = new Map<string, { kind: "mawaqit" | "masjidbox"; slug: string; url: string }>();
  const each = (re: RegExp, add: (slug: string) => void): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) add(m[1].toLowerCase());
  };
  each(LINK_MAWAQIT, (slug) => found.set(`mawaqit:${slug}`, { kind: "mawaqit", slug, url: mawaqitPageUrl(slug) }));
  each(LINK_MASJIDBOX, (slug) =>
    found.set(`masjidbox:${slug}`, { kind: "masjidbox", slug, url: `https://masjidbox.com/prayer-times/${slug}` })
  );
  return found.size === 1 ? [...found.values()][0] : null;
}

// --- the whole of one mosque ---------------------------------------------------------------------------------

/** The site's own side of the story: plugin, embedded page, then the pages themselves. */
async function readSiteSide(mosque: MosqueInput, ctx: ReadContext, problems: string[]): Promise<IqamaReading | null> {
  const site = mosque.website?.trim();
  if (!site) return null;
  if (looksLikeMawaqit(site)) {
    const slug = mawaqitSlug(site);
    const got = slug ? await readMawaqitPage(slug, ctx) : ({ ok: false, detail: "that is not a mawaqit page" } as MawaqitResult);
    if (got.ok) return got.reading;
    problems.push(got.detail);
    return null;
  }

  // A site that cannot be reached at all stops here, in seconds, not after every step has waited its turn.
  const probe = await tryFetch(ctx, site);
  if (!probe) {
    problems.push("could not reach the mosque's website");
    return null;
  }

  const plugin = await readPlugin(probe.url || site, ctx);
  let broken: string | null = null;
  if (plugin.state === "ok") return plugin.reading;
  if (plugin.state === "broken") broken = plugin.detail;

  const embedded = embeddedPage(probe.body);
  if (embedded) {
    if (embedded.kind === "mawaqit") {
      const got = await readMawaqitPage(embedded.slug, ctx);
      if (got.ok) return got.reading;
    } else {
      const got = await readWebsite(embedded.url, ctx);
      if (got.ok) return got.reading;
    }
  }

  const site_ = await readWebsite(probe.url || site, ctx, "website", probe);
  if (site_.ok) {
    // A plugin gone stale is exactly what puts a season-old timetable on a page, and only the sun can tell that from today's.
    if (broken !== null && !site_.reading.sunChecked) {
      problems.push(broken);
      return null;
    }
    return site_.reading;
  }
  problems.push(broken ?? site_.detail);
  return null;
}

/**
 * How much a reading is to be believed when two disagree: the mosque's own feed first, then
 * a page that says which time is the iqama, then a listing, then a page that was only guessed at.
 */
function credit(reading: IqamaReading): number {
  if (reading.source === "plugin") return 100;
  if (reading.source === "website") return reading.how === "labelled" ? 90 : reading.how === "headed" ? 80 : 10;
  if (reading.source === "mawaqit") return 50;
  return 0;
}

/**
 * Every way of finding a mosque's times, together, and the best of what they say.
 *
 * MAWAQIT and the site's own side are asked at once; the network is the slow part and
 * they do not depend on each other.
 */
export async function readMosque(mosque: MosqueInput, ctx: ReadContext): Promise<MosqueOutcome> {
  const problems: string[] = [];
  const site = mosque.website && !looksLikeMawaqit(mosque.website) ? mosque.website : "";
  const [listing, own] = await Promise.all([
    readMawaqit(
      { ...mosque, mawaqitSlug: mosque.mawaqitSlug || (mosque.website && looksLikeMawaqit(mosque.website) ? mawaqitSlug(mosque.website) : null) },
      ctx
    ),
    readSiteSide({ ...mosque, website: site }, ctx, problems),
  ]);
  const feed = listing.ok ? listing.reading : null;
  if (!listing.ok && !problems.includes(listing.detail)) problems.push(listing.detail);

  if (feed && own) {
    const apart = differing(feed.times, own.times);
    const [chosen, other] = credit(own) >= credit(feed) ? [own, feed] : [feed, own];
    if (apart.length === 0) {
      // Two records of one thing agreeing is worth saying, and lifts a guessed page reading to the feed's word.
      return { reading: { ...chosen, corroboratedBy: other.source }, alternatives: [], problems };
    }
    return {
      reading: chosen,
      alternatives: [other],
      disagreement: { prayers: apart, chosen: chosen.source, other: other.source },
      problems,
    };
  }
  return { reading: feed ?? own, alternatives: [], problems };
}

// --- borrowing a neighbour's ------------------------------------------------------------------------------------

export interface Borrowed {
  reading: IqamaReading;
  from: Place & { km: number };
}

/**
 * When a mosque publishes nothing readable, the nearest one that does. Tried nearest
 * first, a few at a time, and given up on when the time is spent. The reading comes
 * back as the neighbour's -- source "nearby", with how far -- and it is for the caller
 * to say so out loud: they are near enough to be useful and are not the mosque's own.
 */
export async function borrowFromNeighbour(
  target: Place,
  candidates: MosqueInput[],
  ctx: ReadContext,
  options: { radiusKm?: number; tries?: number; budgetMs?: number } = {}
): Promise<Borrowed | null> {
  const clock = new Budget({ ...ctx, budgetMs: options.budgetMs ?? 100_000 });
  const near = neighbours(target, candidates, { radiusKm: options.radiusKm ?? 25 }).slice(0, options.tries ?? 5);
  for (const { place, km } of near) {
    if (clock.left() <= 0) break;
    const outcome = await readMosque(place, { ...ctx, where: { lat: place.latitude, lon: place.longitude, utcOffsetHours: ctx.where?.utcOffsetHours } });
    if (outcome.reading) {
      return { reading: { ...outcome.reading, source: "nearby", warnings: [...outcome.reading.warnings] }, from: { ...place, km: Math.round(km * 10) / 10 } };
    }
  }
  return null;
}
