/**
 * Reading a mosque's iqama times, and knowing how far to trust them.
 *
 * The one thing most callers want is `readMosque` (pipeline.ts): give it a mosque
 * and a way to fetch pages, and it returns the best reading with how sure it is, any
 * warnings, and whatever disagreed. The rest is the parts that does it with, for the
 * callers that want one of them alone.
 */

export * from "./types";
export * from "./clock";
export * from "./astro";
export { extractIqama, WINDOW, type ExtractOptions, type PageReading } from "./pageReader";
export { decodeEntities, findCoordinates, flatten, hostOf, pageLinks, pageTitle, resolveUrl, type PageLinks } from "./html";
export * from "./mawaqit";
export * from "./dpt";
export * from "./validate";
export * from "./place";
export * from "./pipeline";
export * from "./present";
export * from "./research";
export * from "./adapters";
