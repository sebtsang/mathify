const els = {
  enabled: document.getElementById("enabled"),
  powerState: document.getElementById("powerState"),
  customMult: document.getElementById("customMult"),
  customOut: document.getElementById("customOut"),
  injectViewers: document.getElementById("injectViewers"),
  presets: document.querySelectorAll(".preset"),
  presetAI: document.getElementById("presetAI"),
  aiStatus: document.getElementById("aiStatus"),
  aiDetail: document.getElementById("aiDetail"),
  statLies: document.getElementById("statLies"),
  statImpressions: document.getElementById("statImpressions"),
  statRefused: document.getElementById("statRefused"),
};

const DEFAULTS = {
  enabled: true,
  multiplier: 100,
  preset: null,
  aiDecisions: null,
  injectViewers: true,
  liesToldSession: 0,
  inflatedImpressionsSession: 0,
};

const FALLBACK_DECISIONS = () => {
  const r = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo));
  return {
    impressions: r(40, 80),
    membersReached: r(35, 70),
    profileViewers: r(8, 22),
    followersGained: r(4, 14),
    searchAppearances: r(15, 38),
    saves: r(12, 28),
    sends: r(10, 22),
  };
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
    if (s.preset === "ai") {
      selectAI(s.aiDecisions);
    } else {
      selectPreset(s.multiplier);
    }
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
    if (p.dataset.mult === "ai") return;
    p.classList.toggle("selected", Number(p.dataset.mult) === Number(mult));
  });
  els.presetAI.classList.remove("selected", "thinking");
  els.aiStatus.textContent = "gemini picks per-metric";
  els.aiDetail.textContent = "click to ask gemini for a fresh inflation profile";
}

function selectAI(decisions) {
  els.presets.forEach((p) => {
    if (p.dataset.mult === "ai") return;
    p.classList.remove("selected");
  });
  els.presetAI.classList.add("selected");
  els.presetAI.classList.remove("thinking");
  if (decisions && typeof decisions === "object") {
    const median = medianValue(decisions);
    els.aiStatus.textContent = `~${median}× median`;
    els.aiDetail.textContent = describeDecisions(decisions);
  } else {
    els.aiStatus.textContent = "active";
    els.aiDetail.textContent = "gemini decided per-metric multipliers";
  }
}

function medianValue(d) {
  const vals = Object.values(d).filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
}

function describeDecisions(d) {
  const parts = [
    ["imp", d.impressions],
    ["reach", d.membersReached],
    ["viewers", d.profileViewers],
    ["follows", d.followersGained],
    ["search", d.searchAppearances],
    ["saves", d.saves],
    ["sends", d.sends],
  ];
  return parts
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${k} ${v}×`)
    .join(" · ");
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

const AI_PROMPT = `You are deciding inflation multipliers for a satirical Chrome extension that secretly inflates a LinkedIn user's PRIVATE analytics numbers (numbers no one else can see).

Generate one fresh set of per-metric multipliers. Vary them randomly within sensible ranges so the output feels different each time. Realistic ranges:

- impressions: 40-80 (high — the headline number)
- membersReached: 35-70 (slightly less than impressions)
- profileViewers: 8-22 (low — few people click through to a profile)
- followersGained: 4-14 (very low — follower conversion is rare)
- searchAppearances: 15-38 (moderate)
- saves: 12-28 (moderate)
- sends: 10-22 (moderate)

Keep proportions realistic: impressions should be the highest number, followersGained the lowest. Add naturalistic variance — don't just pick round numbers.

Return ONLY a JSON object with these exact keys, integer values, no markdown fence, no prose:
{"impressions": <int>, "membersReached": <int>, "profileViewers": <int>, "followersGained": <int>, "searchAppearances": <int>, "saves": <int>, "sends": <int>}`;

async function callGeminiForDecisions() {
  const cfg = window.MATHIFY_CONFIG || {};
  const key = cfg.GEMINI_API_KEY;
  if (!key || key === "PASTE_YOUR_KEY_HERE") {
    throw new Error("no-key");
  }
  const model = cfg.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: AI_PROMPT }] }],
      generationConfig: { temperature: 1.1, maxOutputTokens: 256 },
    }),
  });
  if (!res.ok) {
    throw new Error(`gemini ${res.status}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  const required = ["impressions", "membersReached", "profileViewers", "followersGained", "searchAppearances", "saves", "sends"];
  for (const k of required) {
    if (typeof parsed[k] !== "number" || !Number.isFinite(parsed[k]) || parsed[k] < 1) {
      throw new Error(`bad value for ${k}`);
    }
    parsed[k] = Math.round(parsed[k]);
  }
  return parsed;
}

async function activateAI() {
  els.presetAI.classList.add("thinking");
  els.presetAI.classList.add("selected");
  els.aiStatus.textContent = "thinking…";
  els.aiDetail.textContent = "gemini is choosing your inflation profile";
  els.presets.forEach((p) => {
    if (p.dataset.mult === "ai") return;
    p.classList.remove("selected");
  });

  let decisions;
  try {
    decisions = await callGeminiForDecisions();
  } catch (e) {
    console.warn("[mathify] AI Decides fallback:", e.message);
    decisions = FALLBACK_DECISIONS();
  }

  chrome.storage.local.set(
    { preset: "ai", aiDecisions: decisions },
    () => {
      selectAI(decisions);
      broadcast();
    }
  );
}

els.enabled.addEventListener("change", () => {
  setPowerLabel(els.enabled.checked);
  chrome.storage.local.set({ enabled: els.enabled.checked }, broadcast);
});

els.customMult.addEventListener("input", () => {
  const v = Number(els.customMult.value);
  els.customOut.innerHTML = `${formatMult(v)}&times;`;
  chrome.storage.local.set({ multiplier: v, preset: null }, broadcast);
  selectPreset(v);
});

els.presets.forEach((p) => {
  if (p.dataset.mult === "ai") return;
  p.addEventListener("click", () => {
    const v = Number(p.dataset.mult);
    els.customMult.value = v;
    els.customOut.innerHTML = `${formatMult(v)}&times;`;
    chrome.storage.local.set({ multiplier: v, preset: null }, broadcast);
    selectPreset(v);
  });
});

els.presetAI.addEventListener("click", activateAI);

els.injectViewers.addEventListener("change", () => {
  chrome.storage.local.set({ injectViewers: els.injectViewers.checked }, broadcast);
});

document.addEventListener("DOMContentLoaded", load);
