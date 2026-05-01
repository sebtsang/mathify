const els = {
  enabled: document.getElementById("enabled"),
  powerState: document.getElementById("powerState"),
  customMult: document.getElementById("customMult"),
  customOut: document.getElementById("customOut"),
  injectViewers: document.getElementById("injectViewers"),
  presets: document.querySelectorAll(".preset"),
  presetAI: document.getElementById("presetAI"),
  aiStatus: document.getElementById("aiStatus"),
  aiVoice: document.getElementById("aiVoice"),
  aiDetail: document.getElementById("aiDetail"),
  aiSource: document.getElementById("aiSource"),
  statLies: document.getElementById("statLies"),
  statImpressions: document.getElementById("statImpressions"),
  statRefused: document.getElementById("statRefused"),
};

const DEFAULTS = {
  enabled: true,
  multiplier: 100,
  preset: null,
  aiDecisions: null,
  aiVoice: null,
  aiReasoning: null,
  aiSource: null,
  injectViewers: true,
  liesToldSession: 0,
  inflatedImpressionsSession: 0,
};

const VOICES = [
  { name: "The Ascended", profile: { imp: [70, 90], reach: [55, 75], view: [18, 25], foll: [10, 16], srch: [30, 45], save: [22, 32], send: [18, 26] } },
  { name: "Vulnerable Vet", profile: { imp: [50, 70], reach: [50, 70], view: [10, 16], foll: [3, 7], srch: [15, 25], save: [18, 28], send: [12, 20] } },
  { name: "Tech Bro Sermonizer", profile: { imp: [70, 90], reach: [40, 60], view: [10, 18], foll: [6, 12], srch: [20, 30], save: [12, 20], send: [10, 18] } },
  { name: "The Numbers Guy", profile: { imp: [40, 60], reach: [35, 55], view: [12, 20], foll: [5, 10], srch: [35, 45], save: [14, 22], send: [12, 20] } },
  { name: "Quiet Confidence", profile: { imp: [30, 50], reach: [25, 45], view: [6, 12], foll: [3, 8], srch: [12, 22], save: [10, 18], send: [8, 14] } },
  { name: "Niche Operator", profile: { imp: [45, 65], reach: [35, 55], view: [10, 18], foll: [5, 10], srch: [18, 28], save: [25, 32], send: [20, 26] } },
  { name: "Conference Lurker", profile: { imp: [55, 75], reach: [40, 60], view: [20, 25], foll: [8, 14], srch: [22, 32], save: [12, 20], send: [10, 18] } },
];

const FALLBACK_REASONING = {
  "The Ascended": "Maximum across the board. Subtlety is for people who don't post on Saturdays.",
  "Vulnerable Vet": "High reach with low conversion — your message resonates, your CTA does not.",
  "Tech Bro Sermonizer": "Huge impressions, modest follow-through. Broadcasting at people, not to them.",
  "The Numbers Guy": "Search-heavy, profile-light. SEO is your love language.",
  "Quiet Confidence": "Low numbers but proportional. The humble flex.",
  "Niche Operator": "Saves and sends spike. Insider audience bookmarks and DMs.",
  "Conference Lurker": "Profile views from posts spike. Networking-mode active.",
};

function rand(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo)); }

function fallbackProfile() {
  const v = VOICES[Math.floor(Math.random() * VOICES.length)];
  const m = {
    impressions: rand(v.profile.imp[0], v.profile.imp[1]),
    membersReached: rand(v.profile.reach[0], v.profile.reach[1]),
    profileViewers: rand(v.profile.view[0], v.profile.view[1]),
    followersGained: rand(v.profile.foll[0], v.profile.foll[1]),
    searchAppearances: rand(v.profile.srch[0], v.profile.srch[1]),
    saves: rand(v.profile.save[0], v.profile.save[1]),
    sends: rand(v.profile.send[0], v.profile.send[1]),
  };
  return { voice: v.name, reasoning: FALLBACK_REASONING[v.name], multipliers: m };
}

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
      selectAI(s.aiDecisions, s.aiVoice, s.aiReasoning, s.aiSource, s.aiError);
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
  els.aiStatus.textContent = "gemini picks a brand voice";
  els.aiVoice.textContent = "";
  els.aiDetail.textContent = "click to ask gemini for a fresh inflation profile";
  els.aiSource.textContent = "";
  els.aiSource.className = "preset-ai-source";
}

