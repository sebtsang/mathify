// content/inflate.js
// Core inflater. Walks text nodes inside allowlisted private-analytics surfaces
// and multiplies numbers near analytics keywords. Trusts text content, never
// CSS class hashes (LinkedIn rotates them).
(function () {
  if (window.__mathifyInflateLoaded) return;
  window.__mathifyInflateLoaded = true;

  // Match: "1,234,567" / "1234" / "1.2K" / "3M"
  const NUM_RE = /\b\d{1,3}(?:,\d{3})+|\b\d+(?:\.\d+)?[KM]?\b/g;

  // ONLY private/unverifiable metrics. Public-mirror counts (reactions,
  // comments, reposts, social engagements) are deliberately excluded — their
  // values are visible to anyone, so inflating them breaks the bit.
  const ANALYTICS_KEYWORDS = /(impressions?|members?\s+reached|profile\s+viewers?|profile\s+views?|followers?\s+gained|search\s+appearances?|post\s+impressions?|\bsaves?\b|\bsends?\b)/i;

  // Public-mirror metrics: any number whose immediate row label matches these
  // is left alone, even on private analytics pages, because the value also
  // appears on the public post.
  const BLOCKED_KEYWORDS = /(reactions?|comments?|reposts?|shares?|social\s+engagements?|engagements?\b)/i;

  // Per-metric scaling. Linear interpolation: effective = 1 + (base - 1) * ratio.
  // Keeps low-multiplier presets (Math Mode 1.5x) feeling subtle across all
  // metrics, while high multipliers (Thought Leader 100x) keep proportions
  // realistic — followers-gained-from-this-post stays believable, etc.
  const METRIC_RATIOS = [
    { re: /post\s+impressions?/i, ratio: 1.0 },
    { re: /\bimpressions?/i, ratio: 1.0 },
    { re: /members?\s+reached/i, ratio: 1.0 },
    { re: /profile\s+viewers?/i, ratio: 0.25 },
    { re: /profile\s+views?/i, ratio: 0.25 },
    { re: /followers?\s+gained/i, ratio: 0.10 },
    { re: /search\s+appearances?/i, ratio: 0.50 },
    { re: /\bsaves?\b/i, ratio: 0.40 },
    { re: /\bsends?\b/i, ratio: 0.30 },
  ];

  // Time/date words we never want to multiply (e.g. "3 days ago", "12 min")
  const TIME_BLOCK = /\b(ago|hr|hrs|min|mins|sec|secs|day|days|month|months|year|years|hour|hours|minute|minutes|just\s+now|·\s*\d+|st|nd|rd|th)\b/i;

  // URL-pathname patterns that are in scope. /in/ is broad but safe: the
  // ANALYTICS_KEYWORDS gate restricts which numbers actually inflate, and
  // private-keyword phrases ("post impressions", "search appearances") only
  // appear inside the user's own private dashboard tile.
  const ALLOWLISTED_PATHS = [
    /\/analytics(\/|$|\?)/,
    /\/me\/profile-views/,
    /\/dashboard\//,
    /^\/in\//,
  ];

  // Text we look for on ancestor headings/labels to identify scope when path alone
  // isn't enough (e.g. on a profile page, the "Your dashboard" tile cluster).
  const ALLOWLISTED_CONTAINER_HINTS = [
    "your dashboard",
    "analytics",
    "who viewed your profile",
    "who's viewed your profile",
    "post impressions",
    "search appearances",
    "private to you",
  ];

  function pathInScope() {
    return ALLOWLISTED_PATHS.some((re) => re.test(location.pathname));
  }

  function ancestorHasHint(el, hints, maxHops) {
    let cur = el;
    let hops = 0;
    while (cur && cur !== document.body && hops < maxHops) {
      const aria = cur.getAttribute && cur.getAttribute("aria-label");
      const txt = (aria || "").toLowerCase();
      if (txt && hints.some((h) => txt.includes(h))) return true;
      // section heading: look at all headings + role=heading nodes inside this container
      if (cur.querySelector) {
        const headers = cur.querySelectorAll("h1, h2, h3, h4, h5, [role='heading']");
        for (const h of headers) {
          const ht = (h.textContent || "").trim().toLowerCase();
          if (ht && hints.some((hh) => ht.includes(hh))) return true;
        }
        // Container-text fallback: look for the unique "Private to you"
        // marker LinkedIn places under private analytics tiles.
        const ct = cur.textContent || "";
        if (ct.length < 5000 && /private to you/i.test(ct)) {
          return true;
        }
      }
      cur = cur.parentElement;
      hops++;
    }
    return false;
  }

  function isInAllowlistedScope(node) {
    if (pathInScope()) return true;
    return ancestorHasHint(node.parentElement, ALLOWLISTED_CONTAINER_HINTS, 15);
  }

  function hasNearbyKeyword(el) {
    let cur = el;
    let depth = 0;
    while (cur && depth < 4) {
      const txt = cur.textContent || "";
      if (txt.length < 600 && ANALYTICS_KEYWORDS.test(txt)) return true;
      cur = cur.parentElement;
      depth++;
    }
    return false;
  }

  function looksLikeTime(parent) {
    let cur = parent;
    let d = 0;
    while (cur && d < 2) {
      const t = cur.textContent || "";
      if (t.length < 200 && TIME_BLOCK.test(t)) return true;
      cur = cur.parentElement;
      d++;
    }
    return false;
  }

  // True if the immediate row containing this node mentions a public-mirror
  // metric (reactions, comments, reposts, etc.) — leave these alone.
  function isBlockedNear(parent) {
    let cur = parent;
    let d = 0;
    while (cur && d < 3) {
      const t = (cur.textContent || "").trim();
      if (t.length < 100 && BLOCKED_KEYWORDS.test(t)) return true;
      cur = cur.parentElement;
      d++;
    }
    return false;
  }

  // Returns the per-metric multiplier ratio (1.0 = full base multiplier;
  // <1 = scaled down). Determined by the closest label text in the row.
  function getMetricRatio(parent) {
    let cur = parent;
    let d = 0;
    while (cur && d < 3) {
      const t = (cur.textContent || "").trim();
      if (t.length < 200) {
        for (const m of METRIC_RATIOS) {
          if (m.re.test(t)) return m.ratio;
        }
      }
      cur = cur.parentElement;
      d++;
    }
    return 1.0;
  }

  function effectiveMultiplier(base, ratio) {
    // Linear interp so base=1 stays 1 across all metrics.
    return Math.max(1, 1 + (base - 1) * ratio);
  }

  function parseNum(s) {
    s = String(s).trim();
    if (/[KM]$/i.test(s)) {
      const mult = s.toUpperCase().endsWith("M") ? 1e6 : 1e3;
      return parseFloat(s) * mult;
    }
    return parseInt(s.replace(/,/g, ""), 10);
  }

  function formatNum(n, originalHadCompact) {
    if (!Number.isFinite(n)) return String(n);
    n = Math.round(n);
    if (originalHadCompact || n >= 10000) {
      if (n >= 1e6) {
        const v = n / 1e6;
        return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")) + "M";
      }
      if (n >= 1e3) {
        const v = n / 1e3;
        return (v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")) + "K";
      }
    }
    return n.toLocaleString("en-US");
  }

  function isJunkParent(parent) {
    if (!parent) return true;
    if (parent.dataset && parent.dataset.mathify === "1") return true;
    if (parent.closest && parent.closest("[data-mathify-skip]")) return true;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
    if (tag === "TIME") return true; // <time> elements are explicitly temporal
    return false;
  }

  function inflate(root, mult) {
    if (!root || !mult || mult === 1) return 0;
    let count = 0;
    let totalImpressionDelta = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (isJunkParent(parent)) continue;
      if (looksLikeTime(parent)) continue;
      if (!isInAllowlistedScope(node)) continue;
      if (!hasNearbyKeyword(parent)) continue;
      if (isBlockedNear(parent)) continue;
      const text = node.nodeValue;
      NUM_RE.lastIndex = 0;
      if (!NUM_RE.test(text)) continue;
      NUM_RE.lastIndex = 0;
      const ratio = getMetricRatio(parent);
      const eff = effectiveMultiplier(mult, ratio);
      if (eff <= 1) continue;
      const original = text;
      const replaced = text.replace(NUM_RE, (m) => {
        const val = parseNum(m);
        if (!Number.isFinite(val) || val === 0) return m;
        if (val < 1) return m;
        const wasCompact = /[KM]$/i.test(m);
        const newVal = val * eff;
        totalImpressionDelta += newVal - val;
        return formatNum(newVal, wasCompact);
      });
      if (replaced !== original) {
        if (!parent.dataset.mathifyOrig) parent.dataset.mathifyOrig = original;
        node.nodeValue = replaced;
        parent.dataset.mathify = "1";
        count++;
      }
    }
    if (count > 0) bumpStats(count, totalImpressionDelta);
    return count;
  }

  function restore(root) {
    if (!root) return;
    root.querySelectorAll("[data-mathify-orig]").forEach((el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && /\d/.test(n.nodeValue)) {
          n.nodeValue = el.dataset.mathifyOrig;
          break;
        }
      }
      delete el.dataset.mathify;
      delete el.dataset.mathifyOrig;
    });
  }

  function bumpStats(lieCount, impressionDelta) {
    chrome.storage.local.get(
      { liesToldSession: 0, inflatedImpressionsSession: 0 },
      (s) => {
        chrome.storage.local.set({
          liesToldSession: s.liesToldSession + lieCount,
          inflatedImpressionsSession:
            s.inflatedImpressionsSession + Math.round(impressionDelta),
        });
      }
    );
  }

  window.__mathify = window.__mathify || {};
  Object.assign(window.__mathify, {
    inflate,
    restore,
    parseNum,
    formatNum,
    isInAllowlistedScope,
    hasNearbyKeyword,
    pathInScope,
    NUM_RE,
    ANALYTICS_KEYWORDS,
  });

  // Initial inflation pass — observer.js takes over for live updates.
  function runInitial() {
    chrome.storage.local.get({ enabled: true, multiplier: 100 }, (s) => {
      if (s.enabled === false) return;
      const n = inflate(document.body, s.multiplier);
      if (n) console.log(`[mathify] initial inflation: ${n} node(s)`);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInitial);
  } else {
    runInitial();
  }

  console.log("[mathify] inflate.js loaded");
})();
