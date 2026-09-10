# Research: Voice STT/TTS (Phase 3+)

Still out of scope to build — this is an architecture audit (2026-09-10,
requested ahead of any Phase 3 scoping) of whether the *existing* command
layer stays clean and provider-agnostic when voice eventually lands, not
a decision to start voice work now.

## What actually references "voice" in the codebase today

A full-repo search (`grep -rn "voice" apps packages`, excluding
`dist/`) turns up exactly four places, all in `apps/controller/src`:

1. `packages/protocol/src/event.ts` — `EVENT_SOURCES` includes `"voice"`
   as one valid value of `DomainEvent.source`. A data tag only; no code
   anywhere branches on `source === "voice"`.
2. `domain/command/intent-resolver.ts` — a docstring naming voice as an
   example caller. The interface itself,
   `IntentResolver.resolve(input: string): Promise<Command | null>`,
   has no voice-specific types, imports, or fields.
3. `domain/command/types.ts` — a docstring, same as above. The `Command`
   union has no voice-specific variant or field.
4. `domain/notification/service.ts` / `adapters/notification/
   console-notification-service.ts` — docstrings citing voice as a
   future `NotificationService` implementation, same reasoning ADR-002
   already established for Bordio.

**No `IntentResolver` implementation exists anywhere** (confirmed:
`grep -rn "IntentResolver"` outside its own definition file turns up
nothing but doc-comment references — zero classes implement it, matching
ADR-005's explicit "no LLM-backed implementation ships in Phase 1," and
it stayed untouched through all of Phase 2). **No `SttProvider`/
`TtsProvider`/`VoiceProvider` interface exists at all** — voice hasn't
been designed at the provider level yet, only named as a future
`IntentResolver`/`CommandRouter` caller.

## Coupling audit: is the command layer actually clean?

**Verdict: yes, and it's now proven, not just designed.** `CommandRouter`
(`domain/command/router.ts`) is consumed by exactly two independent
sources today:
- `api/http/sessions.ts` — the mobile/REST path (page12/page20).
- `domain/bordio/inbound-poller.ts` — the Bordio path (pageB4), added
  in Phase 2 with **zero changes to `CommandRouter`, `Command`, or
  anything in `domain/session`/`domain/task`**.

`CommandRouter.dispatch()` only knows about `SessionRegistry`/
`TaskRegistry`'s existing public methods — it has no knowledge of REST,
Bordio, or (when it lands) voice. A third `Command` producer plugs in
the same way pageB4 just did: build a `Command`, call `.dispatch()`.
This isn't theoretical — pageB4 is the concrete evidence the pattern
holds under a real, independent, non-mobile caller.

`IntentResolver.resolve(input: string)` takes a **plain string** —
already provider-agnostic by construction. Whatever STT engine produces
that string (cloud API, on-device model, whatever), it's just text by
the time it reaches this interface; no STT-specific type could leak into
`IntentResolver`/`Command`/`CommandRouter` without someone actively
choosing to put it there.

## What "swap STT/TTS providers without touching core logic" actually requires

Nothing at the `CommandRouter`/`SessionRegistry`/`TaskRegistry` layer —
those are already provider-blind by design and by pageB4's precedent.
The part that doesn't exist yet, and needs designing *when* Phase 3
starts, is the layer above `IntentResolver` (audio in) and beside
`NotificationService` (audio out):

- **STT**: a new `domain/voice/stt-provider.ts` interface —
  `SttProvider.transcribe(audio): Promise<string>` — whose output feeds
  directly into the existing `IntentResolver.resolve(text)`. Zero
  changes needed to `IntentResolver`/`Command`/`CommandRouter` to add
  this; a Puter/Hugging Face/local-Whisper implementation is a new
  `adapters/voice/{puter,huggingface,local-whisper}-stt.ts`, mirroring
  `domain/bordio/client.ts` + `adapters/bordio/*.ts`'s port/adapter
  split exactly.
- **TTS**: a new `VoiceNotificationService implements NotificationService`
  (same interface page19 built, same pattern `BordioNotificationService`
  already proved works for a completely different output channel) —
  its `notify()` calls whatever `TtsProvider.synthesize(text): Promise<Buffer>`
  is configured. Zero changes needed to `NotificationService` or
  `wireNotifications` — pageB3 is the concrete precedent.
- Both provider interfaces would be swappable the same way
  `BordioClient`/`FakeBordioClient` already are: fake-before-real, one
  interface, N implementations, none of which the core controller ever
  imports directly (only `lifecycle.ts`'s wiring layer would construct
  the concrete provider, exactly like it does for `BordioApiClient`
  today, gated behind its own env var, off by default).

## The one thing to actively avoid when Phase 3 actually starts

Nothing in the current codebase does this, but it's the concrete failure
mode worth naming: putting a provider-specific shape (a Puter response
object, a Hugging Face model-specific field, raw audio bytes) directly
into `Command`, `IntentResolver`, or `NotificationService` instead of
translating it to the existing plain-string/plain-`Notification`
boundary first. `BordioApiError`/`BordioTask` never leak past
`adapters/bordio/*.ts` into `domain/command`/`domain/notification` today
— that's the discipline to repeat for STT/TTS providers, not a new
pattern to invent.

## Still genuinely unresearched (unchanged from the original stub)

Real provider comparison — on-device vs. cloud STT/TTS, Puter/Hugging
Face/local-Whisper specifics (API shape, latency, cost, offline
capability), wake-word handling, and `research/android-background.md`'s
mobile-side background/mic constraints (a separate, `apps/mobile`-side
concern, orthogonal to controller-side provider swapping — the
controller only ever sees text in / `Notification` out regardless of
how the mobile app captures audio). None of that was in scope for this
architecture audit and still needs real research before Phase 3 design
begins.
