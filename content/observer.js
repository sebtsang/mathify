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

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!enabled) return;
      try {
        M.inflate(document.body, currentMult, preset, aiDecisions);
        if (window.__mathifyViewers) window.__mathifyViewers.maybeInject();
      } catch (e) {
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
          if (window.__mathifyViewers) window.__mathifyViewers.removeInjected();
          return;
        }
        if (prevMult !== currentMult || prevPreset !== preset || (!wasEnabled && enabled)) {
          // Anything material changed — restore then re-inflate so we don't
          // compound on already-inflated values.
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
        if (enabled && !newEnabled) {
          M.restore(document.body);
          if (window.__mathifyViewers) window.__mathifyViewers.removeInjected();
        } else {
          M.restore(document.body);
        }
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
