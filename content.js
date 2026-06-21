const CONCURRENT_VIDEO_LOADS = 3;

const durationCache = {};
const videoQueue = [];
let activeVideoLoads = 0;

const processedPostIds = new Set();
const queuedPostFetchIds = new Set();

chrome.storage.local.get(null, (items) => {
  Object.assign(durationCache, items);
  init();
});

function init() {
  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });
  scanForThumbnails();
}

function handleMutations(mutations) {
  let hasNewThumbs = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      hasNewThumbs = true;
      break;
    }
  }
  if (hasNewThumbs) {
    scanForThumbnails();
  }
}

function scanForThumbnails() {
  const postLinks = document.querySelectorAll('a');
  
  postLinks.forEach(link => {
    if (!link.href || !link.href.includes('s=view') || !link.href.includes('id=')) return;
    
    const img = link.querySelector('img');
    const vid = link.querySelector('video');
    if (!img && !vid) return;
    
    const isVideoClass = img && (img.classList.contains('webm-thumb') || img.classList.contains('mp4-thumb') || img.classList.contains('video-thumb'));
    const altText = img ? ((img.getAttribute('alt') || '') + ' ' + (img.getAttribute('title') || '')).toLowerCase() : '';
    const hasVideoTag = altText.includes('video') || altText.includes('animated') || altText.includes('mp4') || altText.includes('webm');
    
    if (!isVideoClass && !hasVideoTag && !vid) return;
    
    let postId = null;
    try {
      const url = new URL(link.href, window.location.origin);
      postId = url.searchParams.get('id');
    } catch(e) {
      const match = link.href.match(/id=(\d+)/);
      if (match) postId = match[1];
    }
    
    if (!postId) return;
    
    if (processedPostIds.has(postId) || queuedPostFetchIds.has(postId)) return;
    queuedPostFetchIds.add(postId);
    
    link.dataset.r34PostId = postId;
    if (window.getComputedStyle(link).position === 'static') {
        link.style.position = 'relative';
    }
    link.style.display = 'inline-block';
    
    // Check cache first
    const cacheKey = `duration_${postId}`;
    if (durationCache[cacheKey]) {
      if (durationCache[cacheKey] === 'NONE') return;
      renderBadge(postId, durationCache[cacheKey], 'success');
      return;
    }

    // Immediately render a loading badge
    renderBadge(postId, '...', 'loading');

    // Extract video hash from thumbnail to try and guess the URL
    let guessedVideoUrl = null;
    if (img && img.src) {
        // e.g. https://wimg.rule34.xxx/thumbnails/1737/thumbnail_33a1de7a9103b7bfbe450d475cd484be.jpg
        const match = img.src.match(/thumbnails\/(\d+)\/thumbnail_([a-f0-9]+)\./i);
        if (match) {
            const folder = match[1];
            const hash = match[2];
            guessedVideoUrl = `https://wimg.rule34.xxx/images/${folder}/${hash}.mp4`;
        }
    }
    
    videoQueue.push({ postId, postUrl: link.href, cacheKey, guessedVideoUrl });
    processVideoQueue();
  });
}

function processVideoQueue() {
  if (activeVideoLoads >= CONCURRENT_VIDEO_LOADS || videoQueue.length === 0) return;
  
  const task = videoQueue.shift();
  activeVideoLoads++;
  
  fetchAndLoadDuration(task).then(durationStr => {
    if (durationStr) {
      durationCache[task.cacheKey] = durationStr;
      chrome.storage.local.set({ [task.cacheKey]: durationStr });
      updateBadge(task.postId, durationStr, 'success');
    } else {
      updateBadge(task.postId, 'NoDur', 'error');
    }
  }).catch(err => {
    console.error(`[R34 Video Duration] Failed for post ${task.postId}:`, err);
    
    if (err.message === 'NoURLFound' || err.message.includes('URL found')) {
      removeBadge(task.postId);
      durationCache[task.cacheKey] = 'NONE';
      chrome.storage.local.set({ [task.cacheKey]: 'NONE' });
      return;
    }
    
    let errMsg = err.message || 'Err';
    if (errMsg.includes('HTML')) errMsg = 'HTML';
    if (errMsg.includes('metadata')) errMsg = 'Meta';
    if (errMsg.includes('Invalid')) errMsg = 'Inv';
    updateBadge(task.postId, errMsg, 'error');
  }).finally(() => {
    activeVideoLoads--;
    processVideoQueue();
  });
}