function selectAI(decisions, voice, reasoning, source, errorMessage) {
  els.presets.forEach((p) => {
    if (p.dataset.mult === "ai") return;
    p.classList.remove("selected");
  });
  els.presetAI.classList.add("selected");
  els.presetAI.classList.remove("thinking");
  if (decisions && typeof decisions === "object") {
    const median = medianValue(decisions);
    els.aiStatus.textContent = `~${median}× median`;
    els.aiVoice.textContent = voice ? `“${voice}”` : "";
    els.aiDetail.textContent = reasoning || describeDecisions(decisions);
    setSource(source, errorMessage);
  } else {
    els.aiStatus.textContent = "active";
    els.aiVoice.textContent = "";
    els.aiDetail.textContent = "gemini decided per-metric multipliers";
    els.aiSource.textContent = "";
    els.aiSource.className = "preset-ai-source";
  }
}

function setSource(source, errorMessage) {
  if (source === "live") {
    els.aiSource.textContent = "✓ live from gemini-2.5-flash";
    els.aiSource.className = "preset-ai-source live";
  } else if (source === "fallback") {
    const detail = errorMessage ? truncate(errorMessage, 140) : "key invalid";
    els.aiSource.textContent = `⚠ fallback (${detail})`;
    els.aiSource.title = errorMessage || "";
    els.aiSource.className = "preset-ai-source fallback";
  } else if (source === "error") {
    const detail = errorMessage ? truncate(errorMessage, 140) : "see console";
    els.aiSource.textContent = `⚠ fallback (${detail})`;
    els.aiSource.title = errorMessage || "";
    els.aiSource.className = "preset-ai-source error";
  } else {
    els.aiSource.textContent = "";
    els.aiSource.className = "preset-ai-source";
  }
}

function truncate(s, n) {
  if (typeof s !== "string") return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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

// Force-reload the active LinkedIn tab so the new preset/AI multipliers
// apply on the same page the user is currently looking at, without them
// having to manually refresh.
function broadcastAndReload() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "mathify:settings-changed" }, () => {
      void chrome.runtime.lastError;
    });
    if (tabs[0].url && /https?:\/\/[^\/]*linkedin\.com/i.test(tabs[0].url)) {
      chrome.tabs.reload(tabs[0].id);
    }
  });
}

const AI_PROMPT = `You are deciding inflation multipliers for a satirical Chrome extension that secretly inflates a LinkedIn user's PRIVATE analytics numbers.

Step 1: pick ONE "brand voice" archetype at random. Vary your choice each call.
- "The Ascended" — full thought-leader era; everything is high; subtlety is dead.
- "Vulnerable Vet" — high reach with low followers gained; people resonate but don't convert.
- "Tech Bro Sermonizer" — huge impressions, modest everything else; broadcasting at people.
- "The Numbers Guy" — moderate impressions, very high search appearances; SEO-coded.
- "Quiet Confidence" — low numbers, proportional; the humble flex.
- "Niche Operator" — saves and sends spike; insider audience bookmarks and DMs.
- "Conference Lurker" — profile viewers from posts spike; networking-mode active.

Step 2: pick multipliers tailored to the archetype. Stay within these ranges and vary naturalistically (avoid round multiples of 10):
- impressions: 30-90
- membersReached: 25-75
- profileViewers: 6-25
- followersGained: 3-16
- searchAppearances: 12-45
- saves: 10-32
- sends: 8-26

Step 3: write ONE short sentence (max 14 words) explaining why these multipliers fit the voice.

Return ONLY this JSON object, no markdown fence, no prose, no preamble:
{"voice": "<archetype name>", "reasoning": "<sentence>", "multipliers": {"impressions": <int>, "membersReached": <int>, "profileViewers": <int>, "followersGained": <int>, "searchAppearances": <int>, "saves": <int>, "sends": <int>}}`;

