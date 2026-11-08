# Ghost Director v2

Turns a script into a controllable short film. Unlike one-shot script-to-video tools (e.g. Spira Maxima), the creator can edit the script, storyboard and shot list, and re-render a single shot without redoing the film.

**The one claim the MVP must prove:** a creator can fix one shot without redoing the rest.

## MVP scope
- Script -> scenes -> shot list, every field editable
- Storyboard frames with a locked character reference
- Per-shot render and re-render via an existing video model (no model training)
- Simple assemble-and-export of the final cut

## Out of scope (do not build)
Custom AI clones, music generation, a full cinema-reference library, multi-language voice.

## Data model
Project -> Scene -> Shot. A Shot holds: description, camera, framing, mood, duration, character refs, storyboard image, render status, render output. A Character holds a reference image and a style note shared across shots.

## Stack
Next.js (App Router) + TypeScript + Tailwind; SQLite via Prisma; model calls behind a provider interface in `lib/providers/` so the LLM and video model can be swapped. Keys go in `.env.local` and are never committed.

## Rules
- Keep rendering per-shot and idempotent: re-rendering one shot must not touch others.
- Ask before adding a dependency or expanding beyond the MVP scope.
- Record open questions in `docs/open-questions.md` rather than guessing.

## Milestones
1. **Done when:** scaffold + data model; script page splits a script into scenes and shots via the LLM provider; shot list page edits and saves every field; mock LLM so it runs without keys.
2. Storyboard frames with a locked character reference.
3. Per-shot render / re-render.
4. Assemble and export.
