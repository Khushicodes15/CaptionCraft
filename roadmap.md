# CaptionCraft roadmap

## Milestone 1 — core flow (in progress)

- [x] Cloud backend + projects table with row-level security
- [ ] Email + Google sign-in
- [ ] Video upload to storage, duration/resolution read
- [ ] Browser audio extraction (16kHz mono), chunked under 25MB
- [ ] Transcription via Groq whisper-large-v3 (word timestamps), turbo fallback, Hinglish prompt bias, 429 backoff
- [ ] Devanagari -> Roman cleanup for Hinglish
- [ ] Remotion composition + Player preview
- [ ] 4 styles: Elegant Script, Social #3, Business #3, Retro #1
- [ ] SRT / VTT / JSON export
- [ ] Emphasis detection via Groq llama-3.3-70b-versatile + local heuristic fallback

## Later milestones

- Full editor (drag/resize, transcript editing, properties panel)
- Remaining 30 style presets by category
- MP4 burn-in + transparent WebM export
- Content Aware engine (MediaPipe face safe zone, behind-subject)

## Blocked

- GROQ_API_KEY needed from user (free at console.groq.com)