async function fetchAndLoadDuration(task) {
  let fallbackReason = '';
  // First try the guessed URL if we have one
  if (task.guessedVideoUrl) {
      try {
          return await loadVideoMetadata(task.guessedVideoUrl);
      } catch (e) {
          fallbackReason = e.message;
          console.log(`[R34 Video Duration] Guessed URL failed for ${task.postId}: ${e.message}. Falling back to HTML fetch.`);
      }
  }

  // Fallback: Fetch the post HTML
  let response;
  try {
      response = await fetch(task.postUrl);
  } catch (e) {
      throw new Error(`FetchHTML:${e.message}`);
  }
  
  if (!response.ok) throw new Error('HTMLRes:' + response.status);
  const html = await response.text();
  
  let videoUrl = null;
  const sourceMatch = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i) || html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (sourceMatch && sourceMatch[1].match(/\.(mp4|webm)/i)) {
    videoUrl = sourceMatch[1];
  } else {
    const videoMatch = html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i) || html.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (videoMatch && videoMatch[1].match(/\.(mp4|webm)/i)) {
      videoUrl = videoMatch[1];
    }
  }
  
  if (!videoUrl) {
    if (html.match(/<img[^>]+src=["']([^"']+\.gif[^"']*)["']/i) || html.match(/\.gif["']/i)) {
      return 'GIF';
    }
    throw new Error('NoURLFound');
  }
  
  if (videoUrl.startsWith('//')) {
    videoUrl = window.location.protocol + videoUrl;
  } else if (videoUrl.startsWith('/')) {
    videoUrl = window.location.origin + videoUrl;
  }
  
  return await loadVideoMetadata(videoUrl);
}

function loadVideoMetadata(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        const timeout = setTimeout(() => {
            video.removeAttribute('src');
            video.load();
            reject(new Error('Timeout'));
        }, 15000);
        
        video.addEventListener('loadedmetadata', () => {
            clearTimeout(timeout);
            const duration = video.duration;
            if (duration !== undefined && !isNaN(duration)) {
                resolve(formatDuration(duration));
            } else {
                reject(new Error('Invalid'));
            }
            video.removeAttribute('src');
            video.load();
        });
        
        video.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('MetaErr'));
        });
        
        video.src = videoUrl;
    });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function renderBadge(postId, text, status) {
  const linkEls = document.querySelectorAll(`a[data-r34-post-id="${postId}"]`);
  if (!linkEls || linkEls.length === 0) return;
  
  linkEls.forEach(linkEl => {
      let badge = linkEl.querySelector('.r34-duration-badge');
      if (!badge) {
          badge = document.createElement('div');
          badge.className = 'r34-duration-badge';
          linkEl.appendChild(badge);
          // force reflow
          void badge.offsetWidth;
      }
      
      badge.textContent = text;
      
      // Update styling based on status
      if (status === 'loading') {
          badge.style.backgroundColor = 'rgba(255, 165, 0, 0.8)'; // orange
      } else if (status === 'error') {
          badge.style.backgroundColor = 'rgba(255, 0, 0, 0.8)'; // red
      } else {
          badge.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'; // default black
      }
      
      badge.classList.add('r34-badge-visible');
  });
}

function updateBadge(postId, text, status) {
  renderBadge(postId, text, status);
}

function removeBadge(postId) {
  const linkEls = document.querySelectorAll(`a[data-r34-post-id="${postId}"]`);
  linkEls.forEach(linkEl => {
      const badge = linkEl.querySelector('.r34-duration-badge');
      if (badge) {
          badge.remove();
      }
  });
}
