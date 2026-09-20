/**
 * The phone's way of fetching a page for the iqama reader.
 *
 * The reader (packages/shared/src/iqama) never touches the network itself; this is
 * what it is handed. It times out, follows redirects and reports where it ended up,
 * and does not download PDFs or pictures a mosque has posted its timetable as.
 */

import { textFetcher, type FetchLike, type FetchText } from "@live-azan/shared";

// MAWAQIT turns away React Native's stock agent; a browser-style one is let through.
const BROWSER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
// Everyone else is told who is asking.
const OWN_AGENT = "LiveAzan/1.0 (mosque schedule lookup)";

const isMawaqit = (url: string): boolean => /^https?:\/\/(?:[^/]*\.)?mawaqit\.net(?:[/:?#]|$)/i.test(url);

export const fetchText: FetchText = textFetcher(
  (url, init) => fetch(url, init as RequestInit) as ReturnType<FetchLike>,
  { userAgent: (url) => (isMawaqit(url) ? BROWSER_AGENT : OWN_AGENT) }
);
