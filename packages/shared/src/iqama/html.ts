/**
 * Turning a web page into the lines a person reads, and finding its links.
 *
 * There is no DOM in a React Native app and none on the server, and pulling in a
 * parser for this would be the biggest thing in the bundle, so this is a small
 * scanner: enough HTML to tell visible text from hidden, and where a block ends.
 * It is written for the pages mosques publish -- unclosed tags, inline styles,
 * tables used for layout -- not for the general case.
 */

// --- entities ----------------------------------------------------------------------
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  bull: "•",
  copy: "©",
  raquo: "»",
  laquo: "«",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ecirc: "ê",
  ccedil: "ç",
};

/** &amp; &#39; &#x2019; and a handful of the named ones pages actually use. */
export function decodeEntities(text: string): string {
  if (text.indexOf("&") === -1) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

// --- the scanner --------------------------------------------------------------------
const SKIP = new Set([
  "script", "style", "noscript", "template", "svg", "head", "select", "option",
  "button", "iframe", "canvas", "video", "audio", "object", "embed",
]);
const VOID = new Set([
  "br", "img", "input", "hr", "meta", "link", "area", "base", "col", "source", "track", "wbr", "param",
]);
const BLOCK = new Set([
  "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header",
  "footer", "tr", "table", "dl", "dt", "dd", "main", "nav", "figure", "form", "blockquote", "aside",
  "tbody", "thead", "tfoot", "caption", "address", "details", "summary", "label", "legend", "fieldset",
]);
/** Elements whose contents are text to a browser and never markup: skipped whole. */
const RAW = new Set(["script", "style"]);

const TAG = /<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i;

export type Attributes = Record<string, string>;

function attributesOf(source: string): Attributes {
  const out: Attributes = {};
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(source)) !== null) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function isHidden(attrs: Attributes): boolean {
  if ("hidden" in attrs) return true;
  if ((attrs["aria-hidden"] ?? "").toLowerCase() === "true") return true;
  return HIDDEN_STYLE.test(attrs.style ?? "");
}

export interface TagEvent {
  kind: "start" | "end" | "text";
  tag: string;
  attrs: Attributes;
  text: string;
}

/**
 * Every start tag, end tag and run of text in a page, in order. Comments,
 * doctypes and the insides of <script> and <style> are left out.
 */
export function scan(html: string, emit: (event: TagEvent) => void): void {
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      emit({ kind: "text", tag: "", attrs: {}, text: html.slice(i) });
      return;
    }
    if (lt > i) emit({ kind: "text", tag: "", attrs: {}, text: html.slice(i, lt) });
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === "!" || next === "?") {
      const end = html.indexOf(">", lt + 1);
      i = end === -1 ? n : end + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      emit({ kind: "text", tag: "", attrs: {}, text: "<" });
      i = lt + 1;
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrSource = m[3];
    const selfClosing = attrSource.trimEnd().endsWith("/");
    i = lt + m[0].length;
    if (closing) {
      emit({ kind: "end", tag, attrs: {}, text: "" });
      continue;
    }
    emit({ kind: "start", tag, attrs: attributesOf(attrSource), text: "" });
    if (RAW.has(tag) && !selfClosing) {
      const close = new RegExp(`</${tag}\\s*>`, "i");
      const rest = html.slice(i);
      const found = close.exec(rest);
      i = found ? i + found.index + found[0].length : n;
      emit({ kind: "end", tag, attrs: {}, text: "" });
      continue;
    }
    if (selfClosing) emit({ kind: "end", tag, attrs: {}, text: "" });
  }
}

const HOUR_ALONE = /^\d{1,2}$/;
const MINUTES_ALONE = /^(\d{2})(?:\s*[ap]\.?\s?m\.?)?$/i;

/**
 * "5" then "48 AM" on two lines is 5:48 AM.
 *
 * Some widgets draw the hour and the minutes as separate elements, which a
 * person sees as one time and a reader of the text sees as two numbers.
 */