// AQ.-prefixed keys are Vertex AI Express Mode keys (Google Cloud Agent
// Platform); AIza-prefixed keys are AI Studio / Generative Language API.
// Different host + path + auth-header for each.
function geminiEndpoint(key, model) {
  if (/^AQ\./.test(key)) {
    return {
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      flavor: "vertex-express",
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    flavor: "ai-studio",
  };
}

async function callGeminiForDecisions() {
  const cfg = window.MATHIFY_CONFIG || {};
  const key = cfg.GEMINI_API_KEY;
  if (!key || key === "PASTE_YOUR_KEY_HERE") {
    throw new Error("no-key");
  }
  const model = cfg.GEMINI_MODEL || "gemini-2.5-flash";
  const ep = geminiEndpoint(key, model);
  console.log(`[mathify] gemini call: ${ep.flavor} → ${model}`);
  const res = await fetch(ep.url, {
    method: "POST",
    headers: ep.headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: AI_PROMPT }] }],
      generationConfig: { temperature: 1.1, maxOutputTokens: 512 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "";
  if (!text) throw new Error("gemini: empty response");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.multipliers || typeof parsed.multipliers !== "object") throw new Error("missing multipliers");
  const required = ["impressions", "membersReached", "profileViewers", "followersGained", "searchAppearances", "saves", "sends"];
  for (const k of required) {
    const v = parsed.multipliers[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1) throw new Error(`bad value for ${k}`);
    parsed.multipliers[k] = Math.round(v);
  }
  if (typeof parsed.voice !== "string" || !parsed.voice) parsed.voice = "Unnamed Voice";
  if (typeof parsed.reasoning !== "string" || !parsed.reasoning) parsed.reasoning = "Gemini's choice.";
  return parsed;
}

async function activateAI() {
  els.presetAI.classList.add("thinking");
  els.presetAI.classList.add("selected");
  els.aiStatus.textContent = "thinking…";
  els.aiVoice.textContent = "";
  els.aiDetail.textContent = "gemini is choosing your brand voice";
  els.aiSource.textContent = "";
  els.aiSource.className = "preset-ai-source";
  els.presets.forEach((p) => {
    if (p.dataset.mult === "ai") return;
    p.classList.remove("selected");
  });

  let result;
  let source;
  let errorMessage = null;
  try {
    result = await callGeminiForDecisions();
    source = "live";
  } catch (e) {
    console.warn("[mathify] AI Decides fallback:", e.message);
    errorMessage = e.message;
    result = fallbackProfile();
    if (e.message === "no-key") source = "fallback";
    else if (/\b401\b|\b403\b|UNAUTHENTICATED|PERMISSION_DENIED/.test(e.message)) source = "fallback";
    else source = "error";
  }

  chrome.storage.local.set(
    {
      preset: "ai",
      aiDecisions: result.multipliers,
      aiVoice: result.voice,
      aiReasoning: result.reasoning,
      aiSource: source,
      aiError: errorMessage,
    },
    () => {
      selectAI(result.multipliers, result.voice, result.reasoning, source, errorMessage);
      broadcastAndReload();
    }
  );
}

els.enabled.addEventListener("change", () => {
  setPowerLabel(els.enabled.checked);
  chrome.storage.local.set({ enabled: els.enabled.checked }, broadcastAndReload);
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
    chrome.storage.local.set({ multiplier: v, preset: null }, broadcastAndReload);
    selectPreset(v);
  });
});

els.presetAI.addEventListener("click", activateAI);

els.injectViewers.addEventListener("change", () => {
  chrome.storage.local.set({ injectViewers: els.injectViewers.checked }, broadcast);
});

document.addEventListener("DOMContentLoaded", load);
