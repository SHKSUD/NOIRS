# Ghost Director v2

Script → scenes → editable shot list. See `CLAUDE.md` for scope and `docs/open-questions.md` for open decisions.

## Run locally
```bash
npm install          # also runs prisma generate
npm run db:push      # creates prisma/dev.db
npm run dev          # http://localhost:3000  (add -- -p 3001 to change port)
npm test             # proves re-rendering one shot touches no other shot; checks assembly with real ffmpeg
```
No API key needed: the LLM and image model are mocked. To use real models, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`, and/or `IMAGE_PROVIDER=gemini` / `VIDEO_PROVIDER=omni` with `GEMINI_API_KEY` (billing enabled; a Gemini app subscription does not cover API use). Real image and video models cost money, so they are opt-in.

## Milestone 1 (done)
- Home: paste a script (or "Use sample script") → **Break down into shots**
- Shot list: every field autosaves per shot; scene headings/summaries are editable
- Script tab: edit and save the script (shots untouched) or explicitly re-run the breakdown

## Milestone 2 (done)
- Characters tab: create characters; upload a reference image per character (locked) and a style note
- Storyboard tab: one frame per shot; **Update N frames** only draws missing or out-of-date frames
- Shot list: each shot shows its frame; editing a shot marks only that frame out of date

## Milestone 3 (done)
- Render tab: one clip per shot (mock = animated preview of the frame with camera move, subtitle and timing)
- **Update N clips** renders only missing or out-of-date clips; a shot with an out-of-date frame must update its frame first
- Shot list shows each shot's clip status; editing a shot marks only that shot out of date

## Milestone 4 (done)
- Export tab: shots in scene order, with skipped shots flagged (not rendered / clip out of date / still rendering)
- **Assemble cut** joins up-to-date clips into one MP4 (ffmpeg-static); play it in the page and **Download MP4**
- With mock clips, each shot appears as a title card for its duration; real Veo clips go in as video

## Real video: Gemini Omni Flash
1. Get a Gemini API key with billing enabled (aistudio.google.com).
2. Remove any old `GEMINI_API_KEY` from your Windows environment variables. Next.js gives it priority over `.env.local`.
3. In `.env.local`: `GEMINI_API_KEY=...`, `IMAGE_PROVIDER=gemini`, `VIDEO_PROVIDER=omni`.
4. Render tab, set Quality to Draft (360p, ~$0.023/s) while iterating, Final (720p, ~$0.07/s) for the cut. Every paid render asks first and shows an estimate.
