(function initR34VideoDuration() {
  const core = globalThis.R34VDCore;
  if (!core) {
    console.error("[R34VD] Core helpers were not loaded.");
    return;
  }

  const CONCURRENT_VIDEO_LOADS = 3;
  const METADATA_TIMEOUT_MS = 15000;
  const SCAN_DEBOUNCE_MS = 100;

  const storageItems = {};
  const records = new Map();
  const queue = [];
  const queuedPostIds = new Set();
  const activePostIds = new Set();

  let activeVideoLoads = 0;
  let observer = null;
  let scanTimer = null;
  let debugEnabled = false;

  chrome.storage.local.get(null, (items) => {
    Object.assign(storageItems, items || {});
    debugEnabled = isDebugEnabled();
    init();
  });

  function init() {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });
    scanForThumbnails();

    globalThis.__r34vdDebug = {
      getState,
      scanNow: scanForThumbnails,
      clearCache
    };

    debug("initialized", getState());
  }

  function isDebugEnabled() {
    const paramsEnabled = new URLSearchParams(window.location.search).get("r34vd_debug") === "1";
    return paramsEnabled || storageItems[core.DEBUG_KEY] === true;
  }

  function debug(...args) {
    if (!debugEnabled) return;
    console.log("[R34VD]", ...args);
  }

  function warn(...args) {
    if (!debugEnabled) return;
    console.warn("[R34VD]", ...args);
  }

  function handleMutations(mutations) {
    if (!mutations.some((mutation) => mutation.addedNodes.length > 0)) return;
    scheduleScan();
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanForThumbnails, SCAN_DEBOUNCE_MS);
  }

  function scanForThumbnails() {
    const candidates = core.findThumbnailCandidates(document, window.location.href);
    debug("scan", { candidates: candidates.length });

    for (const candidate of candidates) {
      registerCandidate(candidate);
    }
  }

  function registerCandidate(candidate) {
    const now = Date.now();
    const cached = core.getCachedResult(storageItems, candidate.postId, now);
    const record = getRecord(candidate.postId);

    record.hosts.add(candidate.host);
    record.postUrl = candidate.postUrl;
    record.guessedUrls = candidate.img ? core.buildGuessedMediaUrls(candidate.img.src, candidate.postId) : [];

    prepareHost(candidate.host, candidate.postId);

    if (cached) {
      record.status = "cached";
      record.result = cached;
      renderResult(record);
      return;
    }

    if (record.status === "resolved" || record.status === "failed") {
      renderResult(record);
      return;
    }

    renderBadge(candidate.host, "...", "loading");

    if (queuedPostIds.has(candidate.postId) || activePostIds.has(candidate.postId)) return;

    queuedPostIds.add(candidate.postId);
    queue.push(candidate.postId);
    processQueue();
  }

  function getRecord(postId) {
    if (!records.has(postId)) {
      records.set(postId, {
        postId,
        postUrl: "",
        guessedUrls: [],
        hosts: new Set(),
        status: "new",
        result: null
      });
    }

    return records.get(postId);
  }

  function prepareHost(host, postId) {
    host.dataset.r34vdPostId = postId;
    host.classList.add("r34vd-thumb-host");
  }

  function processQueue() {
    while (activeVideoLoads < CONCURRENT_VIDEO_LOADS && queue.length > 0) {
      const postId = queue.shift();
      const record = records.get(postId);
      if (!record) {
        queuedPostIds.delete(postId);
        continue;
      }

      queuedPostIds.delete(postId);
      activePostIds.add(postId);
      activeVideoLoads++;
      record.status = "resolving";

      resolveRecord(record)
        .then((result) => {
          record.status = "resolved";
          record.result = result;
          saveResult(record.postId, result);
          renderResult(record);
        })
        .catch((error) => {
          const result = {
            kind: "error",
            label: "Err",
            source: error.message || "resolver",
            updatedAt: Date.now()
          };

          record.status = "failed";
          record.result = result;
          saveResult(record.postId, result);
          renderResult(record);
          warn("resolver failed", record.postId, error.message || error);
        })
        .finally(() => {
          activePostIds.delete(postId);
          activeVideoLoads--;
          processQueue();
        });
    }
  }

  async function resolveRecord(record) {
    for (const guessedUrl of record.guessedUrls) {
      try {
        const result = await loadVideoMetadata(guessedUrl);
        debug("metadata resolved from guess", record.postId, core.sanitizeUrl(guessedUrl));
        return { ...result, source: "guess", updatedAt: Date.now() };
      } catch (error) {
        debug("guess failed", record.postId, core.sanitizeUrl(guessedUrl), error.message);
      }
    }

    const html = await fetchPostHtml(record.postUrl);
    const media = core.extractMediaFromHtml(html, record.postUrl);

    if (media.kind === "gif") {
      debug("gif resolved from post html", record.postId);
      return {
        kind: "gif",
        label: "GIF",
        source: "post-html",
        updatedAt: Date.now()
      };
    }

    if (media.kind === "none") {
      debug("no media found", record.postId);
      return {
        kind: "none",
        label: null,
        source: "post-html",
        updatedAt: Date.now()
      };
    }

    const result = await loadVideoMetadata(media.url);
    debug("metadata resolved from post html", record.postId, core.sanitizeUrl(media.url));
    return { ...result, source: "post-html", updatedAt: Date.now() };
  }

  async function fetchPostHtml(postUrl) {
    let response;
    try {
      response = await fetch(postUrl, { credentials: "same-origin" });
    } catch (error) {
      throw new Error(`FetchHTML:${error.message || error}`);
    }

    if (!response.ok) {
      throw new Error(`HTMLRes:${response.status}`);
    }

    return response.text();
  }

  function loadVideoMetadata(videoUrl) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      let settled = false;

      video.preload = "metadata";
      video.muted = true;

      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        video.removeAttribute("src");
        video.load();
        callback(value);
      };

      const timeout = window.setTimeout(() => {
        settle(reject, new Error("Timeout"));
      }, METADATA_TIMEOUT_MS);

      video.addEventListener("loadedmetadata", () => {
        const seconds = video.duration;
        const label = core.formatDuration(seconds);

        if (!label) {
          settle(reject, new Error("InvalidDuration"));
          return;
        }

        settle(resolve, {
          kind: "video",
          label,
          seconds: Math.floor(seconds)
        });
      });

      video.addEventListener("error", () => {
        settle(reject, new Error("MetadataError"));
      });

      video.src = videoUrl;
    });
  }

  function renderResult(record) {
    for (const host of record.hosts) {
      if (!record.result) {
        removeBadge(host);
      } else if (record.result.kind === "video" || record.result.kind === "gif") {
        renderBadge(host, record.result.label, "success");
      } else if (debugEnabled && record.result.kind === "error") {
        renderBadge(host, record.result.label || "Err", "error");
      } else {
        removeBadge(host);
      }
    }
  }

  function renderBadge(host, text, status) {
    let badge = host.querySelector(":scope > .r34-duration-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "r34-duration-badge";
      host.appendChild(badge);
      void badge.offsetWidth;
    }

    badge.textContent = text;
    badge.classList.remove("r34-duration-badge--loading", "r34-duration-badge--error", "r34-duration-badge--success");
    badge.classList.add(`r34-duration-badge--${status}`, "r34-badge-visible");
  }

  function removeBadge(host) {
    const badge = host.querySelector(":scope > .r34-duration-badge");
    if (badge) badge.remove();
  }

  function saveResult(postId, result) {
    const cacheKey = core.makeCacheKey(postId);
    storageItems[cacheKey] = result;
    chrome.storage.local.set({ [cacheKey]: result }, () => {
      pruneCacheIfNeeded();
    });
  }

  function pruneCacheIfNeeded() {
    const keys = core.getPrunableCacheKeys(storageItems, core.MAX_CACHE_ENTRIES);
    if (!keys.length) return;

    for (const key of keys) {
      delete storageItems[key];
    }

    chrome.storage.local.remove(keys);
    debug("pruned cache", { count: keys.length });
  }

  function clearCache() {
    const keys = Object.keys(storageItems).filter((key) => key.startsWith(core.CACHE_PREFIX));
    for (const key of keys) {
      delete storageItems[key];
    }
    chrome.storage.local.remove(keys);
    debug("cache cleared", { count: keys.length });
    return keys.length;
  }

  function getState() {
    return {
      debugEnabled,
      records: records.size,
      queued: queue.length,
      active: activeVideoLoads,
      queuedPostIds: Array.from(queuedPostIds),
      activePostIds: Array.from(activePostIds)
    };
  }
})();
