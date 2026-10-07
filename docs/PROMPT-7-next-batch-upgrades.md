# PROMPT-7 — next batch of upgrades (site copy + proof features)

Status: SKELETON — parts marked `[HERMES]` are voice-stack work landing
separately; the site copy in §1 is ready for qwen to execute now. The
competitor intel comes from live test-calls against Johnni AI and Vareo
(recordings + transcripts, Oct 2026).

## 0. Sync and rules

Same as PROMPT-6: `git fetch && git pull --ff-only origin main`, `npm test`
green before starting, VOICE.md governs all wording, canon prices are never
re-derived, `functions/api/ai-demo-call.js` + `numpad.js` contract untouched.

## 1. /ai page copy — the two new product claims (DO NOW)

The AI receptionist captures **every call, 24 hours a day** and **notifies the
owner of urgent calls straight away**. Both are true platform behaviours
(24/7 answering; urgent-call push/text). Weave them in — do not bolt on a new
section:

- Hero trust line gains: `<b>24/7</b> capture` and `<b>Urgent</b> calls ping you`.
- "What you actually get" becomes four cards (add one):
  **"Nothing slips, day or night"** — every call captured, 24 hours a day —
  nights, weekends, the job you're under a car for. And when a call is urgent,
  the owner's phone pings straight away — not an angry voicemail discovered
  tomorrow.
- The numpad lede gains one sentence: "It answers the same way at 2pm and 2am,
  and urgent calls ping the owner's phone immediately."
- FAQ gets one entry: **"What happens to urgent calls?"** — "You get notified
  on your phone the moment an urgent call lands — during the call, not the day
  after. Everything else waits for you in the call log."
- JSON-LD FAQPage mirrors the new Q&A exactly (they must not drift).

## 2. Single source of pricing truth (competitor lesson)

Vareo's agent quoted $450 setup while their site said $295 — a prospect caught
it live. Our rule, already enforced in the voice persona: the agent only
quotes figures written in its prompt; the site is the source of truth. Qwen
task: add a `tests/` assertion that the three OS price points appear in
EXACTLY one non-test source file (`facts.js` or the checkout config) and
everything else references it — so site and voice can never diverge.

## 3. Proof features (needs `[HERMES]` voice-stack work first — do not build yet)

These make the demo *show* rather than tell; each lands behind a flag:

- **Live "calls answered this week" counter on /ai** — fed from the voice
  platform's D1 (per-week answered count), cached 60s, hidden when zero.
  Real numbers, prices-on-the-page energy.
- **Demo-booking proof**: during the tour, the practice booking texts the
  prospect's own phone a sample job card ("this is what a booking looks like
  when Jarvis takes it"). `[HERMES]` adds a `demo_booking` tool to the tour's
  MCP toolset (mode=tour currently allows only end_call + web_search).
- **Per-trade landing pages** (plumber/electrician/salon/courier variants of
  /ai, each with its own numpad and trade-specific opener).

## 4. Finish

`npm test` green → commit → push → curl `/ai/` for the new copy. Report what
changed, what is verified, anything flagged.
