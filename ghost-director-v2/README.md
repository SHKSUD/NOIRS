# Ghost Director v2

Script → scenes → editable shot list. See `CLAUDE.md` for scope and `docs/open-questions.md` for open decisions.

## Run locally
```bash
npm install          # also runs prisma generate
npm run db:push      # creates prisma/dev.db
npm run dev          # http://localhost:3000  (add -- -p 3001 to change port)
```
No API key needed: the LLM and image model are mocked. To use real models, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`, and/or `IMAGE_PROVIDER=gemini` with `GEMINI_API_KEY`.

## Milestone 1 (done)
- Home: paste a script (or "Use sample script") → **Break down into shots**
- Shot list: every field autosaves per shot; scene headings/summaries are editable
- Script tab: edit and save the script (shots untouched) or explicitly re-run the breakdown

## Milestone 2 (done)
- Characters tab: upload a reference image per character (locked) and a style note
- Storyboard tab: one frame per shot; **Update N frames** only draws missing or out-of-date frames
- Shot list: each shot shows its frame; editing a shot marks only that frame out of date
