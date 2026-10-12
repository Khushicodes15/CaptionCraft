# CaptionCraft
**AI-powered video captioning with dynamic styles and person-aware text effects.**

Caption Studio is a video caption editor designed to make subtitles more engaging and customizable. It combines speech transcription, word-level timing, dynamic caption styling, and an interactive editing experience.

## Features

- **AI Transcription:** Generate subtitles from video audio, with support for English and Hindi/Hinglish workflows.
- **Word-Level Timestamps:** Align individual words with speech for precise caption timing.
- **Dynamic Caption Styles:** Apply expressive presets and customize typography, colors, and animations.
- **Catchy-Word Editing:** Customize the words emphasized by dynamic caption styles.
- **Interactive Caption Editor:** Move, resize, and edit captions directly in the video preview.
- **Global and Segment Controls:** Apply default caption settings across a video while retaining individual segment overrides.
- **Behind-Subject Captions:** Place captions behind segmented foreground subjects.
- **Video Export:** Render captioned videos with their configured styles and timing.

## Tech Stack

- React and TypeScript
- Tailwind CSS
- Python-based processing components
- Groq and Sarvam transcription integrations
- MediaPipe-based segmentation
- Remotion-based video rendering

*The exact dependencies, supported models, and environment requirements should be confirmed against the current source code.*

## Getting Started

### Prerequisites

Install the required Node.js and Python versions, along with any system dependencies specified by the project.

### Installation

```bash
git clone <YOUR_REPOSITORY_URL>
cd caption-studio
npm install
```

Configure the environment variables using the project's environment-variable example file, if provided.

Start the development server using the command defined in `package.json`, commonly:

```bash
npm run dev
```

Refer to the project configuration for additional frontend, backend, transcription, and export setup instructions.

## Configuration

API keys and other secrets should be stored in local environment variables. Never commit API keys, credentials, personal media, or local environment files.

## Project Status

Caption Studio is under active development. Features and setup requirements may evolve as the editor improves.

## License

A license has not yet been selected. All rights remain with the respective copyright holders until a license is added.
An AI-powered video caption editor with dynamic subtitle styles, Hinglish transcription, word-level timestamps, customizable caption positioning, and person-aware text occlusion.
