# WORKLOG — 2026-10-06: the /ai numpad → Jarvis tour call (LIVE)

## What shipped today (all verified on production)

- **Numpad on repeater.com.au/ai**: `POST /api/ai-demo-call` + `public/assets/numpad.js`
  (test: `tests/ai-demo-call.test.mjs`, 30 assertions). Call rings within seconds of OK.
- **Jarvis tour mode** on the VPS voice stack (`/opt/hermes-voice/agi/`):
  `TOUR_PROMPT` persona (Repeater walkthrough, role-play offer, canon prices only,
  12-turn cap), `mode=tour` via spool `pending_mode`, CallerID "Repeater".
- **TTS = OpenAI gpt-4o-mini-tts** (voice from `OPENAI_TTS_VOICE`, default onyx);
  edge-tts kept as failure-only fallback.
- **Security**: `/call` was UNAUTHENTICATED on 0.0.0.0:8000 (bots were probing).
  Now: loopback-with-no-proxy-headers = Leo's scripts (full power); everything
  else (tunnel or direct internet) = `X-Jarvis-Token` (`JARVIS_CALL_TOKEN` in
  /opt/hermes-voice/.env == the repeater Pages secret) AND hard-limited to the
  fixed tour script at a validated AU number.
- **Routing**: CF Pages egress 403s plain-HTTP IP fetches (packets never leave
  the edge — tcpdump-verified). The trigger rides the tunnel instead:
  `calls.repeater.com.au` → cloudflared ingress → localhost:8000. DNS CNAME by
  Leo (repeater zone), ingress + no-Access by Hermes.
- **Spam guards / credit burn caps** (D1 `rate_limits` in the aphelion DB):
  2/number/day, 5/IP/day, 40/global/day; failed/no-answer triggers auto-refund
  the number cap. Re-test a number: DELETE `rate_limits` WHERE key LIKE 'aicall:%'
  on dbid 3f6d51f8-7b13-437b-aedb-5af019b62901.

## End-to-end proof (14:49 UTC)

`{number:0490038313}` → `{"ok":true,"calling":true,"answered":true}`;
AGI log shows mode=tour, class=external, originate answered,
`api.openai.com/v1/audio/speech 200 OK`; call_requests row id 8 (dialled/answered).

## Cost math (worst case)

Answered tour call ≈ Crazytel $0.05/min + OpenAI TTS ≈ $0.015/min → ~25-35c for
a 3-5 min call. Absolute daily worst with every guard maxed (spam): 40 calls ≈
$8-10. Normal lead volume: a few dollars a week. Brain = qwen token plan (flat);
STT = local whisper (free). To tighten: the 40 is one constant in
functions/api/ai-demo-call.js.

## What's deliberately NOT done here (qwen's job)

The shop-style restructure of `/` and `/phones` + wording pass per
`docs/PROMPT-6-shop-rebuild.md`, using `docs/ui-example/` as the layout
reference and `docs/VOICE.md` as the wording constitution. The numpad
markup/endpoint contract must survive that build unchanged.

## Update 15:1x UTC — the tour went Realtime... and came back (final state)

Leo's overnight asks: OpenAI voice not edge; Aussie accent; g'day-mate-smoko
register; use the OpenAI Realtime bridge; Ripple voice.

- TTS: **OpenAI gpt-4o-mini-tts primary** with an Australian-male instructions
  directive (handler.py `TTS_INSTRUCTIONS`); edge-tts = failure fallback only.
- Register: TOUR_OPENING + TOUR_PROMPT rewritten to the Aussie receptionist
  ("G'day mate, Jarvis here — Repeater's AI call assistant... up a ladder, in
  a crawl space, or on smoko. Knock yourself out."); VOICE.md updated to match.
- **Realtime bridge: built, tested, DORMANT.** fsr webhook now has a `tour`
  persona (From==To==0485811850 marker; live arrivals → gpt-live-1 + ripple,
  realtime arrivals → shop config; mcp.js mode=tour serves ONLY end_call +
  web_search). The VPS [outbound-tour] dialplan + mode=tour_bridge bridge the
  answered leg to that DID. The self-test PROVED the carrier limitation: our
  own trunk → own DID does NOT traverse Crazytel's AI Bridge (no webhook
  event; recording held only "Hello?"). So production tours run on the AGI
  loop (verified connected twice, Leo picked up at 14:49 and 15:14 UTC).
  Retest path when the carrier question is settled: `mode=tour_bridge`.
- Live-vs-Realtime (for the pricing decision): gpt-live-1 $0.05/min flat
  (backend tokens extra; ripple; no MCP), gpt-realtime-2.1 ~$0.06-0.10/min
  (audio $32/$64 per M tokens; mini $10/$20; full MCP).
- Leo's spare OpenAI key: OPENAI_API_KEY_SPARE in /opt/hermes-voice/.env
  (past in chat — rotate before real traffic matters).

## Update Oct 7 — tours are REALTIME now (the beep is gone for good)

- GPT-Live outbound (org flag) → 403 outbound_sip_not_enabled; parked as mode=tour_live.
- **The realtime bridge WORKS without the org flag**: Asterisk INVITEs
  `sip:proj_...@sip.api.openai.com:5061;transport=tls` directly (self-serve
  inbound per docs), SDES-SRTP. Two hard bugs found and fixed on the way:
  1. OpenAI refuses DTLS-SRTP offers (answers plain, no handshake, faint
     static/nothing) — `media_encryption=sdes` fixed it; audio verified
     flowing from Azure media hosts.
  2. SIP tag digits forged a fake AU number ("0876920545") out of the To
     header — webhook now parses addresses from inside `<...>` only
     (addressOf); also closed an allowlist-spoofing hole.
- Tour persona accepts gpt-realtime-2.1-mini + ash (mode=tour marker = the
  Repeater DID as From with a non-AU To). Sideband greets instantly. Live
  arrivals would get gpt-live-1 + ripple ($0.05/min) when that path exists.
- Production verified end-to-end through the real numpad path: POST
  /api/ai-demo-call → answered, voice_calls persona=tour api=realtime.
- The AGI-loop beep is removed too (RECORD FILE no longer takes the beep arg).
- FSR suites: 119 voice checks green. Asterisk image rebuilt with the OpenAI
  TLS/SDES endpoint; sipguard.sh gained an OpenAI-media ACCEPT (RTP range).
