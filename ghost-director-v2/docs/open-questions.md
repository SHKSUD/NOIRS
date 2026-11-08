# Open questions

Record decisions here instead of guessing. Move an item to **Decided** with the date and reason once it is settled.

## Open

1. **Which video model?** Candidates: Google Veo (v1 used `veo-3.0-fast-generate-001`), Kling, Wan, Runway, Luma via fal.ai. Criteria: image-to-video from a storyboard frame, character consistency, max clip length, API availability in India, price.
2. **Cost per finished minute?** Needs the chosen model's per-second price, an expected re-render rate per shot (how many tries before a shot is kept), and image-generation cost for storyboard frames. Target price must fit the ₹499 creator tier.
3. **English-first or Hindi/regional voices?** Affects the LLM prompt (dialogue language), TTS/voice provider, and whether multi-language voice moves into scope later. MVP assumption: English-first; dialogue text may be in any language.
4. **Which LLM for script breakdown?** Default assumption: Claude (latest Sonnet). Mocked for Milestone 1.
5. **Character reference source** (Milestone 2): uploaded photo, generated portrait, or both? How is the reference "locked" across shots — same seed, reference-image conditioning, or both?
6. **Storage for images and video** (Milestone 2+): local disk for dev; S3/Supabase/R2 for production?
7. **Relationship to v1 app** (`app/`): replace it, or run side by side until v2 reaches parity?

## Decided

- _(none yet)_
