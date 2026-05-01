const els = {
  enabled: document.getElementById("enabled"),
  powerState: document.getElementById("powerState"),
  customMult: document.getElementById("customMult"),
  customOut: document.getElementById("customOut"),
  injectViewers: document.getElementById("injectViewers"),
  presets: document.querySelectorAll(".preset"),
  statLies: document.getElementById("statLies"),
  statImpressions: document.getElementById("statImpressions"),
  statRefused: document.getElementById("statRefused"),
};

const DEFAULTS = {
  enabled: true,
  multiplier: 100,
  injectViewers: true,
  liesToldSession: 0,
  inflatedImpressionsSession: 0,
};

function load() {
  chrome.storage.local.get(DEFAULTS, (s) => {
    els.enabled.checked = s.enabled;
    setPowerLabel(s.enabled);
    els.customMult.value = s.multiplier;
    els.customOut.innerHTML = `${formatMult(s.multiplier)}&times;`;
    els.injectViewers.checked = s.injectViewers;
    els.statLies.textContent = (s.liesToldSession || 0).toLocaleString();
    els.statImpressions.textContent = (s.inflatedImpressionsSession || 0).toLocaleString();
    selectPreset(s.multiplier);
  });
}

function formatMult(n) {
  n = Number(n);
  if (n >= 1000) return Math.round(n).toString();
  if (n % 1 === 0) return n.toString();
  return n.toFixed(1);
}

function selectPreset(mult) {
  els.presets.forEach((p) => {
    p.classList.toggle("selected", Number(p.dataset.mult) === Number(mult));
  });
}

function setPowerLabel(on) {
  els.powerState.textContent = on ? "ACTIVE" : "DORMANT";
  els.powerState.classList.toggle("off", !on);
}

function broadcast() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "mathify:settings-changed" }, () => {
      void chrome.runtime.lastError;
    });
  });
}

els.enabled.addEventListener("change", () => {
  setPowerLabel(els.enabled.checked);
  chrome.storage.local.set({ enabled: els.enabled.checked }, broadcast);
});

els.customMult.addEventListener("input", () => {
  const v = Number(els.customMult.value);
  els.customOut.innerHTML = `${formatMult(v)}&times;`;
  chrome.storage.local.set({ multiplier: v }, broadcast);
  selectPreset(v);
});

els.presets.forEach((p) => {
  p.addEventListener("click", () => {
    const v = Number(p.dataset.mult);
    els.customMult.value = v;
    els.customOut.innerHTML = `${formatMult(v)}&times;`;
    chrome.storage.local.set({ multiplier: v }, broadcast);
    selectPreset(v);
  });
});

els.injectViewers.addEventListener("change", () => {
  chrome.storage.local.set({ injectViewers: els.injectViewers.checked }, broadcast);
});

document.addEventListener("DOMContentLoaded", load);
