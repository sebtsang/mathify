# Mathify

A Chrome extension that only lies about the numbers nobody else can see.

The amateur version of a tool like this multiplies everything: followers, reactions, comments. The amateur version gets caught the moment a viewer opens LinkedIn on their phone and disproves it. Mathify is the professional version. It only edits the LinkedIn metrics that LinkedIn shows to you and you alone:

- Post analytics (impressions, members reached, profile viewers from this post, followers gained, saves, sends)
- Profile dashboard tiles (search appearances, post impressions over time)
- "Who viewed your profile" total

Public follower counts, public reaction, comment, and repost counts on posts, and badges are never touched.

The numbers persist across page refresh and SPA navigation. That is the part most amateur lie tools fail at.

## Multiplier presets

- **Math Mode (1.5x).** Just enough to be plausible.
- **Subtle Flex (10x).** For when you need it on a call.
- **Thought Leader (100x).** You write "thoughts" now.
- **Definitely Lying (1000x).** Committed to the bit.
- **AI Decides.** Gemini picks a brand voice and a multiplier set, calibrated to plausibility.

## Install (unpacked)

1. `git clone https://github.com/sebtsang/mathify`
2. `chrome://extensions` then Developer mode on, then Load unpacked, then select this directory
3. Open LinkedIn. Open the popup. Pick a multiplier preset.

## How it works

A Manifest V3 content script runs a `MutationObserver` on `document.body`, debounced via `requestAnimationFrame`. On each tick, a `TreeWalker` walks text nodes inside an allowlist of private-analytics surfaces and rewrites numbers near analytics keywords (`impressions`, `members reached`, `profile viewers`, `search appearances`) at the configured multiplier. A separate blocklist covers public-mirror metrics (reactions, comments, reposts, follower count) so they are never touched.

For SPA navigation, Mathify injects a script into the page's main world that overrides `history.pushState` and `history.replaceState` to force a full page load via `location.assign`. A capture-phase click interceptor catches in-app anchor clicks before LinkedIn's router sees them. The trade-off is a slower nav, the benefit is rock-solid inflation across the entire site.

The **AI Decides** preset calls Google's Gemini 3.1 Flash Lite via REST. The model picks a brand voice and a multiplier set per metric, returning structured JSON. A model fallback chain (3.1 Flash Lite, 2.5 Flash Lite, 2.5 Flash, 2.0 Flash) handles rate limits.

## Built for

The Google x GitCloud AI Mini-Hackathon, May 1 2026, Toronto. Built in one night.

## Powered by

Google Gemini 3.1 Flash Lite, Chrome Extensions Manifest V3, vanilla JavaScript, MutationObserver, restraint.

---

In memory of the ones who got caught manually.