export function joinSplitTimes(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length && HOUR_ALONE.test(lines[i]) && Number(lines[i]) <= 24) {
      const rest = MINUTES_ALONE.exec(lines[i + 1]);
      if (rest && Number(rest[1]) <= 59) {
        out.push(`${lines[i]}:${lines[i + 1]}`);
        i += 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

/**
 * The visible text of a page, one entry per block, with table cells kept apart
 * by " | ". A page's own markup decides where a line ends, which is what lets a
 * stack of <div>s -- name, then adhan, then iqama -- read the same as a table row.
 */
export function flatten(html: string): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  const stack: Array<{ tag: string; hide: boolean }> = [];
  let hidden = 0;

  const flush = (): void => {
    const text = current.join(" ").split(/\s+/).filter(Boolean).join(" ");
    if (text) lines.push(text);
    current = [];
  };

  try {
    scan(html, (event) => {
      if (event.kind === "text") {
        if (hidden === 0) {
          const text = decodeEntities(event.text).replace(/\u00a0/g, " ").trim();
          if (text) current.push(text);
        }
        return;
      }
      const tag = event.tag;
      if (event.kind === "start") {
        if (tag === "br") {
          flush();
          return;
        }
        if (VOID.has(tag)) return;
        const hide = SKIP.has(tag) || isHidden(event.attrs);
        stack.push({ tag, hide });
        if (hide) hidden += 1;
        else if (tag === "td" || tag === "th") current.push(" | ");
        else if (BLOCK.has(tag)) flush();
        return;
      }
      if (VOID.has(tag)) return;
      // Close back to the matching tag, tolerating the unclosed ones real pages are full of.
      for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].tag === tag) {
          for (const entry of stack.slice(index)) if (entry.hide) hidden = Math.max(0, hidden - 1);
          stack.length = index;
          break;
        }
      }
      if (hidden === 0 && BLOCK.has(tag)) flush();
    });
  } catch {
    // A page that cannot be fully scanned still gives what was read so far.
  }
  flush();
  return joinSplitTimes(lines);
}

export function pageTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return "";
  return decodeEntities(m[1]).split(/\s+/).filter(Boolean).join(" ").slice(0, 80);
}

// --- addresses ----------------------------------------------------------------------

/** Where a relative link points, without needing a URL class that some engines only half have. */
export function resolveUrl(href: string, base: string): string {
  const link = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return link;
  const parts = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i.exec(base);
  if (!parts) return link;
  const [, scheme, host, basePath = "", baseQuery = ""] = parts;
  if (link.startsWith("//")) return `${scheme}${link}`;
  if (link.startsWith("#")) return `${scheme}//${host}${basePath}${baseQuery}`;
  if (link.startsWith("?")) return `${scheme}//${host}${basePath}${link}`;
  let path: string;
  let tail = "";
  const cut = link.search(/[?#]/);
  const target = cut === -1 ? link : link.slice(0, cut);
  if (cut !== -1) tail = link.slice(cut);
  if (target.startsWith("/")) {
    path = target;
  } else {
    const directory = basePath.slice(0, basePath.lastIndexOf("/") + 1) || "/";
    path = directory + target;
  }
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") {
      if (out.length > 1) out.pop();
    } else if (segment !== ".") {
      out.push(segment);
    }
  }
  return `${scheme}//${host}${out.join("/") || "/"}${tail}`;
}

export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]*)/i.exec(url);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

export function pathOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(url);
  return m ? m[1] : "";
}

// --- links --------------------------------------------------------------------------
const PRAYER_LINK = [
  "prayer", "salah", "salat", "namaz", "timing", "iqama", "iqamah", "jamaat", "schedule", "timetable", "times",
];
const NOT_A_TIMETABLE = [
  "youtube.", "youtu.be", "google.com/maps", "maps.google", "facebook.", "instagram.", "vimeo.", "twitter.",
  "donorbox", "paypal", "eventbrite", "calendly", "stripe.", "zoom.us", "gstatic", "doubleclick", "recaptcha",
  "tiktok", "spotify", "soundcloud", "typeform", "mailchimp", "constantcontact", "wa.me", "whatsapp",
  // Read by their own readers, which know which column is which; as a page they show the
  // adhan and the iqama in ways the page reader cannot tell apart.
  "mawaqit.net", "prayersconnect.com",
];
const FILE = /\.(jpe?g|png|gif|svg|webp|pdf|zip|docx?|mp[34])(\?|$)/i;

