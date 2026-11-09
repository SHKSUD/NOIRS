# Open questions

Record decisions here instead of guessing. Move an item to **Decided** with the date and reason once it is settled.

## Open

1. **Which video model?** Candidates: Google Veo (v1 used `veo-3.0-fast-generate-001`), Kling, Wan, Runway, Luma via fal.ai. Criteria: image-to-video from a storyboard frame, character consistency, max clip length, API availability in India, price.
   - **2026-11-09 finding:** Google's Gemini API docs say its Veo models (`veo-3.1-*-preview`) were shut down on 2026-10-22, so `lib/providers/veo-video.ts` (Gemini API, `predictLongRunning`) targets a retired endpoint and needs replacing before any real render. The Gemini API's current video model is **Gemini Omni Flash** (`gemini-omni-1.2-flash`, `POST /v1beta/interactions`, 3–15 s, native audio, 16:9 or 9:16). **Veo 3.1** remains available on Google's enterprise platform (Vertex AI) and through resellers such as fal.ai. Third-party sites report about $0.40/s for Veo 3.1 at 720p with audio (unverified with Google), so a 40 s cut costs about $16 per full render.
2. **Cost per finished minute?** Needs the chosen model's per-second price, an expected re-render rate per shot (how many tries before a shot is kept), and image-generation cost for storyboard frames. Target price must fit the ₹499 creator tier.
3. **English-first or Hindi/regional voices?** Affects the LLM prompt (dialogue language), TTS/voice provider, and whether multi-language voice moves into scope later. MVP assumption: English-first; dialogue text may be in any language.
4. **Which LLM for script breakdown?** Default assumption: Claude (latest Sonnet). Mocked for Milestone 1.
5. **Generated reference portraits?** Milestone 2 locks an uploaded image. Should creators also be able to generate a portrait from the style note, and then lock it?
6. **Storage for images and video:** Milestone 2 writes to local `storage/`. Production needs S3, Supabase Storage or R2.
7. **Auth and multi-user for v2?** Milestone 1 is single-user and local: there is no login and the save actions do not check ownership. v1 already has Supabase Google login; decide whether v2 reuses it before any deploy.
8. **Upgrade to Prisma 7?** Prisma 7 needs a driver-adapter package plus a native SQLite module, so v2 uses Prisma 6.19.3 (built-in SQLite). npm audit flags `deepmerge-ts` inside the Prisma CLI (dev-only, not shipped); the fix requires Prisma 7.
9. **Relationship to v1 app** (`app/`): replace it, or run side by side until v2 reaches parity?
10. **Which image model for real frames?** The Gemini provider is written but untested (no key). Compare Gemini image, Flux Kontext and Ideogram character reference on consistency and price per frame.
11. **Veo clip length vs shot duration.** Assembly now holds or trims each clip to the shot's duration, so an 8 s Veo clip in a 3 s shot loses 5 s of paid video. Ask the model for the shot's duration where supported, or round shot durations to the model's lengths?
12. **Assembly as a background job.** Assembling runs inside the request (about 1.3 s per shot locally with title cards). Long films and serverless time/size limits (the ffmpeg binary is about 80 MB) will need a background worker. Where will this run in production?

## Decided

- 2026-11-09: **ffmpeg via ffmpeg-static 5.3.0** (approved), kept out of the Next.js bundle. Unrendered or out-of-date shots are skipped and flagged rather than filled with a slate. Mock clips become title cards in the cut.
- 2026-11-09: `/files` supports HTTP range requests, so the cut and clips can be seeked.

- 2026-11-09: Renders start from the shot's storyboard frame and are refused while the frame is out of date. Paid video is opt-in (`VIDEO_PROVIDER=veo`); the default mock produces an animated SVG preview, not an MP4.
- 2026-11-09: Tests use Node's built-in runner (`node:test`), so no test framework dependency was added.

- 2026-11-09: **Locked reference = one uploaded image per character** (PNG/JPEG/WebP, max 2 MB, type checked from the file bytes) plus a style note. Every frame featuring that character passes both to the image model. Replacing it marks only that character's shots out of date.
- 2026-11-09: Paid image generation is opt-in (`IMAGE_PROVIDER=gemini`); the default is the free mock.

- 2026-11-08: Stack pinned to Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3 (TS 7 is a new native compiler; Next tooling targets 5.x), Tailwind 4.3.5, Prisma 6.19.3 with SQLite at `prisma/dev.db`.
- 2026-11-08: The LLM defaults to the deterministic mock unless `ANTHROPIC_API_KEY` is set; force it with `LLM_PROVIDER=mock|anthropic`.
- 2026-11-08: "Save script" never changes shots. Only an explicit, confirmed "re-run breakdown" replaces them, which protects per-shot edits.
