# Open questions

Record decisions here instead of guessing. Move an item to **Decided** with the date and reason once it is settled.

## Open

1. **Which video model?** Candidates: Google Veo (v1 used `veo-3.0-fast-generate-001`), Kling, Wan, Runway, Luma via fal.ai. Criteria: image-to-video from a storyboard frame, character consistency, max clip length, API availability in India, price.
2. **Cost per finished minute?** Needs the chosen model's per-second price, an expected re-render rate per shot (how many tries before a shot is kept), and image-generation cost for storyboard frames. Target price must fit the ₹499 creator tier.
3. **English-first or Hindi/regional voices?** Affects the LLM prompt (dialogue language), TTS/voice provider, and whether multi-language voice moves into scope later. MVP assumption: English-first; dialogue text may be in any language.
4. **Which LLM for script breakdown?** Default assumption: Claude (latest Sonnet). Mocked for Milestone 1.
5. **Generated reference portraits?** Milestone 2 locks an uploaded image. Should creators also be able to generate a portrait from the style note, and then lock it?
6. **Storage for images and video:** Milestone 2 writes to local `storage/`. Production needs S3, Supabase Storage or R2.
7. **Auth and multi-user for v2?** Milestone 1 is single-user and local: there is no login and the save actions do not check ownership. v1 already has Supabase Google login; decide whether v2 reuses it before any deploy.
8. **Upgrade to Prisma 7?** Prisma 7 needs a driver-adapter package plus a native SQLite module, so v2 uses Prisma 6.19.3 (built-in SQLite). npm audit flags `deepmerge-ts` inside the Prisma CLI (dev-only, not shipped); the fix requires Prisma 7.
9. **Relationship to v1 app** (`app/`): replace it, or run side by side until v2 reaches parity?
10. **Which image model for real frames?** The Gemini provider is written but untested (no key). Compare Gemini image, Flux Kontext and Ideogram character reference on consistency and price per frame.
11. **Veo clip length vs shot duration.** Veo returns fixed-length clips (about 8 s); shot durations are 2–6 s. Trim in assembly (Milestone 4), or request a duration where the model supports it?
12. **Serving video for seeking.** `/files` does not support HTTP range requests yet; long MP4s may not seek in some browsers. Fine for the MVP; production storage (Q6) would handle it.

## Decided

- 2026-11-09: Renders start from the shot's storyboard frame and are refused while the frame is out of date. Paid video is opt-in (`VIDEO_PROVIDER=veo`); the default mock produces an animated SVG preview, not an MP4.
- 2026-11-09: Tests use Node's built-in runner (`node:test`), so no test framework dependency was added.

- 2026-11-09: **Locked reference = one uploaded image per character** (PNG/JPEG/WebP, max 2 MB, type checked from the file bytes) plus a style note. Every frame featuring that character passes both to the image model. Replacing it marks only that character's shots out of date.
- 2026-11-09: Paid image generation is opt-in (`IMAGE_PROVIDER=gemini`); the default is the free mock.

- 2026-11-08: Stack pinned to Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3 (TS 7 is a new native compiler; Next tooling targets 5.x), Tailwind 4.3.5, Prisma 6.19.3 with SQLite at `prisma/dev.db`.
- 2026-11-08: The LLM defaults to the deterministic mock unless `ANTHROPIC_API_KEY` is set; force it with `LLM_PROVIDER=mock|anthropic`.
- 2026-11-08: "Save script" never changes shots. Only an explicit, confirmed "re-run breakdown" replaces them, which protects per-shot edits.
