// lib/gemini.js
// One job: produce private, unverifiable, vaguely flattering content for
// surfaces only the user can see. Cached aggressively in chrome.storage.local
// after the first successful call. Falls back to a hard-coded array if the
// network/key fails — the bit still lands.
(function () {
  if (window.__mathifyGeminiLoaded) return;
  window.__mathifyGeminiLoaded = true;

  const VIEWERS_PROMPT = `Generate 12 fake LinkedIn profile viewers for a private "Who viewed your profile" list. Rules:

1. Each viewer must feel impressive enough to flatter a thought-leader-aspiring user, but generic enough that they would never bother to Google the name and discover the person doesn't exist.
2. Mix titles: VC partners, Director of Strategy, Head of Growth, Head of Product, AI startup founders, ex-Google PMs, Principal Engineers, Chief of Staff.
3. Companies: real, mid-tier-impressive (Stripe, Notion, Anthropic, Linear, Greylock, Sequoia, a16z, Vercel, Scale AI, Ramp, Figma, Brex, Mercury, Plaid, OpenAI, Hugging Face). Avoid Big Tech CEOs and household-famous VCs.
4. Names should be plausible across demographics. Vary cultural backgrounds naturally.
5. Headlines should be 5-12 words. Vaguely buzzword-laden but not parody. They should sound like real LinkedIn headlines.

Return ONLY a JSON array of 12 objects, no prose, no markdown fence, no explanation:
[{"name": "Full Name", "headline": "Title at Company"}]`;

  const INSIGHTS_PROMPT = `Generate one short LinkedIn-style AI-insights sentence for a private dashboard tile, framed as a flattering observation about the user's recent posting performance. 8-14 words. Insufferable thought-leader-coded but believable. Do not use the word "synergy" or "leverage". Return only the sentence with no quotes, no prose, no preamble.

Examples (do not copy verbatim):
Members are responding to your tone of vulnerability.
Your authenticity is outperforming your last 30 days by a notable margin.
Posts featuring first-person reflection are driving the strongest engagement.`;

  const FALLBACK_VIEWERS = [
    { name: "Priya Krishnan", headline: "Director of Strategy at Stripe" },
    { name: "Marcus Hale", headline: "Partner at Greylock Partners" },
    { name: "Aisha Patel", headline: "Head of Growth at Linear" },
    { name: "Daniel Okafor", headline: "Principal PM at Anthropic" },
    { name: "Sofia Reyes", headline: "Chief of Staff at Notion" },
    { name: "Jonas Lindqvist", headline: "Founder & CEO at stealth AI startup" },
    { name: "Hannah Cho", headline: "Investor at a16z" },
    { name: "Rohan Iyer", headline: "Ex-Google PM, advising early-stage founders" },
    { name: "Maya Goldberg", headline: "Head of Product at Vercel" },
    { name: "Tomás Ribeiro", headline: "Engineering Lead at Scale AI" },
    { name: "Elena Volkova", headline: "Partner at Sequoia Capital" },
    { name: "Ahmed Farouk", headline: "Director of Operations at Ramp" },
  ];

  const FALLBACK_INSIGHTS = [
    "Members are responding to your tone of vulnerability.",
    "Your authenticity is outperforming your last 30 days.",
    "Posts featuring first-person reflection are driving the strongest engagement.",
    "Your audience is leaning into your contrarian takes this week.",
    "Long-form posts are converting at a higher rate than your usual cadence.",
  ];

  function getKey() {
    const cfg = window.MATHIFY_CONFIG || {};
    const key = cfg.GEMINI_API_KEY;
    if (!key || key === "PASTE_YOUR_KEY_HERE") return null;
    return key;
  }

  function getModel() {
    return (window.MATHIFY_CONFIG && window.MATHIFY_CONFIG.GEMINI_MODEL) || "gemini-2.5-flash";
  }

  function geminiEndpoint(key, model) {
    if (/^AQ\./.test(key)) {
      return {
        url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      };
    }
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    };
  }

  async function callGemini(prompt) {
    const key = getKey();
    if (!key) throw new Error("no-key");
    const ep = geminiEndpoint(key, getModel());
    const res = await fetch(ep.url, {
      method: "POST",
      headers: ep.headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`gemini ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "";
    if (!text) throw new Error("gemini: empty response");
    return text;
  }

  function stripFence(s) {
    return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  async function fetchFakeViewers() {
    try {
      const raw = await callGemini(VIEWERS_PROMPT);
      const parsed = JSON.parse(stripFence(raw));
      if (!Array.isArray(parsed) || parsed.length < 6) throw new Error("bad shape");
      return parsed
        .filter((v) => v && typeof v.name === "string" && typeof v.headline === "string")
        .slice(0, 12);
    } catch (e) {
      console.warn("[mathify] gemini viewers fallback:", e.message);
      return FALLBACK_VIEWERS;
    }
  }

  async function fetchInsightsLine() {
    try {
      const raw = await callGemini(INSIGHTS_PROMPT);
      const line = stripFence(raw).split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
      if (line.length < 8 || line.length > 200) throw new Error("bad length");
      return line.replace(/^["'`]|["'`]$/g, "");
    } catch (e) {
      console.warn("[mathify] gemini insights fallback:", e.message);
      return FALLBACK_INSIGHTS[Math.floor(Math.random() * FALLBACK_INSIGHTS.length)];
    }
  }

  async function getFakeViewers() {
    const cached = await new Promise((r) =>
      chrome.storage.local.get({ fakeViewers: null, fakeViewersAt: 0 }, r)
    );
    // Cache for 24h to avoid burning tokens; refresh on a fresh build.
    if (cached.fakeViewers && Date.now() - cached.fakeViewersAt < 24 * 3600 * 1000) {
      return cached.fakeViewers;
    }
    const list = await fetchFakeViewers();
    chrome.storage.local.set({ fakeViewers: list, fakeViewersAt: Date.now() });
    return list;
  }

  async function getInsightsLine() {
    const cached = await new Promise((r) =>
      chrome.storage.local.get({ insightsLine: null, insightsAt: 0 }, r)
    );
    if (cached.insightsLine && Date.now() - cached.insightsAt < 6 * 3600 * 1000) {
      return cached.insightsLine;
    }
    const line = await fetchInsightsLine();
    chrome.storage.local.set({ insightsLine: line, insightsAt: Date.now() });
    return line;
  }

  async function refresh() {
    const [v, i] = await Promise.all([fetchFakeViewers(), fetchInsightsLine()]);
    chrome.storage.local.set({
      fakeViewers: v,
      fakeViewersAt: Date.now(),
      insightsLine: i,
      insightsAt: Date.now(),
    });
    return { viewers: v, insights: i };
  }

  window.__mathifyGemini = {
    getFakeViewers,
    getInsightsLine,
    refresh,
    FALLBACK_VIEWERS,
    FALLBACK_INSIGHTS,
  };

  console.log("[mathify] gemini.js loaded");
})();
