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
