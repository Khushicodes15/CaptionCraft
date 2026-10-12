#!/usr/bin/env python3
"""
Forced alignment sidecar: stable-ts align() against a Sarvam transcript.
Audio is read from a temp file path (arg). Transcript is read from a UTF-8 file (arg).
Outputs JSON word timestamps to stdout. All errors go to stderr.
"""
import sys, os, json, argparse, traceback, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio_file",      required=True)
    parser.add_argument("--transcript_file", required=True)
    parser.add_argument("--language",        default="hi")
    parser.add_argument("--offset_ms",       type=float, default=0)
    parser.add_argument("--model",           default="tiny")
    args = parser.parse_args()

    # Read transcript from UTF-8 file (avoids Windows CLI arg encoding corruption)
    try:
        with open(args.transcript_file, "r", encoding="utf-8") as f:
            transcript = f.read().strip()
    except Exception as e:
        print(f"[align] Cannot read transcript file: {e}", file=sys.stderr)
        print("[]"); return

    if not transcript:
        print("[align] Empty transcript", file=sys.stderr)
        print("[]"); return

    print(f"[align] transcript byte len={len(transcript.encode('utf-8'))}, first 60 chars={transcript[:60]!r}", file=sys.stderr)
    print(f"[align] audio_file={args.audio_file}, language={args.language}, offset_ms={args.offset_ms}", file=sys.stderr)

    if not os.path.exists(args.audio_file):
        print(f"[align] Audio file not found: {args.audio_file}", file=sys.stderr)
        print("[]"); return

    audio_size = os.path.getsize(args.audio_file)
    print(f"[align] audio_file size={audio_size} bytes", file=sys.stderr)

    try:
        import stable_whisper
        model = stable_whisper.load_model(args.model)
        print(f"[align] model={args.model} loaded", file=sys.stderr)

        # Smart script/language selection for Whisper tokenizer
        latin_chars = sum(1 for c in transcript if 'a' <= c.lower() <= 'z')
        dev_chars   = sum(1 for c in transcript if '\u0900' <= c <= '\u097f')
        total_alpha = latin_chars + dev_chars

        # When speech is Roman Hinglish, English, or Latin-heavy code-mix,
        # Whisper aligns phonetic tokens with far higher cross-attention under "en".
        if args.language in ("hinglish", "en") or (total_alpha > 0 and latin_chars >= total_alpha * 0.25):
            align_lang = "en"
        else:
            align_lang = args.language

        print(f"[align] aligning with lang={align_lang} (requested={args.language}, latin={latin_chars}, dev={dev_chars})", file=sys.stderr)

        def run_alignment(target_lang):
            return model.align(
                args.audio_file,
                transcript,
                language=target_lang,
                nonspeech_skip=5.0,
            )

        def is_valid_result(res):
            if res is None or not res.segments:
                return False
            extracted = [w for seg in res.segments for w in seg.words if w.word.strip()]
            if not extracted:
                return False
            if len(extracted) >= 5:
                # Detect end-clamping: if > 35% of words are crammed into the last 0.2s of audio
                audio_dur = res.segments[-1].end if res.segments else 25.0
                clamped = sum(1 for w in extracted if abs(w.end - audio_dur) < 0.2 or w.start >= w.end)
                if clamped > len(extracted) * 0.35:
                    print(f"[align] Rejected alignment: {clamped}/{len(extracted)} words clamped at end of audio ({audio_dur:.2f}s)", file=sys.stderr)
                    return False
            return True

        result = run_alignment(align_lang)

        if not is_valid_result(result):
            alt_lang = "hi" if align_lang == "en" else "en"
            print(f"[align] Primary alignment with '{align_lang}' failed quality checks. Retrying with '{alt_lang}'...", file=sys.stderr)
            alt_result = run_alignment(alt_lang)
            if is_valid_result(alt_result):
                print(f"[align] Alternate alignment with '{alt_lang}' succeeded!", file=sys.stderr)
                result = alt_result
            else:
                print(f"[align] Both alignments failed quality checks. Yielding to sentence-level fallback.", file=sys.stderr)
                print("[]"); return

        words = []
        for seg in result.segments:
            for w in seg.words:
                text = w.word.strip()
                if not text: continue
                s = round(w.start * 1000 + args.offset_ms)
                e = round(w.end   * 1000 + args.offset_ms)
                if s < 0: s = 0
                if e <= s: e = s + 100
                words.append({"word": text, "start_ms": s, "end_ms": e})

        print(f"[align] total words={len(words)}", file=sys.stderr)
        if words:
            print(f"[align] FIRST 5 words: {words[:5]}", file=sys.stderr)
            print(f"[align] LAST  5 words: {words[-5:]}", file=sys.stderr)

        print(json.dumps(words))

    except Exception as ex:
        traceback.print_exc(file=sys.stderr)
        print(f"[align] exception: {ex}", file=sys.stderr)
        print("[]")

if __name__ == "__main__":
    main()