export interface PageLinks {
  /** Pages on the same site that look like a prayer-times page, best first. */
  subpages: string[];
  /** Frames the page embeds that might be the timetable widget itself. */
  frames: string[];
}

/** Pages worth following from a home page, and frames worth reading. */
export function pageLinks(html: string, base: string): PageLinks {
  const host = hostOf(base);
  const anchors: Array<{ href: string; text: string }> = [];
  const frames: string[] = [];
  let open: { href: string; text: string[] } | null = null;

  try {
    scan(html, (event) => {
      if (event.kind === "start" && event.tag === "a" && event.attrs.href) {
        open = { href: event.attrs.href, text: [] };
      } else if (event.kind === "start" && event.tag === "iframe") {
        const src = event.attrs.src || event.attrs["data-src"];
        if (src) frames.push(src);
      } else if (event.kind === "text" && open) {
        open.text.push(event.text);
      } else if (event.kind === "end" && event.tag === "a" && open) {
        anchors.push({ href: open.href, text: decodeEntities(open.text.join(" ")).split(/\s+/).filter(Boolean).join(" ") });
        open = null;
      }
    });
  } catch {
    // What was found before the trouble is still worth having.
  }

  const scored: Array<[number, string]> = [];
  const seen = new Set<string>();
  const homeKey = base.replace(/\/+$/, "");
  for (const { href, text } of anchors) {
    const url = resolveUrl(href.split("#")[0], base);
    if (!/^https?:\/\//i.test(url) || hostOf(url) !== host || FILE.test(pathOf(url))) continue;
    const path = pathOf(url).toLowerCase();
    const blob = `${path} ${text}`.toLowerCase();
    let score = 0;
    for (const key of PRAYER_LINK) if (blob.includes(key)) score += path.includes(key) ? 2 : 1;
    if ((blob.includes("donat") || blob.includes("event")) && !blob.includes("prayer")) score -= 2;
    const key = url.replace(/\/+$/, "");
    if (score > 0 && !seen.has(key) && key !== homeKey) {
      seen.add(key);
      scored.push([score, url]);
    }
  }
  scored.sort((a, b) => b[0] - a[0]);

  const kept: string[] = [];
  for (const src of frames) {
    const url = resolveUrl(src, base);
    if (/^https?:\/\//i.test(url) && !NOT_A_TIMETABLE.some((k) => url.toLowerCase().includes(k))) kept.push(url);
  }
  return { subpages: scored.slice(0, 3).map((pair) => pair[1]), frames: kept.slice(0, 2) };
}

// --- where the page says the mosque is -----------------------------------------------
const COORDINATE_FORMS: RegExp[] = [
  /"latitude"\s*:\s*"?(-?\d{1,2}\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d{1,3}\.\d+)"?/i,
  /name=["'](?:geo\.position|ICBM)["'][^>]*content=["'](-?\d{1,2}\.\d+)\s*[;,]\s*(-?\d{1,3}\.\d+)/i,
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  /[?&@](?:q=|ll=)?(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/,
  /latitude[^0-9-]{0,30}(-?\d{1,2}\.\d{3,})[^0-9-]{1,40}(-?\d{1,3}\.\d{3,})/i,
];

/**
 * The (latitude, longitude) a page gives for the mosque, or null.
 *
 * A fallback for when the caller does not know: used only to check and complete
 * a reading, never to decide one. A wrong position can only make a good page
 * fail its checks, not a bad one pass them.
 */
export function findCoordinates(html: string): { lat: number; lon: number } | null {
  for (const rx of COORDINATE_FORMS) {
    const m = rx.exec(html);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (lat >= -66 && lat <= 66 && lon >= -180 && lon <= 180 && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) return { lat, lon };
  }
  return null;
}
