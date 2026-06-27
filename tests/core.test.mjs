import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const core = require("../src/core.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

beforeEach(() => {
  global.DOMParser = new JSDOM("").window.DOMParser;
});

describe("core parsing helpers", () => {
  it("extracts post ids from absolute, relative, and fallback urls", () => {
    expect(core.getPostIdFromUrl("https://rule34.xxx/index.php?page=post&s=view&id=123")).toBe("123");
    expect(core.getPostIdFromUrl("/index.php?page=post&s=view&id=456", "https://rule34.xxx/")).toBe("456");
    expect(core.getPostIdFromUrl("broken?id=789")).toBe("789");
  });

  it("finds video thumbnails without dropping duplicate post thumbnails", () => {
    const dom = new JSDOM(fixture("list.html"), { url: "https://rule34.xxx/index.php?page=post&s=list&tags=video" });
    const candidates = core.findThumbnailCandidates(dom.window.document, dom.window.location.href);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.postId)).toEqual(["1001", "1001"]);
    expect(candidates.every((candidate) => candidate.host.classList.contains("thumb"))).toBe(true);
  });

  it("builds media guesses in the expected fallback order", () => {
    const urls = core.buildGuessedMediaUrls(
      "https://wimg.rule34.xxx/thumbnails/4077/thumbnail_abcdef0123456789abcdef0123456789.jpg?1001",
      "1001"
    );

    expect(urls).toEqual([
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.mp4?1001",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.mp4",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.webm?1001",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.webm"
    ]);
  });

  it("prefers the media CDN when thumbnails are served from the main host", () => {
    const urls = core.buildGuessedMediaUrls(
      "https://rule34.xxx/thumbnails/4077/thumbnail_abcdef0123456789abcdef0123456789.jpg?1001",
      "1001"
    );

    expect(urls.slice(0, 4)).toEqual([
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.mp4?1001",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.mp4",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.webm?1001",
      "https://wimg.rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.webm"
    ]);
    expect(urls).toContain("https://rule34.xxx/images/4077/abcdef0123456789abcdef0123456789.mp4?1001");
  });

  it("parses post html with DOMParser", () => {
    const media = core.extractMediaFromHtml(fixture("post-video.html"), "https://rule34.xxx/index.php?page=post&s=view&id=1001");

    expect(media).toEqual({
      kind: "video",
      url: "https://wimg.rule34.xxx//images/4077/abcdef0123456789abcdef0123456789.mp4?1001"
    });
  });

  it("detects gif-only post html", () => {
    const media = core.extractMediaFromHtml('<img src="/images/1/sample.gif">', "https://rule34.xxx/index.php?page=post&s=view&id=1");

    expect(media).toEqual({
      kind: "gif",
      url: "https://rule34.xxx/images/1/sample.gif"
    });
  });

  it("formats short and hour-long durations", () => {
    expect(core.formatDuration(62.9)).toBe("1:02");
    expect(core.formatDuration(3661.3)).toBe("1:01:01");
    expect(core.formatDuration(Number.NaN)).toBeNull();
  });
});

describe("cache helpers", () => {
  it("uses fresh v2 values and legacy fallback values", () => {
    const now = Date.now();

    expect(core.getCachedResult({
      [core.makeCacheKey("1")]: { kind: "video", label: "0:12", updatedAt: now, source: "test" }
    }, "1", now)).toMatchObject({ kind: "video", label: "0:12" });

    expect(core.getCachedResult({
      [core.makeLegacyCacheKey("2")]: "GIF"
    }, "2", now)).toMatchObject({ kind: "gif", label: "GIF" });
  });

  it("expires negative cache entries after 24 hours", () => {
    const now = Date.now();
    const stale = now - core.NEGATIVE_CACHE_TTL_MS - 1;

    expect(core.getCachedResult({
      [core.makeCacheKey("1")]: { kind: "none", label: null, updatedAt: stale, source: "test" }
    }, "1", now)).toBeNull();
  });

  it("returns oldest v2 keys for cache pruning", () => {
    const keys = core.getPrunableCacheKeys({
      [core.makeCacheKey("1")]: { kind: "video", label: "0:01", updatedAt: 1 },
      [core.makeCacheKey("2")]: { kind: "video", label: "0:02", updatedAt: 2 },
      [core.makeCacheKey("3")]: { kind: "video", label: "0:03", updatedAt: 3 }
    }, 2);

    expect(keys).toEqual([core.makeCacheKey("1")]);
  });
});
