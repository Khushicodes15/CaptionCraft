# CaptionCraft

> AI-powered video caption editor featuring dynamic typography styles, word-level forced alignment, interactive canvas editing, and person-aware 3D depth occlusion.

CaptionCraft (Caption Studio) is a full-stack video captioning and editing studio. It combines AI-driven speech transcription, word-level forced alignment, customizable typography presets, and a real-time preview canvas with person-aware subject segmentation ("Behind Head" effect).

---

## Features

- **AI Transcription & Forced Alignment**: Generate subtitles from audio using Groq (Whisper) for English and Sarvam AI for Hindi/Hinglish, paired with word-level forced alignment for synchronized pacing.
- **Dynamic Caption Presets**: Built-in library of customizable caption styles with fine-grained control over typography, font scaling, letter/word/line spacing, and entrance animations.
- **Catchy-Word Emphasis**: Automatic and manual keyword highlighting with per-word colors, background pills, and dynamic font treatments.
- **Interactive Canvas Editing**: Move and resize caption boxes directly within the preview viewport with multi-handle bounding boxes and live snap guides.
- **Global & Segment-Level Positioning**: Apply global subtitle positions across all segments while allowing individual segments to carry independent position and style overrides.
- **"Behind Head" 3D Depth Occlusion**: Client-side person segmentation using Google MediaPipe (`selfie_multiclass_256x256.tflite`), seamlessly rendering text behind the subject's head, hair, shoulders, and torso during playback, editing, and export.
- **Timeline Editor**: Synchronized multi-segment timeline with playback scrubber, segment selection, trimming, splitting, and inline subtitle correction.
- **MP4 Export**: Server/client video rendering powered by Remotion, burning in styled captions, animations, and depth masks into a downloadable MP4.

---

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) + [Vite](https://vitejs.dev/)
- **UI & Styling**: React 19, TypeScript, Tailwind CSS, Radix UI primitives, Lucide React
- **Video Engine**: [Remotion](https://www.remotion.dev/) (`@remotion/player`, `@remotion/renderer`, `@remotion/captions`)
- **Computer Vision**: [Google MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (WASM + TFLite multiclass segmentation)
- **Transcription APIs**: Groq Cloud (Whisper Large), Sarvam AI (Saarika v2.5 / Saaras)
- **Alignment Sidecar**: Python (`stable-ts`, Whisper, PyTorch)
- **Backend & Persistence**: Supabase (Postgres, Storage, Auth), Drizzle ORM

---

## Getting Started

### Prerequisites

- **Node.js**: v18.18+ or v20+
- **npm** or **bun**
- **Python**: 3.10+ (required for word-level alignment script `stable-ts`)
- **FFmpeg**: installed and available in your system `PATH` (for audio extraction and video rendering)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Khushicodes15/CaptionCraft.git
   cd CaptionCraft
   ```

2. **Install JavaScript dependencies**:
   ```bash
   npm install
   ```

3. **Install Python alignment dependencies** (optional, for local alignment):
   ```bash
   pip install stable-ts openai-whisper torch
   ```

4. **Configure Environment Variables**:
   Copy the example environment file and fill in your API credentials:
   ```bash
   cp .env.example .env
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Configuration

Set the following keys in your `.env` file:

```ini
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Speech-to-Text APIs
GROQ_API_KEY=gsk_your_groq_api_key
SARVAM_API_KEY=your_sarvam_api_key
```

---

## Project Structure

```
├── drizzle/              # Database schema and SQL migrations
├── public/
│   ├── fonts/            # Bundled web fonts for Remotion rendering
│   └── mediapipe/        # MediaPipe WASM binaries and TFLite model
├── src/
│   ├── components/       # UI components (Timeline, theme provider, etc.)
│   ├── integrations/     # Supabase and Lovable client adapters
│   ├── lib/              # Audio extraction, alignment, and transcription helpers
│   ├── modules/
│   │   ├── remotion/     # Remotion composition, overlay, and player components
│   │   ├── segmentation/ # MediaPipe Behind Head segmentation pipeline
│   │   ├── styles/       # Caption style presets, token definitions, and types
│   │   ├── transcribe/   # Audio chunking and transcription handlers
│   │   └── upload/       # Video upload and storage helpers
│   ├── routes/           # TanStack Start file-based routing
│   └── server.ts         # Server entrypoint
├── package.json
└── vite.config.ts
```

---

## License

This project is licensed under the MIT License.
