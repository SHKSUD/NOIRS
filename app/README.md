# Ghost Director 🎬
Idea → script → AI shot list → hand-drawn storyboard → real AI frames (Gemini) → video clips (Google Veo) → animatic.

## Setup (once)
1. **Supabase** → SQL Editor → run `supabase/setup.sql` (creates `projects` table + public `clips` bucket).
2. **GitHub**: push this folder to your private repo `ghost-director`.
3. **Vercel** → Import repo → Environment Variables (copy names from `.env.example`):
   - `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Optional model overrides: `ANTHROPIC_MODEL`, `GEMINI_IMAGE_MODEL`, `VEO_MODEL` (if Google renames a model, change it here — no code change).
4. Deploy → open your URL.

## Local dev
`cp .env.example .env.local` → fill keys → `npm install` → `npm run dev` → http://localhost:3000

## Use
Generate storyboard → **🎬 Clip** on a panel (sketch → photoreal frame → Veo clip, 1–3 min) → or **🎬 Render film** for all → **▶ Play animatic** plays real clips.

## Notes
- Keys live only on the server (Vercel env). Never commit `.env.local`.
- Projects are saved per browser/device (no login yet).
- Veo costs money per second of video — test with 1 clip first and set a Google Cloud budget alert.
- Next round: fal.ai provider (Kling/Wan/Flux), login, FFmpeg MP4 export with audio.
