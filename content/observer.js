// content/observer.js
// MutationObserver + rAF debounce. Re-runs inflate() on every DOM mutation
// so numbers persist through SPA navigation and re-renders. This is the
// refresh-survival mechanism — the entire point of the project.
(function () {
  if (window.__mathifyObserverLoaded) return;
  window.__mathifyObserverLoaded = true;

  const M = window.__mathify;
  if (!M) {
    console.warn("[mathify] observer.js loaded before inflate.js — bailing");
    return;
  }

  let scheduled = false;
  let currentMult = 100;
  let enabled = true;
  let preset = null;
  let aiDecisions = null;
  let lastPath = location.pathname + location.search;

  // Force every LinkedIn SPA navigation to be a full page load. Inflation
  // works perfectly on a fresh render but is fragile across LinkedIn's
  // in-place route swaps. Rather than fight the SPA, we just turn it off:
  // override history.pushState in the page's main world to call
  // location.assign() instead, which forces a full reload at the new URL.
  // Content script restarts on the new page → numbers inflate correctly.
  // Trade-off is a slower nav (full HTTP round-trip vs in-place hydrate)
  // but for the demo and for users who actually want this to work, that's
  // an acceptable cost.
  function injectFullReloadOnNav() {
    try {
      const s = document.createElement("script");
      s.textContent = `(function(){
        function maybeReload(url) {
          if (!url || typeof url !== 'string') return false;
          try {
            var resolved = new URL(url, location.href).href;
            if (resolved !== location.href) {
              location.assign(resolved);
              return true;
            }
          } catch (e) {}
          return false;
        }
        var origPush = history.pushState;
        history.pushState = function(state, title, url) {
          if (maybeReload(url)) return;
          return origPush.apply(this, arguments);
        };
        var origReplace = history.replaceState;
        history.replaceState = function(state, title, url) {
          if (maybeReload(url)) return;
          return origReplace.apply(this, arguments);
        };
      })();`;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {
      console.warn("[mathify] full-reload-on-nav inject failed", e);
    }
  }
  injectFullReloadOnNav();

  // Belt-and-suspenders: intercept link clicks at the capture phase before
  // LinkedIn's router sees them, force a full page load. Modifier-click and
  // middle-click pass through so users can still open links in new tabs.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;
    const link = e.target.closest && e.target.closest("a[href]");
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    let url;
    try { url = new URL(link.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash === location.hash) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page, hash only
    e.preventDefault();
    e.stopPropagation();
    location.assign(url.href);
  }, true);

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!enabled) return;
      const path = location.pathname + location.search;
      if (path !== lastPath) {
        lastPath = path;
        try { M.restore(document.body); } catch (_) {}
      }
      try {
        M.inflate(document.body, currentMult, preset, aiDecisions);
      } catch (e) {
        // Benign: fires after the user reloads the unpacked extension while
        // LinkedIn is still open — old content scripts keep ticking until the
        // page itself reloads. Quiet log instead of noisy stack trace.
        if (/Extension context invalidated/i.test(e && e.message)) {
          if (!window.__mathifyCtxWarned) {
            console.log("[mathify] extension context invalidated — reload the LinkedIn tab to re-arm");
            window.__mathifyCtxWarned = true;
          }
          return;
        }
        console.error("[mathify] observer tick error", e);
      }
    });
  }

  function loadSettings(cb) {
    chrome.storage.local.get(
      { enabled: true, multiplier: 100, preset: null, aiDecisions: null },
      (s) => {
        enabled = s.enabled !== false;
        currentMult = Number(s.multiplier) || 100;
        preset = s.preset || null;
        aiDecisions = s.aiDecisions || null;
        if (cb) cb();
      }
    );
  }

  loadSettings(() => {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    // Also catch the case where the script loads after the page renders.
    schedule();
    // Periodic re-scan as a safety net for slow-loading content. Cheap —
    // schedule() debounces via rAF, so this only does work when there's
    // actually something to inflate.
    setInterval(schedule, 1500);
  });

  // React to settings changes pushed from the popup or storage.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "mathify:settings-changed") return;
    chrome.storage.local.get(
      { enabled: true, multiplier: 100, preset: null, aiDecisions: null },
      (s) => {
        const wasEnabled = enabled;
        const prevMult = currentMult;
        const prevPreset = preset;
        enabled = s.enabled !== false;
        currentMult = Number(s.multiplier) || 100;
        preset = s.preset || null;
        aiDecisions = s.aiDecisions || null;

        if (wasEnabled && !enabled) {
          // Toggle OFF: restore originals.
          M.restore(document.body);
          if (M.resetCanonical) M.resetCanonical();
          return;
        }
        if (prevMult !== currentMult || prevPreset !== preset || (!wasEnabled && enabled)) {
          // Anything material changed — reset the canonical-per-metric cache
          // so the new multiplier/preset gets a fresh first-seen lock, then
          // restore + re-inflate so we don't compound on already-inflated
          // values.
          if (M.resetCanonical) M.resetCanonical();
          M.restore(document.body);
          schedule();
        }
      }
    );
  });

  // Also listen to storage changes directly (covers background tabs and
  // direct storage writes from the popup that don't message the active tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.enabled && !changes.multiplier && !changes.preset && !changes.aiDecisions) return;
    chrome.storage.local.get(
      { enabled: true, multiplier: 100, preset: null, aiDecisions: null },
      (s) => {
        const newEnabled = s.enabled !== false;
        const newMult = Number(s.multiplier) || 100;
        const newPreset = s.preset || null;
        const newAi = s.aiDecisions || null;
        const changed =
          newEnabled !== enabled ||
          newMult !== currentMult ||
          newPreset !== preset ||
          JSON.stringify(newAi) !== JSON.stringify(aiDecisions);
        if (!changed) return;
        if (M.resetCanonical) M.resetCanonical();
        M.restore(document.body);
        enabled = newEnabled;
        currentMult = newMult;
        preset = newPreset;
        aiDecisions = newAi;
        if (enabled) schedule();
      }
    );
  });

  console.log("[mathify] observer.js armed");
})();
