(function initR34VDCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }
  root.R34VDCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function createR34VDCore() {
  const CACHE_PREFIX = "r34vd:v2:";
  const LEGACY_CACHE_PREFIX = "duration_";
  const DEBUG_KEY = "r34vd:debug";
  const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 3000;

  function getPostIdFromUrl(url, baseUrl) {
    if (!url) return null;
    try {
      const parsed = new URL(url, baseUrl || "https://rule34.xxx/");
      return parsed.searchParams.get("id");
    } catch (error) {
      const match = String(url).match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    }
  }

  function isPostViewUrl(url) {
    return Boolean(url && String(url).includes("s=view") && String(url).includes("id="));
  }

  function hasVideoHint(link) {
    const img = link.querySelector("img");
    const video = link.querySelector("video");
    if (video) return true;
    if (!img) return false;

    const classes = Array.from(img.classList);
    if (classes.some((name) => /^(webm|mp4|video)-thumb$/i.test(name))) return true;

    const text = `${img.getAttribute("alt") || ""} ${img.getAttribute("title") || ""}`.toLowerCase();
    return /\b(video|animated|mp4|webm)\b/.test(text);
  }

  function getThumbnailHost(link) {
    return link.closest("span.thumb") || link;
  }

  function findThumbnailCandidates(doc, baseUrl) {
    const seenLinks = new Set();
    const selectors = [
      'span.thumb a[href*="s=view"][href*="id="]',
      'a[href*="s=view"][href*="id="]'
    ];

    return selectors.flatMap((selector) => Array.from(doc.querySelectorAll(selector)))
      .filter((link) => {
        if (seenLinks.has(link)) return false;
        seenLinks.add(link);
        return isPostViewUrl(link.href) && hasVideoHint(link);
      })
      .map((link) => {
        const postId = getPostIdFromUrl(link.href, baseUrl);
        if (!postId) return null;
        return {
          postId,
          postUrl: new URL(link.href, baseUrl || doc.location?.href || "https://rule34.xxx/").href,
          link,
          host: getThumbnailHost(link),
          img: link.querySelector("img"),
          video: link.querySelector("video")
        };
      })
      .filter(Boolean);
  }

  function extractThumbnailMediaParts(src) {
    if (!src) return null;
    const match = String(src).match(/\/thumbnails\/(\d+)\/thumbnail_([a-f0-9]+)\./i);
    if (!match) return null;

    let origin = "https://wimg.rule34.xxx";
    try {
      origin = new URL(src, "https://rule34.xxx/").origin;
    } catch (error) {
      // Keep the known media CDN origin.
    }

    return {
      origin,
      folder: match[1],
      hash: match[2]
    };
  }

  function buildGuessedMediaUrls(thumbnailSrc, postId) {
    const parts = extractThumbnailMediaParts(thumbnailSrc);
    if (!parts) return [];

    const origins = parts.origin.includes("wimg.rule34.xxx")
      ? [parts.origin]
      : ["https://wimg.rule34.xxx", parts.origin];

    return Array.from(new Set(origins)).flatMap((origin) => {
      const base = `${origin}/images/${parts.folder}/${parts.hash}`;
      return [
        `${base}.mp4?${postId}`,
        `${base}.mp4`,
        `${base}.webm?${postId}`,
        `${base}.webm`
      ];
    });
  }

  function absolutizeUrl(url, baseUrl) {
    if (!url) return null;
    try {
      return new URL(url, baseUrl || "https://rule34.xxx/").href;
    } catch (error) {
      return null;
    }
  }

  function mediaKindFromUrl(url) {
    const match = String(url || "").match(/\.(mp4|webm|gif)(?:[?#]|$)/i);
    if (!match) return null;
    if (match[1].toLowerCase() === "gif") return "gif";
    return "video";
  }

  function extractMediaFromHtml(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const videoSelectors = [
      "video source[src]",
      "video[src]",
      "source[src]",
      'a[href$=".mp4"]',
      'a[href$=".webm"]',
      'a[href*=".mp4?"]',
      'a[href*=".webm?"]'
    ];

    for (const selector of videoSelectors) {
      const elements = Array.from(doc.querySelectorAll(selector));
      for (const element of elements) {
        const rawUrl = element.getAttribute("src") || element.getAttribute("href");
        const absoluteUrl = absolutizeUrl(rawUrl, baseUrl);
        if (mediaKindFromUrl(absoluteUrl) === "video") {
          return { kind: "video", url: absoluteUrl };
        }
      }
    }

    const gifElement = doc.querySelector('img[src*=".gif"], a[href*=".gif"]');
    if (gifElement) {
      return {
        kind: "gif",
        url: absolutizeUrl(gifElement.getAttribute("src") || gifElement.getAttribute("href"), baseUrl)
      };
    }

    return { kind: "none", url: null };
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return null;

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function makeCacheKey(postId) {
    return `${CACHE_PREFIX}${postId}`;
  }

  function makeLegacyCacheKey(postId) {
    return `${LEGACY_CACHE_PREFIX}${postId}`;
  }

  function normalizeCacheEntry(value, now) {
    if (!value) return null;

    if (typeof value === "string") {
      if (value === "NONE") {
        return null;
      }
      return {
        kind: value === "GIF" ? "gif" : "video",
        label: value,
        updatedAt: now || Date.now(),
        source: "legacy"
      };
    }

    if (typeof value !== "object" || !value.kind) return null;

    const label = value.label || (value.kind === "gif" ? "GIF" : null);
    if (!label && value.kind !== "none") return null;

    return {
      kind: value.kind,
      label,
      seconds: value.seconds,
      source: value.source || "unknown",
      updatedAt: Number(value.updatedAt) || 0
    };
  }

  function isCacheEntryFresh(entry, now) {
    if (!entry) return false;
    if (entry.kind === "video" || entry.kind === "gif") return true;
    return (now || Date.now()) - entry.updatedAt < NEGATIVE_CACHE_TTL_MS;
  }

  function getCachedResult(items, postId, now) {
    const v2Entry = normalizeCacheEntry(items[makeCacheKey(postId)], now);
    if (isCacheEntryFresh(v2Entry, now)) return v2Entry;

    const legacyEntry = normalizeCacheEntry(items[makeLegacyCacheKey(postId)], now);
    if (isCacheEntryFresh(legacyEntry, now)) return legacyEntry;

    return null;
  }

  function getPrunableCacheKeys(items, maxEntries) {
    const entries = Object.entries(items)
      .filter(([key]) => key.startsWith(CACHE_PREFIX))
      .map(([key, value]) => {
        const entry = normalizeCacheEntry(value);
        return { key, updatedAt: entry?.updatedAt || 0 };
      })
      .sort((a, b) => a.updatedAt - b.updatedAt);

    const overflow = entries.length - (maxEntries || MAX_CACHE_ENTRIES);
    if (overflow <= 0) return [];
    return entries.slice(0, overflow).map((entry) => entry.key);
  }

  function sanitizeUrl(url) {
    return String(url || "")
      .replace(/([a-f0-9]{16,})/gi, "<hash>")
      .replace(/id=\d+/g, "id=<id>")
      .replace(/\?\d+($|[&#])/g, "?<id>$1");
  }

  return {
    CACHE_PREFIX,
    DEBUG_KEY,
    MAX_CACHE_ENTRIES,
    NEGATIVE_CACHE_TTL_MS,
    buildGuessedMediaUrls,
    extractMediaFromHtml,
    extractThumbnailMediaParts,
    findThumbnailCandidates,
    formatDuration,
    getCachedResult,
    getPostIdFromUrl,
    getPrunableCacheKeys,
    hasVideoHint,
    isCacheEntryFresh,
    makeCacheKey,
    makeLegacyCacheKey,
    normalizeCacheEntry,
    sanitizeUrl
  };
});
