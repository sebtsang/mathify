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
  // The `key` lets AI Decides mode look up a per-metric multiplier by name.
  const METRIC_RATIOS = [
    { key: "impressions", re: /post\s+impressions?/i, ratio: 1.0 },
    { key: "impressions", re: /\bimpressions?/i, ratio: 1.0 },
    { key: "membersReached", re: /members?\s+reached/i, ratio: 1.0 },
    { key: "profileViewers", re: /profile\s+viewers?/i, ratio: 0.25 },
    { key: "profileViewers", re: /profile\s+views?/i, ratio: 0.25 },
    { key: "followersGained", re: /followers?\s+gained/i, ratio: 0.10 },
    { key: "searchAppearances", re: /search\s+appearances?/i, ratio: 0.50 },
    { key: "saves", re: /\bsaves?\b/i, ratio: 0.40 },
    { key: "sends", re: /\bsends?\b/i, ratio: 0.30 },
  ];

  // Time/date words we never want to multiply (e.g. "3 days ago", "12 min")
  const TIME_BLOCK = /\b(ago|hr|hrs|min|mins|sec|secs|day|days|month|months|year|years|hour|hours|minute|minutes|just\s+now|·\s*\d+|st|nd|rd|th)\b/i;

  // URL-pathname patterns that are unconditionally in scope. /in/ is
  // included so the activity-feed inline post-card "XXX impressions"
  // badges on the user's own profile inflate (these are private to the
  // viewer — only the profile owner sees these badges). The cross-surface
  // jump between analytics page and feed is acceptable because both views
  // report different real aggregations on real LinkedIn — a quirk of the
  // platform, not a tell.
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

  // Only check the text node value itself. Walking up to ancestors caused
  // false positives like "Past 7 days" subtitles blocking the post-impressions
  // tile, since the row container included both "18,040" and "Past 7 days".
  function looksLikeTime(textValue) {
    if (TIME_BLOCK.test(textValue)) return true;
    return false;
  }

  // True if the IMMEDIATE row containing this node mentions a public-mirror
  // metric (reactions, comments, reposts, etc.) — leave these alone.
  // Only depth 0-1 so we don't pick up sibling action-button rows ("Like
  // Comment Repost Send") under a shared post-card footer; those are button
  // labels, not counter metrics, but they match the blocked keywords.
  function isBlockedNear(parent) {
    let cur = parent;
    let d = 0;
    while (cur && d < 2) {
      const t = (cur.textContent || "").trim();
      if (t.length < 80 && BLOCKED_KEYWORDS.test(t)) return true;
      cur = cur.parentElement;
      d++;
    }
    return false;
  }

  // Returns { key, ratio } for the closest metric label in the row.
  function getMetricInfo(parent) {
    let cur = parent;
    let d = 0;
    while (cur && d < 3) {
      const t = (cur.textContent || "").trim();
      if (t.length < 200) {
        for (const m of METRIC_RATIOS) {
          if (m.re.test(t)) return { key: m.key, ratio: m.ratio };
        }
      }
      cur = cur.parentElement;
      d++;
    }
    return { key: null, ratio: 1.0 };
  }

  function effectiveMultiplier(base, ratio) {
    // Linear interp so base=1 stays 1 across all metrics.
    return Math.max(1, 1 + (base - 1) * ratio);
  }

  // No canonical lock. Each tick, every number multiplies by its current
  // (preset or AI) multiplier. The data-mathify mark prevents double-
  // multiplication within a page session; SPA nav strips marks via the
  // path-change handler in observer.js, so a navigated-to page gets a fresh
  // inflate. Cross-page numerical consistency is intentionally NOT enforced —
  // LinkedIn itself reports different aggregations for the same metric on
  // different surfaces, and trying to lock them produced staleness bugs that
  // were worse than the inconsistency they were meant to fix.
  function resetCanonical() {
    // Kept as a no-op so observer.js can call it without checking for it.
    // Removing the call sites everywhere would just be churn.
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

  function isJunkParent(parent, node) {
    if (!parent) return true;
    if (parent.closest && parent.closest("[data-mathify-skip]")) return true;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
    if (tag === "TIME") return true; // <time> elements are explicitly temporal
    if (parent.dataset && parent.dataset.mathify === "1") {
      // Stale mark: LinkedIn re-rendered this cell after we inflated it
      // (SPA nav, async data load, hover refetch, etc.). If the current
      // text isn't what we wrote, strip the mark so we can re-process.
      // Without this check, navigating into a sub-page leaves the new
      // page's number unprocessed because the parent still carries the
      // skip flag from the previous page.
      if (node && parent.dataset.mathifyInflated && node.nodeValue !== parent.dataset.mathifyInflated) {
        delete parent.dataset.mathify;
        delete parent.dataset.mathifyOrig;
        delete parent.dataset.mathifyInflated;
        return false;
      }
      return true;
    }
    return false;
  }

  function inflate(root, mult, mode, aiDecisions) {
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
      if (isJunkParent(parent, node)) continue;
      const text = node.nodeValue;
      if (looksLikeTime(text)) continue;
      if (!isInAllowlistedScope(node)) continue;
      if (!hasNearbyKeyword(parent)) continue;
      if (isBlockedNear(parent)) continue;
      NUM_RE.lastIndex = 0;
      if (!NUM_RE.test(text)) continue;
      NUM_RE.lastIndex = 0;
      const info = getMetricInfo(parent);
      const eff = effectiveMultiplier(mult, info.ratio);
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
        // Store what we wrote so the next tick can detect if LinkedIn
        // overwrote it (e.g. SPA nav into a sub-page reusing this cell).
        parent.dataset.mathifyInflated = replaced;
        count++;
      }
    }
    if (count > 0) bumpStats(count, totalImpressionDelta);
    if (count > 0) {
      console.log(
        `[mathify] inflate ${count} nodes on ${location.pathname} (mode=${mode || "static"}, mult=${mult})`,
        "ai mults:", aiDecisions
      );
    }
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
    resetCanonical,
    parseNum,
    formatNum,
    isInAllowlistedScope,
    hasNearbyKeyword,
    pathInScope,
    NUM_RE,
    ANALYTICS_KEYWORDS,
    debug() {
      console.log("[mathify] path:", location.pathname + location.search);
      console.log("[mathify] marked nodes:", document.querySelectorAll("[data-mathify='1']").length);
    },
  });

  // Initial inflation pass — observer.js takes over for live updates.
  function runInitial() {
    chrome.storage.local.get(
      { enabled: true, multiplier: 100, preset: null, aiDecisions: null },
      (s) => {
        if (s.enabled === false) return;
        const n = inflate(document.body, s.multiplier, s.preset, s.aiDecisions);
        if (n) console.log(`[mathify] initial inflation: ${n} node(s)`);
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInitial);
  } else {
    runInitial();
  }

  console.log("[mathify] inflate.js loaded");
})();
