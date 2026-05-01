# Mathify

A Chrome extension that only lies about the numbers nobody else can see.

The amateur version of a tool like this multiplies everything — followers, reactions, comments. The amateur version gets caught the moment a viewer opens LinkedIn on their phone and disproves it. Mathify is the professional version. It only edits the LinkedIn metrics that LinkedIn shows to you and you alone:

- Post analytics (impressions, members reached, profile viewers from this post, followers gained, saves, sends)
- Profile dashboard tiles (search appearances, post impressions over time)
- "Who viewed your profile" — replaced with Gemini-generated impressive fakes calibrated to be flattering enough to feel real and generic enough that you'd never bother to Google them
- A Gemini-generated AI Insights line on your private dashboard

Public follower counts, public reaction/comment/repost counts, badges — untouched.

The numbers persist across page refresh and SPA navigation. That's the part most amateur lie tools fail at.

## Install (unpacked)

1. `git clone https://github.com/sebtsang/mathify`
2. `chrome://extensions` → Developer mode on → Load unpacked → select this directory
3. Open LinkedIn. Open the popup. Pick a multiplier preset.

## Built for

The Google × GitCloud AI Mini-Hackathon, May 1 2026, Toronto. Built in one night.

## Powered by

Google Gemini 2.5 Flash, Chrome Extensions Manifest V3, vanilla JavaScript, MutationObserver, restraint.

---

In memory of the ones who got caught manually.
