import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getLocalProject, saveLocalProject, type LocalProject } from "@/lib/local-storage";
import { renderMp4 } from "@/lib/render.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { detectEmphasis, transcribeChunk } from "@/lib/captions.functions";
import { toSrt, toVtt, download } from "@/modules/export/subtitles";
import { CAPTION_STYLES, getStyle } from "@/modules/styles/presetRegistry";
import {
  captionsSchema,
  emphasisSchema,
  projectStyleStateSchema,
  DEFAULT_STYLE_STATE,
  DEFAULT_POSITION,
  type Caption,
  type CaptionPosition,
  type EmphasisMap,
  type ProjectStyleState,
} from "@/modules/styles/types";
import { extractAudioChunks } from "@/modules/transcribe/audio";
import { signedVideoUrl } from "@/modules/upload/upload";
import { VideoPreview } from "@/modules/remotion/VideoPreview";
import { CaptionOverlay } from "@/modules/remotion/CaptionOverlay";
import { StylePoster } from "@/modules/remotion/StylePoster";
import { Timeline } from "@/components/Timeline";
import { extractSegmentMasksForExport } from "@/modules/segmentation/headSegmenter";
import { STOP_WORDS } from "@/modules/remotion/MixedTypeEngine";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Check,
  Pencil,
  Trash2,
  ChevronRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Type,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Globe,
  X,
  Layers,
  MoreVertical,
  Star,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/editor/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Caption editor — CaptionCraft" },
      {
        name: "description",
        content: "Transcribe, restyle and export animated captions for your video.",
      },
    ],
  }),
  component: Editor,
  errorComponent: ({ error }: any) => {
    console.error("Editor route error:", error);
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">This project could not be opened.</p>
        <pre className="text-xs text-red-500 max-w-[80vw] whitespace-pre-wrap">
          {error?.message || String(error)}
        </pre>
      </div>
    );
  },
});

type Stage = "idle" | "audio" | "transcribing" | "emphasis";

// â”€â”€ Style category config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STYLE_CATEGORIES = [
  { key: "social", label: "Social" },
  { key: "business", label: "Business" },
  { key: "retro", label: "Retro" },
  { key: "aesthetic", label: "Aesthetic" },
  { key: "dynamic", label: "Dynamic" },
  { key: "content-aware", label: "Content Aware" },
] as const;

// Categories that allow font family changes (curated typography categories like aesthetic/dynamic do not)
const FONT_CHANGE_CATEGORIES = new Set(["social", "business", "retro"]);
// Categories that support catchy word controls (only dynamic uses accent/catchy word differentiation)
const CATCHY_WORD_CATEGORIES = new Set(["dynamic"]);

// â”€â”€ Color swatches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COLOR_SWATCHES = [
  "#FFFFFF",
  "#000000",
  "#FACC15",
  "#22C55E",
  "#3B82F6",
  "#EF4444",
  "#EC4899",
  "#FF69B4",
  "#F97316",
  "#8B5CF6",
  "#00D2A0",
  "#B6F23A",
  "#C9F27B",
];

function Editor() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const runTranscribe = useServerFn(transcribeChunk);
  const runEmphasis = useServerFn(detectEmphasis);

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [emphasis, setEmphasis] = useState<EmphasisMap>({});
  const [styleState, setStyleState] = useState<ProjectStyleState>(DEFAULT_STYLE_STATE);
  const [language, setLanguage] = useState<"en" | "hi" | "hinglish">("en");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"transcript" | "styles" | "edit">("transcript");
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const isCaptionSelected = Boolean(selectedCaptionId);
  const [positionScope, setPositionScope] = useState<"all" | "segment">("all");

  const selectedSegment = useMemo(
    () => captions.find((c) => c.id === selectedCaptionId) || null,
    [captions, selectedCaptionId]
  );
  const selectedSegmentIndex = useMemo(
    () => captions.findIndex((c) => c.id === selectedCaptionId),
    [captions, selectedCaptionId]
  );
  const isBehindHeadOverridden = selectedSegment?.styleOverrides?.behindHead !== undefined;
  const effectiveBehindHead = isBehindHeadOverridden
    ? Boolean(selectedSegment?.styleOverrides?.behindHead)
    : Boolean(styleState.behindHead);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320);
  const [isPlaying, setIsPlaying] = useState(false);
  const loaded = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const transcriptListRef = useRef<HTMLDivElement>(null);

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const isLocal = id === "local";
  const loadFailed = useRef(false);
  const dragStartStyleRef = useRef<{ normalSizeMultiplier: number; catchySizeMultiplier: number; lineSpacing?: number }>({ normalSizeMultiplier: 1, catchySizeMultiplier: 1.5, lineSpacing: 1 });

  // ── Undo / Redo History ──────────────────────────────────────────
  type HistorySnapshot = {
    captions: Caption[];
    styleState: ProjectStyleState;
    emphasis: EmphasisMap;
  };

  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isPerformingUndoRedo = useRef(false);

  const pushSnapshot = useCallback(
    (newCaptions?: Caption[], newStyleState?: ProjectStyleState, newEmphasis?: EmphasisMap) => {
      if (isPerformingUndoRedo.current) return;
      const snapCaptions = newCaptions ?? captions;
      const snapStyleState = newStyleState ?? styleState;
      const snapEmphasis = newEmphasis ?? emphasis;

      const snap: HistorySnapshot = structuredClone({
        captions: snapCaptions,
        styleState: snapStyleState,
        emphasis: snapEmphasis,
      });

      // Avoid duplicate snapshots if state hasn't meaningfully changed
      const currentSnap = historyRef.current[historyIndexRef.current];
      if (currentSnap) {
        try {
          if (JSON.stringify(currentSnap) === JSON.stringify(snap)) {
            return;
          }
        } catch {
          // ignore serialization failure
        }
      }

      // Truncate abandoned redo branch
      const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      nextHistory.push(snap);
      if (nextHistory.length > 50) {
        nextHistory.shift();
      }
      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    },
    [captions, styleState, emphasis]
  );

  useEffect(() => {
    if (captions.length > 0 && historyRef.current.length === 0) {
      historyRef.current = [
        structuredClone({
          captions,
          styleState,
          emphasis,
        }),
      ];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [captions, styleState, emphasis]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const target = historyRef.current[historyIndexRef.current];
      if (target) {
        isPerformingUndoRedo.current = true;
        setCaptions(structuredClone(target.captions));
        setStyleState(structuredClone(target.styleState));
        setEmphasis(structuredClone(target.emphasis));
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
        setTimeout(() => {
          isPerformingUndoRedo.current = false;
        }, 100);
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const target = historyRef.current[historyIndexRef.current];
      if (target) {
        isPerformingUndoRedo.current = true;
        setCaptions(structuredClone(target.captions));
        setStyleState(structuredClone(target.styleState));
        setEmphasis(structuredClone(target.emphasis));
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
        setTimeout(() => {
          isPerformingUndoRedo.current = false;
        }, 100);
      }
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Outside-click and Escape key handling to deselect active caption
  useEffect(() => {
    if (!selectedCaptionId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. Preserve selection if clicking inside active or other caption box
      if (target.closest("[data-caption-box]")) return;

      // 2. Preserve selection if clicking inside floating contextual toolbar
      if (target.closest("[data-floating-toolbar]")) return;

      // 3. Preserve selection if clicking sidebar controls, timeline, or header
      if (target.closest("aside") || target.closest("footer") || target.closest("header")) return;

      // 4. Preserve selection if clicking inside Radix UI portals (dropdowns, popovers, dialogs, selects, toasts)
      if (
        target.closest("[data-radix-portal]") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[role='dialog']") ||
        target.closest("[role='listbox']") ||
        target.closest("[role='menu']") ||
        target.closest("[role='tooltip']") ||
        target.closest("[data-sonner-toaster]")
      ) {
        return;
      }

      // 5. Clicking video background, canvas, letterbox area, or non-interactive canvas area deselects
      setSelectedCaptionId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedCaptionId(null);
      }
    };

    // Use capture phase so outside clicks are caught before other elements stop propagation
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCaptionId]);

  const project = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      if (id === "local") {
        const local = await getLocalProject();
        if (!local) throw new Error("No anonymous project found. Try uploading again.");
        return local;
      }
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    const data = project.data;
    if (!data || loaded.current) return;
    loaded.current = true;

    const parsedCaptions = captionsSchema.safeParse(data.captions_json);
    const parsedEmphasis = emphasisSchema.safeParse(data.emphasis_json);
    const parsedStyle = projectStyleStateSchema.safeParse(data.style_json);

    let hasError = false;
    if (
      data.captions_json &&
      (!parsedCaptions.success ||
        (Array.isArray(data.captions_json) &&
          data.captions_json.length > 0 &&
          parsedCaptions.data?.length === 0))
    ) {
      hasError = true;
    }
    if (data.emphasis_json && !parsedEmphasis.success) {
      hasError = true;
    }

    if (hasError) {
      loadFailed.current = true;
      toast.error(
        "Failed to load some project data securely. Autosave disabled to prevent data loss.",
      );
    }

    let initialCaptions: Caption[] = [];
    if (parsedCaptions.success) {
      const loaded = parsedCaptions.data;
      if (loaded.length > 0 && loaded[0] && !loaded[0].id) {
        // Legacy check: if it lacks an ID, it's a flat array of words. Group them into segments.
        const wpl = parsedStyle.data?.wordsPerLine || 4;
        const segments: Caption[] = [];
        for (let i = 0; i < loaded.length; i += wpl) {
          const chunk = loaded.slice(i, i + wpl);
          if (chunk.length === 0) continue;
          segments.push({
            id: Math.random().toString(36).slice(2, 9),
            text: chunk.map((c) => c.text).join(" "),
            startMs: chunk[0]?.startMs ?? 0,
            endMs: chunk[chunk.length - 1]?.endMs ?? 0,
            words: chunk.map((c) => ({ text: c.text, startMs: c.startMs, endMs: c.endMs })),
          });
        }
        initialCaptions = segments;
        setCaptions(segments);
      } else {
        initialCaptions = loaded;
        setCaptions(loaded);
      }
    }
    const finalEmphasis = parsedEmphasis.success ? parsedEmphasis.data : {};
    const finalStyle = parsedStyle.success ? parsedStyle.data : DEFAULT_STYLE_STATE;
    if (parsedEmphasis.success) setEmphasis(finalEmphasis);
    if (parsedStyle.success) setStyleState(finalStyle);

    if (initialCaptions.length > 0) {
      historyRef.current = [
        structuredClone({
          captions: initialCaptions,
          styleState: finalStyle,
          emphasis: finalEmphasis,
        }),
      ];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    }

    if (data.language === "en" || data.language === "hi" || data.language === "hinglish") {
      setLanguage(data.language);
    } else {
      setLanguage("en"); // map legacy "auto" or unknown values to English
    }

    if ((data as any).video_path && !isLocal) {
      signedVideoUrl((data as any).video_path)
        .then(setVideoUrl)
        .catch(() => toast.error("Could not load the video file."));
    } else if (isLocal && (data as LocalProject).video_blob) {
      setVideoUrl(URL.createObjectURL((data as LocalProject).video_blob!));
    }
  }, [project.data]);

  // Autosave
  useEffect(() => {
    if (!loaded.current || loadFailed.current) return;

    const dbCaptions = project.data?.captions_json;
    if (captions.length === 0 && Array.isArray(dbCaptions) && dbCaptions.length > 0) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (isLocal) {
          await saveLocalProject({
            captions_json: captions,
            emphasis_json: emphasis,
            style_json: styleState,
            language,
          });
        } else {
          const { error } = await supabase
            .from("projects")
            .update({
              captions_json: captions as any,
              emphasis_json: emphasis as any,
              style_json: styleState as any,
              language,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
          if (error) console.error("Autosave failed:", error.message);
        }
      } catch (e) {
        console.error("Autosave error:", e);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [captions, emphasis, styleState, language, id, project.data]);

  const words = useMemo(() => captions.map((caption) => caption.text), [captions]);

  const runEmphasisPass = useCallback(
    async (list: Caption[]) => {
      if (list.length === 0) return;
      setStage("emphasis");
      try {
        const result = await runEmphasis({ data: { words: list.map((c) => c.text) } });
        const map: EmphasisMap = {};
        for (const item of result.emphasis) {
          map[String(item.index)] = Math.min(3, Math.max(1, item.level)) as 1 | 2 | 3;
        }
        setEmphasis(map);
        if (result.source === "local") toast.message("Used the built-in catchy-word scoring.");

        try {
          if (isLocal) {
            await saveLocalProject({ emphasis_json: map });
          } else {
            await supabase
              .from("projects")
              .update({
                emphasis_json: map as any,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          }
        } catch (e) {
          console.error("Failed to save emphasis:", e);
        }
      } catch {
        toast.error("Catchy-word detection failed; captions are still fine.");
      } finally {
        setStage("idle");
      }
    },
    [runEmphasis, id, isLocal],
  );

  async function handleTranscribe() {
    setStage("audio");
    setProgress(2);

    try {
      let file: File;
      if (isLocal) {
        const local = await getLocalProject();
        if (!local || !local.video_blob) throw new Error("Local video not found.");
        file = local.video_blob as File;
      } else {
        const path = (project.data as any)?.video_path;
        if (!path) throw new Error("Video path missing.");
        const { data: blob, error } = await supabase.storage.from("videos").download(path);
        if (error || !blob) throw new Error("Could not download the video for transcription.");
        file = new File([blob], "video", { type: blob.type || "video/mp4" });
      }

      const chunks = await extractAudioChunks(file, (fraction) =>
        setProgress(Math.round(fraction * 30)),
      );
      setStage("transcribing");

      const all: Caption[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const result = (await runTranscribe({
          data: {
            audioBase64: chunk.base64,
            offsetMs: chunk.offsetMs,
            language,
            validStartMs: chunk.validStartMs,
            validEndMs: Number.isFinite(chunk.validEndMs) ? chunk.validEndMs : undefined,
            durationMs: chunk.durationMs,
          },
        })) as any;
        all.push(...result.captions);
        setProgress(30 + Math.round((70 * (i + 1)) / chunks.length));
      }

      if (all.length === 0) throw new Error("No speech was detected in this video.");
      
      const wpl = styleState.wordsPerLine || 4;
      const segments: Caption[] = [];
      for (let i = 0; i < all.length; i += wpl) {
        const chunk = all.slice(i, i + wpl);
        if (chunk.length === 0) continue;
        segments.push({
          id: Math.random().toString(36).slice(2, 9),
          text: chunk.map((c) => c.text).join(" "),
          startMs: chunk[0]?.startMs ?? 0,
          endMs: chunk[chunk.length - 1]?.endMs ?? 0,
          words: chunk.map((c) => ({ text: c.text, startMs: c.startMs, endMs: c.endMs })),
        });
      }
      setCaptions(segments);
      setEmphasis({});
      toast.success(`Transcribed ${all.length} words.`);

      try {
        if (isLocal) {
          await saveLocalProject({
            captions_json: all,
            emphasis_json: {},
            language,
          });
        } else {
          await supabase
            .from("projects")
            .update({
              captions_json: all as any,
              emphasis_json: {} as any,
              language,
              status: "Transcribed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        }
      } catch (e) {
        console.error("Failed to save transcription:", e);
      }

      await runEmphasisPass(all);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setStage("idle");
      setProgress(0);
    }
  }

  function cycleEmphasis(index: number) {
    const next: EmphasisMap = { ...emphasis };
    const level = ((emphasis[String(index)] ?? 0) + 1) % 4;
    if (level === 0) delete next[String(index)];
    else next[String(index)] = level as 1 | 2 | 3;
    setEmphasis(next);
    pushSnapshot(captions, styleState, next);
  }

  const handleClearSegmentCatchyWords = useCallback(
    (segIndex: number) => {
      if (segIndex < 0 || segIndex >= captions.length) return;
      let startGlobalIdx = 0;
      for (let i = 0; i < segIndex; i++) {
        const c = captions[i];
        startGlobalIdx += c?.words?.length || c?.text.trim().split(/\s+/).filter(Boolean).length || 0;
      }
      const segment = captions[segIndex];
      if (!segment) return;
      const wordCount =
        segment.words && segment.words.length > 0
          ? segment.words.length
          : (segment.text.trim().split(/\s+/).filter(Boolean).length || 0);

      const next: EmphasisMap = { ...emphasis };
      let changed = false;
      for (let j = 0; j < wordCount; j++) {
        const key = String(startGlobalIdx + j);
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      if (changed) {
        setEmphasis(next);
        pushSnapshot(captions, styleState, next);
        toast.success(`Reset catchy words for segment #${segIndex + 1} to Auto`);
      }
    },
    [captions, emphasis, styleState, pushSnapshot]
  );

  const getSegmentWordsInfo = useCallback(
    (segIndex: number) => {
      if (segIndex < 0 || segIndex >= captions.length) return [];
      let startGlobalIdx = 0;
      for (let i = 0; i < segIndex; i++) {
        const c = captions[i];
        startGlobalIdx += c?.words?.length || c?.text.trim().split(/\s+/).filter(Boolean).length || 0;
      }
      const segment = captions[segIndex];
      if (!segment) return [];
      const wordList: string[] =
        segment.words && segment.words.length > 0
          ? segment.words.map((w) => w.text)
          : (segment.text.trim().split(/\s+/).filter(Boolean) || []);

      let highestLevel = 0;
      for (let j = 0; j < wordList.length; j++) {
        const gIdx = startGlobalIdx + j;
        const lvl = emphasis[String(gIdx)] ?? 0;
        if (lvl > highestLevel) highestLevel = lvl;
      }

      const segAutoAccent =
        segment.styleOverrides?.autoAccent !== undefined
          ? segment.styleOverrides.autoAccent
          : styleState.autoAccent !== false;

      let autoAccentGlobalIdx = -1;
      if (highestLevel === 0 && segAutoAccent) {
        let longestLen = 0;
        for (let j = 0; j < wordList.length; j++) {
          const text = wordList[j] || "";
          const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!STOP_WORDS.has(clean) && clean.length > longestLen) {
            longestLen = clean.length;
            autoAccentGlobalIdx = startGlobalIdx + j;
          }
        }
      }

      return wordList.map((word, wordOffset) => {
        const gIdx = startGlobalIdx + wordOffset;
        const level = emphasis[String(gIdx)] ?? 0;
        return {
          word,
          globalIndex: gIdx,
          level,
          isAuto: autoAccentGlobalIdx === gIdx,
        };
      });
    },
    [captions, emphasis, styleState.autoAccent]
  );

  const handleWordEdit = (index: number, newText: string) => {
    const item = captions[index];
    if (item && item.text !== newText) {
      const copy = captions.map((c, i) => (i === index ? { ...c, text: newText } : c));
      setCaptions(copy);
      pushSnapshot(copy);
    }
  };

  const baseStyle = getStyle(styleState.styleId);
  const currentCategory = baseStyle.category;
  const allowFontChange = FONT_CHANGE_CATEGORIES.has(currentCategory);
  const allowCatchyWords = useMemo(() => {
    if (CATCHY_WORD_CATEGORIES.has(currentCategory)) return true;
    if (baseStyle.engine === "mixed-type" || Boolean(baseStyle.tokens?.fontFamilyEmphasis)) return true;
    if (selectedSegment?.styleOverrides?.styleId) {
      const segStyle = getStyle(selectedSegment.styleOverrides.styleId);
      if (
        CATCHY_WORD_CATEGORIES.has(segStyle.category) ||
        segStyle.engine === "mixed-type" ||
        Boolean(segStyle.tokens?.fontFamilyEmphasis)
      ) {
        return true;
      }
    }
    return Boolean(
      styleState.catchyFont ||
      (styleState as any).fontFamilyEmphasisOverride ||
      (selectedSegment?.styleOverrides as any)?.catchyFont ||
      (selectedSegment?.styleOverrides as any)?.fontFamilyEmphasisOverride
    );
  }, [currentCategory, baseStyle, selectedSegment, styleState]);
  const style = useMemo(() => {
    const tokens = { ...baseStyle.tokens };
    if (allowFontChange && styleState.fontFamilyOverride) {
      tokens.fontFamily = styleState.fontFamilyOverride;
    }
    if (allowFontChange && styleState.fontFamilyEmphasisOverride) {
      tokens.fontFamilyEmphasis = styleState.fontFamilyEmphasisOverride;
    }
    return { ...baseStyle, tokens };
  }, [
    baseStyle,
    styleState.fontFamilyOverride,
    styleState.fontFamilyEmphasisOverride,
    allowFontChange,
  ]);
  const busy = stage !== "idle";
  const title = project.data?.title ?? "Project";

  const handleRename = async (newTitle: string) => {
    if (!newTitle.trim() || newTitle.trim() === title) {
      setEditingTitle(false);
      return;
    }
    const finalTitle = newTitle.trim();
    
    queryClient.setQueryData(["project", id], (old: any) => old ? { ...old, title: finalTitle } : old);
    setEditingTitle(false);
    
    try {
      if (isLocal) {
        await saveLocalProject({ title: finalTitle });
      } else {
        await supabase.from("projects").update({ title: finalTitle }).eq("id", id);
      }
    } catch (e) {
      toast.error("Failed to rename project");
    }
  };

  const handleStyleUpdate = useCallback(
    (updater: (prev: ProjectStyleState) => ProjectStyleState, commit: boolean = true) => {
      if (selectedCaptionId) {
        const updatedCaptions = captions.map((c) => {
          if (c.id === selectedCaptionId) {
            const currentEffective: ProjectStyleState = {
              ...styleState,
              ...(c.styleOverrides || {}),
            };
            const updated = updater(currentEffective);
            const newOverrides: any = { ...(c.styleOverrides || {}) };
            for (const key in updated) {
              const k = key as keyof ProjectStyleState;
              if (updated[k] !== currentEffective[k]) {
                newOverrides[k] = updated[k];
              }
            }
            return { ...c, styleOverrides: newOverrides };
          }
          return c;
        });
        setCaptions(updatedCaptions);
        if (commit) {
          pushSnapshot(updatedCaptions);
        }
      } else {
        const updated = updater(styleState);
        setStyleState(updated);
        if (commit) {
          pushSnapshot(captions, updated);
        }
      }
    },
    [selectedCaptionId, styleState, pushSnapshot, captions]
  );

  const handlePositionChange = useCallback(
    (pos: CaptionPosition, targetId?: string | null, commit: boolean = true) => {
      const shouldUpdateSegment =
        targetId !== null &&
        (targetId !== undefined
          ? Boolean(targetId)
          : positionScope === "segment" && Boolean(selectedCaptionId));
      const idToUpdate = shouldUpdateSegment ? (targetId || selectedCaptionId) : null;

      if (idToUpdate) {
        const updated = captions.map((c) =>
          c.id === idToUpdate
            ? {
                ...c,
                styleOverrides: {
                  ...(c.styleOverrides || {}),
                  position: pos,
                  ...(pos.lineSpacing !== undefined ? { lineSpacing: pos.lineSpacing } : {}),
                },
              }
            : c
        );
        setCaptions(updated);
        if (commit) {
          pushSnapshot(updated);
        }
      } else {
        const updated: ProjectStyleState = {
          ...styleState,
          position: pos,
          ...(pos.lineSpacing !== undefined ? { lineSpacing: pos.lineSpacing } : {}),
        };
        setStyleState(updated);
        if (commit) {
          pushSnapshot(captions, updated);
        }
      }
    },
    [positionScope, selectedCaptionId, captions, styleState, pushSnapshot]
  );

  const handleResetPosition = useCallback(
    (targetId?: string | null) => {
      const idToReset = targetId || selectedCaptionId;
      if (idToReset) {
        const updated = captions.map((c) => {
          if (c.id === idToReset && c.styleOverrides) {
            const { position: _pos, ...restOverrides } = c.styleOverrides;
            return {
              ...c,
              styleOverrides: Object.keys(restOverrides).length > 0 ? restOverrides : undefined,
            };
          }
          return c;
        });
        setCaptions(updated);
        pushSnapshot(updated);
        toast.success("Segment position reset to global default");
      } else {
        const nextStyle: ProjectStyleState = {
          ...styleState,
          position: DEFAULT_POSITION,
        };
        setStyleState(nextStyle);
        pushSnapshot(captions, nextStyle);
        toast.success("Global position reset to default");
      }
    },
    [selectedCaptionId, captions, styleState, pushSnapshot]
  );

  const handleResetAllPositionsToGlobal = useCallback(() => {
    const hasAnyOverride = captions.some((c) => Boolean(c.styleOverrides?.position));
    if (!hasAnyOverride) {
      toast.info("All captions are already using the global position");
      return;
    }
    const updated = captions.map((c) => {
      if (c.styleOverrides?.position) {
        const { position: _pos, ...restOverrides } = c.styleOverrides;
        return {
          ...c,
          styleOverrides: Object.keys(restOverrides).length > 0 ? restOverrides : undefined,
        };
      }
      return c;
    });
    setCaptions(updated);
    pushSnapshot(updated);
    toast.success("All segment position overrides reset to global position");
  }, [captions, pushSnapshot]);

  const handleSegmentBehindHeadChange = useCallback(
    (id: string, value: boolean) => {
      const updated = captions.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            styleOverrides: {
              ...(c.styleOverrides || {}),
              behindHead: value,
            },
          };
        }
        return c;
      });
      setCaptions(updated);
      pushSnapshot(updated);
      toast.success(`Behind Head ${value ? "enabled" : "disabled"} for segment`);
    },
    [captions, pushSnapshot]
  );

  const handleResetBehindHead = useCallback(
    (id: string) => {
      const updated = captions.map((c) => {
        if (c.id === id && c.styleOverrides) {
          const nextOverrides = { ...c.styleOverrides };
          delete nextOverrides.behindHead;
          return {
            ...c,
            styleOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
          };
        }
        return c;
      });
      setCaptions(updated);
      pushSnapshot(updated);
      toast.success("Behind Head reset to global inheritance");
    },
    [captions, pushSnapshot]
  );

  const handleApplyStyleToAll = useCallback(() => {
    const targetStyleId = selectedSegment?.styleOverrides?.styleId || styleState.styleId;
    if (!targetStyleId) return;

    // 1. Prepare clean global style configuration with the target preset
    const nextStyleState: ProjectStyleState = {
      ...DEFAULT_STYLE_STATE,
      styleId: targetStyleId,
      position: styleState.position || DEFAULT_POSITION,
      autoAccent: styleState.autoAccent ?? true,
      behindHead: styleState.behindHead ?? false,
      wordsPerLine: styleState.wordsPerLine || 4,
      linesPerCaption: styleState.linesPerCaption || 2,
    };

    // 2. Strip any segment-level style overrides that would conflict with the global preset,
    // while preserving segment timing, text, words, stable IDs, and non-styling metadata (position, behindHead).
    const updatedCaptions = captions.map((c) => {
      if (!c.styleOverrides) return c;
      const preservedOverrides: any = {};
      if (c.styleOverrides.position) {
        preservedOverrides.position = c.styleOverrides.position;
      }
      if (c.styleOverrides.behindHead !== undefined) {
        preservedOverrides.behindHead = c.styleOverrides.behindHead;
      }
      return {
        ...c,
        styleOverrides: Object.keys(preservedOverrides).length > 0 ? preservedOverrides : undefined,
      };
    });

    // 3. Atomically update global style state and all caption segments
    setStyleState(nextStyleState);
    setCaptions(updatedCaptions);

    // 4. Record undo/redo snapshot and trigger autosave
    pushSnapshot(updatedCaptions, nextStyleState);

    // 5. Switch UI back to Global Styles mode
    setSelectedCaptionId(null);

    const styleName = getStyle(targetStyleId)?.name || targetStyleId;
    toast.success(`Applied "${styleName}" style to all caption segments globally`);
  }, [selectedSegment, styleState, captions, pushSnapshot]);

  // Short transcript sample for Style Gallery cards (ideally 3–5 words from actual transcript)
  const sampleText = useMemo(() => {
    const extractedWords: string[] = [];
    for (const cap of captions) {
      if (cap.words && cap.words.length > 0) {
        for (const w of cap.words) {
          const t = w.text?.trim();
          if (t) extractedWords.push(t);
          if (extractedWords.length >= 5) break;
        }
      } else if (cap.text) {
        const parts = cap.text.trim().split(/\s+/).filter(Boolean);
        for (const p of parts) {
          extractedWords.push(p);
          if (extractedWords.length >= 5) break;
        }
      }
      if (extractedWords.length >= 5) break;
    }

    if (extractedWords.length >= 3) {
      return extractedWords.slice(0, Math.min(5, extractedWords.length)).join(" ");
    }
    return "Keep your story moving";
  }, [captions]);

  const [isExportingMP4, setIsExportingMP4] = useState(false);

  const handleExport = async (format: "srt" | "vtt" | "json" | "mp4") => {
    if (isLocal) {
      setShowLoginDialog(true);
      return;
    }

    if (format === "mp4") {
      setIsExportingMP4(true);
      toast.loading("Preparing MP4 export...", { id: "mp4-render" });
      try {
        let behindHeadMasks: Record<number, string> = {};
        const hasBehindHead = captions.some(
          (c) => (c.styleOverrides?.behindHead ?? styleState.behindHead ?? false) === true
        );

        if (hasBehindHead && videoUrl) {
          toast.loading("Processing Behind Head occlusion for export...", { id: "mp4-render" });
          try {
            behindHeadMasks = await extractSegmentMasksForExport(
              videoUrl,
              captions,
              styleState.behindHead ?? false,
              (project.data as any)?.fps || 30,
              ({ current, total, percent }) => {
                toast.loading(`Processing Behind Head: ${percent}% (${current}/${total} frames)...`, { id: "mp4-render" });
              }
            );
          } catch (maskErr) {
            console.warn("Behind Head export mask extraction failed:", maskErr);
            toast.error("Could not generate Behind Head occlusion masks; continuing with foreground captions.");
          }
        }

        toast.loading("Rendering MP4... this may take a minute.", { id: "mp4-render" });
        const data = await renderMp4({
            data: {
              videoUrl,
              captions,
              emphasis,
              style,
              position: styleState.position,
              wordsPerLine: styleState.wordsPerLine,
              styleOverrides: styleState,
              behindHeadMasks,
              width: project.data?.width ?? 1080,
              height: project.data?.height ?? 1920,
              duration_sec: project.data?.duration_sec,
            },
          });
        if (data.success) {
          toast.success("Export complete!", { id: "mp4-render" });
          if (data.url.startsWith("data:")) {
            const a = document.createElement("a");
            a.href = data.url;
            a.download = `render-${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else {
            window.location.href = data.url;
          }
        } else {
          toast.error("Failed to render: " + data.error, { id: "mp4-render" });
        }
      } catch (err) {
        toast.error("Error connecting to render server.", { id: "mp4-render" });
      } finally {
        setIsExportingMP4(false);
        setExportOpen(false);
      }
      return;
    }

    if (format === "srt")
      download(`${title}.srt`, toSrt(captions, styleState.wordsPerLine), "text/plain");
    if (format === "vtt")
      download(`${title}.vtt`, toVtt(captions, styleState.wordsPerLine), "text/vtt");
    if (format === "json")
      download(
        `${title}.json`,
        JSON.stringify({ captions, emphasis, style, position: styleState.position }, null, 2),
        "application/json",
      );
    setExportOpen(false);
  };

  // â”€â”€ Panel resize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handlePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    panelResizeRef.current = { startX: e.clientX, startWidth: panelWidth };
    const handleMove = (ev: MouseEvent) => {
      if (!panelResizeRef.current) return;
      const dx = ev.clientX - panelResizeRef.current.startX;
      setPanelWidth(Math.max(260, Math.min(500, panelResizeRef.current.startWidth + dx)));
    };
    const handleUp = () => {
      panelResizeRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  // â”€â”€ Collect unique fonts for dropdowns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allFonts = useMemo(() => {
    const set = new Set<string>();
    CAPTION_STYLES.forEach((s) => {
      set.add(s.tokens.fontFamily);
      if (s.tokens.fontFamilyEmphasis) set.add(s.tokens.fontFamilyEmphasis);
      if (s.mixedTokens) {
        set.add(s.mixedTokens.base.fontFamily);
        set.add(s.mixedTokens.accent.fontFamily);
      }
    });
    return Array.from(set).sort();
  }, []);

  const captionLines = useMemo(() => {
    if (captions.length === 0) return [];
    return captions.map((segment, idx) => ({
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      indices: [idx],
    }));
  }, [captions]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  RENDER: TRANSCRIPT TAB
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const renderTranscript = () => (
    <div className="flex flex-col h-full">
      {/* Header controls matching VEED layout */}
      <div className="flex items-center justify-between gap-1.5 mb-3 px-1">
        <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
          <SelectTrigger className="h-8 text-xs flex-1 max-w-[130px] rounded-lg">
            <Globe className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="hi">Hindi</SelectItem>
            <SelectItem value="hinglish">Hinglish</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 text-xs px-3"
          onClick={handleTranscribe}
          disabled={
            busy ||
            (isLocal ? !(project.data as any)?.video_blob : !(project.data as any)?.video_path)
          }
        >
          {captions.length > 0 ? "Retranscribe" : "Transcribe"}
        </Button>
      </div>

      {/* Caption lines list */}
      <div ref={transcriptListRef} className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
        {captionLines.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-8 text-center">
            No transcript yet — press "Transcribe" above.
          </p>
        ) : (
          captionLines.map((line, lineIdx) => {
            const lineIdx0 = line.indices[0] ?? 0;
            const segmentId = captions[lineIdx0]?.id;
            const isSelected = Boolean(segmentId && selectedCaptionId === segmentId);
            return (
            <div
              key={lineIdx}
              className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-all cursor-pointer border ${
                isSelected
                  ? "bg-muted/40 border-l-[3.5px] border-l-[#22C55E] border-t-transparent border-r-transparent border-b-transparent shadow-sm"
                  : "border-transparent hover:bg-muted/30"
              }`}
              onClick={() => {
                if (segmentId) setSelectedCaptionId(segmentId);
                const video = videoRef.current || document.querySelector("video");
                if (video) {
                  video.currentTime = line.startMs / 1000;
                  video.dispatchEvent(new Event("timeupdate"));
                  video.dispatchEvent(new Event("seeked"));
                }
              }}
            >
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 min-w-[38px]">
                {formatTime(line.startMs)}
              </span>
              <div className="flex-1">
                {isEditMode ? (
                  <div className="flex flex-wrap gap-1">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleWordEdit(lineIdx0, e.currentTarget.textContent || "")}
                      className="px-1 py-0.5 bg-secondary/50 rounded border border-transparent hover:border-border outline-none focus:bg-background focus:border-primary text-sm inline-block"
                    >
                      {captions[lineIdx0]?.text}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm leading-relaxed flex flex-wrap gap-x-1">
                    {(() => {
                       let globalWordIndex = 0;
                       for (let i = 0; i < lineIdx0; i++) {
                         const c = captions[i];
                         globalWordIndex += c?.words?.length || c?.text.trim().split(/\s+/).filter(Boolean).length || 0;
                       }
                       const segment = captions[lineIdx0];
                       const words: string[] = segment?.words?.length ? segment.words.map((w: { text: string }) => w.text) : (segment?.text.trim().split(/\s+/).filter(Boolean) || []);
                       
                       return words.map((word: string, wordOffset: number) => {
                         const gIdx = globalWordIndex + wordOffset;
                         const level = emphasis[String(gIdx)] ?? 0;
                         return (
                           <span
                             key={gIdx}
                             onClick={(e) => {
                               e.stopPropagation();
                               cycleEmphasis(gIdx);
                             }}
                             className={`cursor-pointer px-1 py-0.5 rounded transition-all inline-flex items-center gap-0.5 ${
                               level === 0
                                 ? "hover:bg-muted text-foreground"
                                 : level === 1
                                   ? "bg-primary/20 text-primary font-semibold ring-1 ring-primary/40"
                                   : level === 2
                                     ? "bg-primary/30 text-primary font-bold ring-1 ring-primary/60"
                                     : "bg-primary text-primary-foreground font-bold shadow-sm"
                             }`}
                             title={level > 0 ? `Catchy word (Level ${level}) — Click to change` : "Click to set as catchy word"}
                           >
                             {level > 0 && <span className="text-[10px]">★</span>}
                             {word}
                           </span>
                         );
                       });
                    })()}
                  </span>
                )}
              </div>
              {/* Right: Three dots menu / actions matching VEED */}
              <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (segmentId) setSelectedCaptionId(segmentId);
                    setSelectedTab("edit");
                  }}
                  title="Edit subtitle properties"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  className="hidden group-hover:inline-flex p-1 hover:bg-destructive/20 hover:text-destructive rounded transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const remaining = captions.filter((_, i) => !line.indices.includes(i));
                    setCaptions(remaining);
                    pushSnapshot(remaining);
                    if (segmentId && selectedCaptionId === segmentId) setSelectedCaptionId(null);
                  }}
                  title="Delete line"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>

      {/* Edit mode toggle + Delete all */}
      {captions.length > 0 && (
        <div className="border-t pt-3 mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium cursor-pointer" htmlFor="edit-mode">
              Edit mode
            </label>
            <Switch id="edit-mode" checked={isEditMode} onCheckedChange={setIsEditMode} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
            onClick={() => {
              if (confirm("Delete all captions? This can be undone with Undo.")) {
                setCaptions([]);
                setEmphasis({});
                pushSnapshot([], undefined, {});
              }
            }}
          >
            Delete all
          </Button>
        </div>
      )}
    </div>
  );

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  RENDER: STYLES TAB
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const renderStyles = () => {
    const getStylesForCategory = (cat: string) => CAPTION_STYLES.filter((s) => s.category === cat);
    const activeStyleId = selectedSegment?.styleOverrides?.styleId || styleState.styleId;
    const effectiveAutoAccent = selectedSegment?.styleOverrides?.autoAccent ?? styleState.autoAccent;

    return (
      <div className="space-y-6 pb-6 overflow-y-auto custom-scrollbar">
        {/* Selection mode indicator banner in Styles tab */}
        {selectedCaptionId && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs">
            <div className="flex flex-col">
              <span className="font-semibold text-primary">
                Segment #{selectedSegmentIndex + 1} Style
              </span>
              <span className="text-[10px] text-muted-foreground">
                Click a preset below to restyle this segment only.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={handleApplyStyleToAll}
              title="Apply this preset to all caption segments globally"
            >
              Apply to All
            </Button>
          </div>
        )}

        {/* Auto-accent toggle */}
        <div className="flex items-center justify-between px-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="auto-accent">
            Auto-accent words
          </label>
          <Switch
            id="auto-accent"
            checked={effectiveAutoAccent !== false}
            onCheckedChange={(v) => handleStyleUpdate((s) => ({ ...s, autoAccent: v }))}
          />
        </div>

        {/* Behind Head toggle in Styles tab — Global default for all captions */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="behind-head-style">
              Behind Head effect
            </label>
            <span className="text-[10px] text-muted-foreground">
              Global default for all captions
            </span>
          </div>
          <Switch
            id="behind-head-style"
            checked={styleState.behindHead ?? false}
            onCheckedChange={(checked) => {
              handleStyleUpdate((s) => ({ ...s, behindHead: checked }));
              toast.success(`Behind Head default ${checked ? "enabled" : "disabled"} globally`);
            }}
          />
        </div>

        {STYLE_CATEGORIES.map(({ key, label }) => {
          const styles = getStylesForCategory(key);
          if (styles.length === 0) return null;
          const isExpanded = expandedCategory === key;
          const displayStyles = isExpanded ? styles : styles.slice(0, 4);

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </h3>
                {styles.length > 4 && (
                  <button
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                    onClick={() => setExpandedCategory(isExpanded ? null : key)}
                  >
                    {isExpanded ? "Show less" : "View all"}
                    <ChevronRight
                      className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {displayStyles.map((preset) => {
                  const isPresetActive = preset.id === activeStyleId;
                  return (
                  <button
                    key={preset.id}
                    onClick={() => handleStyleUpdate((s) => ({ ...s, styleId: preset.id }))}
                    className="w-full group flex flex-col items-center gap-1.5 text-left transition-all"
                  >
                    <div
                      style={{ width: "100%", aspectRatio: "16 / 10", minHeight: "84px" }}
                      className={`relative w-full rounded-xl overflow-hidden bg-zinc-950/95 dark:bg-zinc-950 border-2 transition-all shadow-xs ${
                        isPresetActive
                          ? "border-primary ring-2 ring-primary/25 shadow-sm"
                          : "border-border/60 group-hover:border-border group-hover:shadow-xs"
                      }`}
                    >
                      <StylePoster
                        style={preset}
                        sampleText={sampleText}
                        width={1080}
                        height={1920}
                      />
                      {isPresetActive && (
                        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground p-0.5 rounded-full z-10 shadow-sm">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium w-full truncate text-center transition-colors px-0.5 ${
                        isPresetActive
                          ? "text-primary font-semibold"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {preset.name}
                    </span>
                  </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  RENDER: EDIT TAB
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const renderEditTab = () => {
    let effectiveStyleState = { ...styleState };
    if (selectedCaptionId) {
      const seg = captions.find(c => c.id === selectedCaptionId);
      if (seg && seg.styleOverrides) {
        effectiveStyleState = { ...effectiveStyleState, ...seg.styleOverrides };
      }
    }

    const effectivePosition: CaptionPosition =
      positionScope === "segment"
        ? ((selectedSegment?.styleOverrides?.position as CaptionPosition | undefined) ||
          styleState.position ||
          DEFAULT_POSITION)
        : (styleState.position || DEFAULT_POSITION);
    const isPositionOverridden = Boolean(selectedSegment?.styleOverrides?.position);
    const hasAnyPositionOverrides = captions.some((c) => Boolean(c.styleOverrides?.position));

    return (
    <div className="space-y-5 pb-6 overflow-y-auto custom-scrollbar">
      {/* Segment mode indicator banner in Edit tab */}
      {selectedCaptionId && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs">
          <div className="flex flex-col">
            <span className="font-semibold text-primary">
              Editing Segment #{selectedSegmentIndex + 1}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {selectedSegment ? `${formatTime(selectedSegment.startMs)} - ${formatTime(selectedSegment.endMs)}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {selectedSegment?.styleOverrides && Object.keys(selectedSegment.styleOverrides).length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                {Object.keys(selectedSegment.styleOverrides).length} overrides
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={() => setSelectedCaptionId(null)}
              title="Switch to Global styles mode"
            >
              Switch to Global
            </Button>
          </div>
        </div>
      )}

      {/* TEXT section */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Text
        </h3>
        <div className="space-y-3">
          {/* Alignment */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground min-w-[60px]">Align</label>
            <div className="flex bg-secondary/50 rounded-md p-0.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  className={`p-1.5 rounded transition-colors ${effectiveStyleState.align === a ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, align: a }))}
                  title={a}
                >
                  {a === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                  {a === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                  {a === "right" && <AlignRight className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </div>
          {/* Letter Spacing */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Tracking</label>
            <Slider
              value={[effectiveStyleState.letterSpacing ?? 0]}
              onValueChange={([v]) => handleStyleUpdate((s) => ({ ...s, letterSpacing: v }), false)}
              onValueCommit={([v]) => handleStyleUpdate((s) => ({ ...s, letterSpacing: v }), true)}
              min={-2}
              max={10}
              step={0.5}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-6 text-right">
              {effectiveStyleState.letterSpacing ?? 0}
            </span>
          </div>
          {/* Word Spacing */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Word sp.</label>
            <Slider
              value={[effectiveStyleState.wordSpacing ?? 0]}
              onValueChange={([v]) => handleStyleUpdate((s) => ({ ...s, wordSpacing: v }), false)}
              onValueCommit={([v]) => handleStyleUpdate((s) => ({ ...s, wordSpacing: v }), true)}
              min={-2}
              max={10}
              step={0.5}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-6 text-right">
              {effectiveStyleState.wordSpacing ?? 0}
            </span>
          </div>
          {/* Line Spacing */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Line sp.</label>
            <Slider
              value={[effectiveStyleState.lineSpacing ?? 1]}
              onValueChange={([v]) => handleStyleUpdate((s) => ({ ...s, lineSpacing: v }), false)}
              onValueCommit={([v]) => handleStyleUpdate((s) => ({ ...s, lineSpacing: v }), true)}
              min={0.6}
              max={2}
              step={0.05}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-6 text-right">
              {(effectiveStyleState.lineSpacing ?? 1).toFixed(1)}
            </span>
          </div>
        </div>
      </section>

      {/* BEHIND HEAD OCCLUSION EFFECT */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {selectedCaptionId
                ? `Behind Head (Segment #${selectedSegmentIndex + 1})`
                : "Behind Head Effect"}
            </h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              3D Occlusion
            </span>
          </div>
          {selectedCaptionId && isBehindHeadOverridden && (
            <button
              onClick={() => handleResetBehindHead(selectedCaptionId)}
              className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
              title="Restore global inheritance for Behind Head"
            >
              <RotateCcw className="w-3 h-3" /> Reset to Global
            </button>
          )}
        </div>

        <div className="p-3 rounded-lg border bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-foreground cursor-pointer" htmlFor="behind-head-edit-toggle">
                Behind Head
              </label>
              <span className="text-[10px] text-muted-foreground">
                {selectedCaptionId
                  ? isBehindHeadOverridden
                    ? "Segment override active"
                    : `Inheriting global (${styleState.behindHead ? "Enabled" : "Disabled"})`
                  : "Sets default depth layer for all segments"}
              </span>
            </div>
            <Switch
              id="behind-head-edit-toggle"
              checked={
                selectedCaptionId
                  ? effectiveBehindHead
                  : (styleState.behindHead ?? false)
              }
              onCheckedChange={(checked) => {
                if (selectedCaptionId) {
                  handleSegmentBehindHeadChange(selectedCaptionId, checked);
                } else {
                  handleStyleUpdate((s) => ({ ...s, behindHead: checked }));
                  toast.success(`Behind Head default ${checked ? "enabled" : "disabled"} globally`);
                }
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed border-t border-border/40 pt-2">
            Captions appear behind the person's head and hair while remaining in front of the background. Freely drag or resize captions anywhere.
          </p>
        </div>
      </section>

      {/* POSITION & DIMENSIONS */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Position & Dimensions
            </h3>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${
                positionScope === "all"
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  : "bg-purple-500/15 text-purple-400 border border-purple-500/20"
              }`}
            >
              {positionScope === "all" ? (
                <>
                  <Globe className="w-2.5 h-2.5" /> All Captions
                </>
              ) : (
                <>
                  <Sparkles className="w-2.5 h-2.5" /> Segment #{selectedSegmentIndex + 1}
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {positionScope === "segment" && isPositionOverridden && (
              <button
                type="button"
                onClick={() => handleResetPosition(selectedCaptionId)}
                className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                title="Remove segment position override and inherit global position"
              >
                <RotateCcw className="w-3 h-3" /> Reset to Global
              </button>
            )}
            {positionScope === "all" && hasAnyPositionOverrides && (
              <button
                type="button"
                onClick={handleResetAllPositionsToGlobal}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 font-medium"
                title="Reset all individual segment position overrides so all captions inherit global position"
              >
                <RotateCcw className="w-3 h-3" /> Reset All to Global
              </button>
            )}
          </div>
        </div>

        {/* Scope Selector Control */}
        <div className="bg-muted/40 p-1 rounded-lg border border-border/40 mb-3 space-y-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setPositionScope("all")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                positionScope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
              title="Apply position changes to all captions inheriting global position"
            >
              <Globe className="w-3.5 h-3.5" />
              All Captions
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedCaptionId && captions.length > 0) {
                  setSelectedCaptionId(captions[0]?.id || null);
                }
                setPositionScope("segment");
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                positionScope === "segment"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
              title="Apply position changes only to this segment"
            >
              <Sparkles className="w-3.5 h-3.5" />
              This Segment
            </button>
          </div>
          <div className="px-1 text-[10px] text-muted-foreground/80 flex items-center justify-between">
            <span>
              {positionScope === "all"
                ? "Dragging or sliders update default position for all captions"
                : `Dragging or sliders affect only Segment #${selectedSegmentIndex + 1}`}
            </span>
            {positionScope === "segment" && (
              <span className={isPositionOverridden ? "text-purple-400 font-medium" : "text-muted-foreground"}>
                {isPositionOverridden ? "Custom override active" : "Inheriting global"}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {/* Quick Presets: Top / Center / Bottom */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Preset Placement</label>
            <div className="flex bg-secondary/50 rounded-md p-0.5">
              {[
                { label: "Top", y: 20 },
                { label: "Center", y: 50 },
                { label: "Bottom", y: 78 },
              ].map(({ label, y }) => {
                const currentY = effectivePosition.yPercent;
                const isSelectedPlacement = Math.abs(currentY - y) < 5;
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                return (
                  <button
                    key={label}
                    className={`flex-1 py-1 text-xs rounded transition-colors ${
                      isSelectedPlacement
                        ? "bg-background shadow-sm font-semibold text-foreground"
                        : "hover:bg-background/50 text-muted-foreground"
                    }`}
                    onClick={() => {
                      const newPos = { ...effectivePosition, yPercent: y };
                      handlePositionChange(newPos, targetPosId);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical Y Position Slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Vertical (Y)</label>
            <Slider
              value={[effectivePosition.yPercent ?? 78]}
              onValueChange={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange({ ...effectivePosition, yPercent: val ?? 78 }, targetPosId, false);
              }}
              onValueCommit={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange({ ...effectivePosition, yPercent: val ?? 78 }, targetPosId, true);
              }}
              min={5}
              max={95}
              step={1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
              {Math.round(effectivePosition.yPercent ?? 78)}%
            </span>
          </div>

          {/* Horizontal X Position Slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Horizontal (X)</label>
            <Slider
              value={[effectivePosition.xPercent ?? 50]}
              onValueChange={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange({ ...effectivePosition, xPercent: val ?? 50 }, targetPosId, false);
              }}
              onValueCommit={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange({ ...effectivePosition, xPercent: val ?? 50 }, targetPosId, true);
              }}
              min={10}
              max={90}
              step={1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
              {Math.round(effectivePosition.xPercent ?? 50)}%
            </span>
          </div>

          {/* Width % Slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Width</label>
            <Slider
              value={[effectivePosition.widthPercent ?? 80]}
              onValueChange={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange(
                  { ...effectivePosition, widthPercent: val ?? 80, isManualSizing: true },
                  targetPosId,
                  false
                );
              }}
              onValueCommit={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange(
                  { ...effectivePosition, widthPercent: val ?? 80, isManualSizing: true },
                  targetPosId,
                  true
                );
              }}
              min={30}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
              {Math.round(effectivePosition.widthPercent ?? 80)}%
            </span>
          </div>

          {/* Scale Multiplier Slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Scale</label>
            <Slider
              value={[effectivePosition.sizeMultiplier ?? 1]}
              onValueChange={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange(
                  { ...effectivePosition, sizeMultiplier: val ?? 1 },
                  targetPosId,
                  false
                );
              }}
              onValueCommit={([val]) => {
                const targetPosId = positionScope === "segment" ? selectedCaptionId : null;
                handlePositionChange(
                  { ...effectivePosition, sizeMultiplier: val ?? 1 },
                  targetPosId,
                  true
                );
              }}
              min={0.5}
              max={2.5}
              step={0.1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
              {(effectivePosition.sizeMultiplier ?? 1).toFixed(1)}×
            </span>
          </div>
        </div>
      </section>

      {/* NORMAL WORDS */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Normal Words
        </h3>
        <div className="space-y-3">
          {/* Font — only for social/business/retro */}
          {allowFontChange && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Font</label>
              <Select
                value={effectiveStyleState.normalFont || effectiveStyleState.fontFamilyOverride || style.tokens.fontFamily}
                onValueChange={(val) =>
                  handleStyleUpdate((s) => ({ ...s, normalFont: val, fontFamilyOverride: val }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Font" />
                </SelectTrigger>
                <SelectContent>
                  {allFonts.map((font) => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font.split(",")[0]?.replace(/['"]/g, "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Highlight</label>
            <Switch
              checked={effectiveStyleState.normalBackground !== false}
              onCheckedChange={(v) => handleStyleUpdate((s) => ({ ...s, normalBackground: v }))}
            />
          </div>
          {/* Normal word weight */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Weight</label>
            <div className="flex bg-secondary/50 rounded-md p-0.5 flex-1">
              <button
                className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                  (effectiveStyleState.normalWeight ?? style.tokens.weight) <= 400
                    ? "bg-background shadow-sm font-medium text-foreground"
                    : "hover:bg-background/50 text-muted-foreground"
                }`}
                onClick={() => handleStyleUpdate((s) => ({ ...s, normalWeight: 400 }))}
              >
                Normal
              </button>
              <button
                className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                  (effectiveStyleState.normalWeight ?? style.tokens.weight) === 600
                    ? "bg-background shadow-sm font-semibold text-foreground"
                    : "hover:bg-background/50 text-muted-foreground font-semibold"
                }`}
                onClick={() => handleStyleUpdate((s) => ({ ...s, normalWeight: 600 }))}
              >
                Semi
              </button>
              <button
                className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                  (effectiveStyleState.normalWeight ?? style.tokens.weight) >= 700
                    ? "bg-background shadow-sm font-bold text-foreground"
                    : "hover:bg-background/50 text-muted-foreground font-bold"
                }`}
                onClick={() => handleStyleUpdate((s) => ({ ...s, normalWeight: 700 }))}
              >
                Bold
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, normalColor: color }))}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                    ((effectiveStyleState as any).colorOverride || effectiveStyleState.normalColor || style.tokens.colorBase) === color
                      ? "border-primary scale-110 ring-1 ring-primary/40"
                      : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          {/* Normal word size */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Size ×</label>
            <Slider
              value={[effectiveStyleState.normalSizeMultiplier ?? 1]}
              onValueChange={([v]) => handleStyleUpdate((s) => ({ ...s, normalSizeMultiplier: v }), false)}
              onValueCommit={([v]) => handleStyleUpdate((s) => ({ ...s, normalSizeMultiplier: v }), true)}
              min={0.5}
              max={2}
              step={0.1}
              className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right">
              {(effectiveStyleState.normalSizeMultiplier ?? 1).toFixed(1)}×
            </span>
          </div>
        </div>
      </section>

      {/* CATCHY WORDS — for dynamic category and mixed-type styles */}
      {allowCatchyWords && (() => {
        const targetSegIndex = selectedSegmentIndex >= 0 ? selectedSegmentIndex : (captions.length > 0 ? 0 : -1);
        const wordsInfo = targetSegIndex >= 0 ? getSegmentWordsInfo(targetSegIndex) : [];
        const manualSelectedCount = wordsInfo.filter((w) => w.level > 0).length;
        const autoWord = wordsInfo.find((w) => w.isAuto)?.word;

        return (
          <section className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Catchy Words
                </h3>
                {selectedCaptionId && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    Seg #{selectedSegmentIndex + 1}
                  </span>
                )}
              </div>
              {selectedCaptionId && manualSelectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleClearSegmentCatchyWords(selectedSegmentIndex)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                  title="Clear manual emphasis and reset to auto-accent for this segment"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Auto
                </button>
              )}
            </div>

            {/* Auto-accent toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground cursor-pointer" htmlFor="auto-accent-edit">
                  Auto-accent words
                </label>
                <span className="text-[10px] text-muted-foreground/75">
                  Automatically accent key words if none are selected
                </span>
              </div>
              <Switch
                id="auto-accent-edit"
                checked={effectiveStyleState.autoAccent !== false}
                onCheckedChange={(v) => handleStyleUpdate((s) => ({ ...s, autoAccent: v }))}
              />
            </div>

            {/* Interactive Word Selector */}
            <div className="p-2.5 rounded-lg border bg-card/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-primary fill-primary/30" />
                  Select Words
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Click words to toggle
                </span>
              </div>

              {!selectedCaptionId ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Choose a subtitle segment to edit its catchy words:
                  </p>
                  <Select
                    value=""
                    onValueChange={(val) => {
                      setSelectedCaptionId(val);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select a segment to edit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {captions.map((c, i) => (
                        <SelectItem key={c.id || String(i)} value={c.id || String(i)}>
                          #{i + 1}: {c.text.length > 32 ? c.text.slice(0, 32) + "…" : c.text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {wordsInfo.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No words in this segment.</p>
                    ) : (
                      wordsInfo.map(({ word, globalIndex, level, isAuto }) => {
                        const isEmphasized = level > 0;
                        return (
                          <button
                            key={globalIndex}
                            type="button"
                            onClick={() => cycleEmphasis(globalIndex)}
                            title={
                              isEmphasized
                                ? `Level ${level} catchy word — Click to change or deselect`
                                : isAuto
                                  ? "Auto-accented word — Click to pin or customize"
                                  : "Click to select as catchy word"
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all select-none ${
                              isEmphasized
                                ? "bg-primary text-primary-foreground font-bold shadow-sm ring-1 ring-primary/40 hover:opacity-90 active:scale-95"
                                : isAuto
                                  ? "bg-primary/15 text-primary border border-dashed border-primary/50 font-semibold hover:bg-primary/25 active:scale-95"
                                  : "bg-secondary/60 hover:bg-secondary text-foreground hover:border-border border border-transparent active:scale-95"
                            }`}
                          >
                            {isEmphasized ? (
                              <span className="text-[10px]">★</span>
                            ) : isAuto ? (
                              <span className="text-[9px] font-mono opacity-80 uppercase tracking-tighter">auto</span>
                            ) : null}
                            <span>{word}</span>
                            {level > 1 && (
                              <span className="text-[9px] bg-background/25 px-1 rounded-full font-mono">
                                L{level}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer status & segment navigation */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground">
                    <span>
                      {manualSelectedCount > 0
                        ? `${manualSelectedCount} word${manualSelectedCount > 1 ? "s" : ""} selected`
                        : autoWord
                          ? `Auto-accent: "${autoWord}"`
                          : effectiveStyleState.autoAccent !== false
                            ? "Auto-accent on"
                            : "No catchy words active"}
                    </span>
                    {captions.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={selectedSegmentIndex <= 0}
                          onClick={() => setSelectedCaptionId(captions[selectedSegmentIndex - 1]?.id || null)}
                          className="hover:text-foreground disabled:opacity-30 disabled:pointer-events-none px-1"
                          title="Previous segment"
                        >
                          Prev
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          disabled={selectedSegmentIndex >= captions.length - 1}
                          onClick={() => setSelectedCaptionId(captions[selectedSegmentIndex + 1]?.id || null)}
                          className="hover:text-foreground disabled:opacity-30 disabled:pointer-events-none px-1"
                          title="Next segment"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Catchy Word Styling Controls */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Font</label>
              <Select
                value={
                  effectiveStyleState.catchyFont ||
                  effectiveStyleState.fontFamilyEmphasisOverride ||
                  style.tokens.fontFamilyEmphasis ||
                  style.tokens.fontFamily
                }
                onValueChange={(val) =>
                  handleStyleUpdate((s) => ({ ...s, catchyFont: val, fontFamilyEmphasisOverride: val }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Font" />
                </SelectTrigger>
                <SelectContent>
                  {allFonts.map((font) => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font.split(",")[0]?.replace(/['"]/g, "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Catchy word weight */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground min-w-[60px]">Weight</label>
              <div className="flex bg-secondary/50 rounded-md p-0.5 flex-1">
                <button
                  className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                    (effectiveStyleState.catchyWeight ?? style.tokens.weightEmphasis ?? 700) <= 400
                      ? "bg-background shadow-sm font-medium text-foreground"
                      : "hover:bg-background/50 text-muted-foreground"
                  }`}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, catchyWeight: 400 }))}
                >
                  Normal
                </button>
                <button
                  className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                    (effectiveStyleState.catchyWeight ?? style.tokens.weightEmphasis ?? 700) === 600
                      ? "bg-background shadow-sm font-semibold text-foreground"
                      : "hover:bg-background/50 text-muted-foreground font-semibold"
                  }`}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, catchyWeight: 600 }))}
                >
                  Semi
                </button>
                <button
                  className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                    (effectiveStyleState.catchyWeight ?? style.tokens.weightEmphasis ?? 700) >= 700
                      ? "bg-background shadow-sm font-bold text-foreground"
                      : "hover:bg-background/50 text-muted-foreground font-bold"
                  }`}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, catchyWeight: 700 }))}
                >
                  Bold
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleStyleUpdate((s) => ({ ...s, catchyColor: color }))}
                    className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                      ((effectiveStyleState as any).catchyColorOverride || effectiveStyleState.catchyColor || style.tokens.colorEmphasis) === color
                        ? "border-primary scale-110 ring-1 ring-primary/40"
                        : "border-border"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            {/* Size multiplier */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground min-w-[60px]">Size ×</label>
              <Slider
                value={[effectiveStyleState.catchySizeMultiplier ?? 1.5]}
                onValueChange={([v]) => handleStyleUpdate((s) => ({ ...s, catchySizeMultiplier: v }), false)}
                onValueCommit={([v]) => handleStyleUpdate((s) => ({ ...s, catchySizeMultiplier: v }), true)}
                min={1}
                max={3}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">
                {(effectiveStyleState.catchySizeMultiplier ?? 1.5).toFixed(1)}×
              </span>
            </div>
          </section>
        );
      })()}

      {/* SPOKEN WORD */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Spoken Word
        </h3>
        <div className="space-y-3">
          {/* Mode selector: None / Color / Box */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Highlight mode</label>
            <div className="flex bg-secondary/50 rounded-md p-0.5">
              {(["none", "color", "box"] as const).map((mode) => {
                const activeMode =
                  effectiveStyleState.spokenWord?.enabled !== true
                    ? "none"
                    : effectiveStyleState.spokenWord?.box
                      ? "box"
                      : "color";
                return (
                  <button
                    key={mode}
                    className={`flex-1 py-1 text-xs rounded transition-colors ${
                      activeMode === mode
                        ? "bg-background shadow-sm font-medium"
                        : "hover:bg-background/50 text-muted-foreground"
                    }`}
                    onClick={() => {
                      if (mode === "none") {
                        handleStyleUpdate((s) => ({
                          ...s,
                          spokenWord: { ...s.spokenWord, enabled: false, box: false },
                        }));
                      } else if (mode === "color") {
                        handleStyleUpdate((s) => ({
                          ...s,
                          spokenWord: { ...s.spokenWord, enabled: true, box: false },
                        }));
                      } else {
                        handleStyleUpdate((s) => ({
                          ...s,
                          spokenWord: { ...s.spokenWord, enabled: true, box: true },
                        }));
                      }
                    }}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Color picker — only when mode is color or box */}
          {effectiveStyleState.spokenWord?.enabled === true && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Highlight color</label>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      handleStyleUpdate((s) => ({
                        ...s,
                        spokenWord: { ...s.spokenWord, enabled: true, color },
                      }))
                    }
                    className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                      (effectiveStyleState.spokenWord?.color || style.tokens.colorActive) === color
                        ? "border-primary scale-110 ring-1 ring-primary/40"
                        : "border-border"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* LAYOUT */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Layout
        </h3>
        <div className="space-y-3">
          {/* Lines per caption */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground min-w-[60px]">Lines</label>
            <div className="flex bg-secondary/50 rounded-md p-0.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    (effectiveStyleState.linesPerCaption ?? 2) === n
                      ? "bg-background shadow-sm font-medium"
                      : "hover:bg-background/50 text-muted-foreground"
                  }`}
                  onClick={() => handleStyleUpdate((s) => ({ ...s, linesPerCaption: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/* Animation */}
          {(baseStyle.capabilities?.supportsWholeCaptionAnimation || baseStyle.capabilities?.supportsWordAnimation) ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Scope</label>
                <Select
                  value={effectiveStyleState.animationScope || (baseStyle.capabilities?.supportsWordAnimation ? "word" : "caption")}
                  onValueChange={(val) => handleStyleUpdate((s) => ({ ...s, animationScope: val as any }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {baseStyle.capabilities?.supportsWholeCaptionAnimation && <SelectItem value="caption">Whole Caption</SelectItem>}
                    {baseStyle.capabilities?.supportsWordAnimation && <SelectItem value="word">Word by Word</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Animation</label>
                <Select
                  value={effectiveStyleState.animation || "fade"}
                  onValueChange={(val) => handleStyleUpdate((s) => ({ ...s, animation: val as any }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["none", "rise", "fade", "pop", "typewriter", "write"].map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Animation</label>
              <Select
                value={effectiveStyleState.animation || "fade"}
                onValueChange={(val) => handleStyleUpdate((s) => ({ ...s, animation: val as any }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["none", "rise", "fade", "pop", "typewriter", "write"].map((a) => (
                    <SelectItem key={a} value={a}>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* Reset */}
      {selectedCaptionId ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => {
            const updated = captions.map((c) =>
              c.id === selectedCaptionId ? { ...c, styleOverrides: undefined } : c
            );
            setCaptions(updated);
            pushSnapshot(updated);
            toast.success("Reset segment overrides to global styles");
          }}
        >
          <RotateCcw className="w-3 h-3 mr-1.5" /> Reset segment to global styles
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => {
            const nextStyle: ProjectStyleState = {
              ...DEFAULT_STYLE_STATE,
              styleId: styleState.styleId,
              position: styleState.position,
            };
            setStyleState(nextStyle);
            pushSnapshot(captions, nextStyle);
            toast.success("Reset global styles to defaults");
          }}
        >
          <RotateCcw className="w-3 h-3 mr-1.5" /> Reset to style defaults
        </Button>
      )}
    </div>
  );
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  MAIN RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground overflow-hidden">
      {/* Login dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to Export</DialogTitle>
            <DialogDescription>
              To export or save your project permanently, you need to sign in or create a free
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowLoginDialog(false)}>
              Cancel
            </Button>
            <Button asChild>
              <Link to="/auth">Sign In / Sign Up</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* â”€â”€ TOP BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="flex-none flex items-center justify-between gap-2 border-b px-3 h-12 bg-background z-30">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="px-2 h-8">
            <Link to="/app">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          {editingTitle ? (
            <input
                autoFocus
                className="text-sm font-medium bg-transparent border-b border-primary outline-none px-1 py-0.5 max-w-[180px]"
                defaultValue={title}
                onBlur={(e) => handleRename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(e.currentTarget.value);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
          ) : (
            <button
              className="text-sm font-medium truncate max-w-[180px] hover:text-primary transition-colors"
              onClick={() => setEditingTitle(true)}
              title="Click to rename"
            >
              {title}
            </button>
          )}
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Saved</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Export dropdown */}
          <div className="relative">
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setExportOpen(!exportOpen)}
              disabled={captions.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
                  {(["mp4", "srt", "vtt", "json"] as const).map((f) => (
                    <button
                      key={f}
                      disabled={isExportingMP4}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                      onClick={() => handleExport(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {busy && (
        <div className="flex-none border-b px-4 py-2 bg-muted/30">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              {stage === "audio"
                ? "Extracting audio…"
                : stage === "transcribing"
                  ? "Transcribing…"
                  : "Detecting hooks…"}
            </span>
            <span>{progress}%</span>
          </div>
          <Progress value={stage === "emphasis" ? 100 : progress} className="h-1" />
        </div>
      )}

      {/* â”€â”€ MAIN CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT PANEL — desktop */}
        <aside
          className="hidden lg:flex flex-col border-r bg-card z-20 flex-shrink-0"
          style={{ width: panelWidth }}
        >
          {/* Panel header with underline tabs */}
          <div className="border-b px-3 pt-3 pb-0">
            <h2 className="font-semibold text-sm mb-2 px-1">Subtitles</h2>
            <div className="flex">
              {(["transcript", "styles", "edit"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
                    selectedTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                  onClick={() => setSelectedTab(tab)}
                >
                  {tab === "styles" ? "Style" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Banner: Global vs Segment */}
          {selectedCaptionId && selectedSegment ? (
            <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-primary/20 text-xs flex-shrink-0 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>Segment #{selectedSegmentIndex + 1}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({formatTime(selectedSegment.startMs)})
                </span>
              </div>
              <button
                onClick={() => setSelectedCaptionId(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
                title="Switch to Global styles mode"
              >
                Switch to Global
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/50 text-xs text-muted-foreground flex-shrink-0">
              <span className="text-[11px] font-medium flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-muted-foreground" />
                Global Styles Mode
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                All segments
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {selectedTab === "transcript" && renderTranscript()}
            {selectedTab === "styles" && renderStyles()}
            {selectedTab === "edit" && renderEditTab()}
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className="hidden lg:flex w-1 cursor-col-resize bg-border/30 hover:bg-primary/50 transition-colors flex-shrink-0 z-20"
          onMouseDown={handlePanelResizeStart}
        />

        {/* CENTER: Video */}
        <main className="flex-1 min-w-0 flex flex-col bg-muted/20">
          <section className="flex-1 min-h-0 relative flex items-center justify-center p-4 lg:p-6">
            
              <div 
                className="relative rounded-lg shadow-xl ring-1 ring-border/20 bg-black overflow-hidden flex items-center justify-center mx-auto"
                style={{ 
                  aspectRatio: (project.data?.width ?? 1080) / (project.data?.height ?? 1920),
                  maxHeight: "100%",
                  maxWidth: "100%",
                  height: ((project.data?.width ?? 1080) / (project.data?.height ?? 1920)) < 1 ? "100%" : "auto",
                  width: ((project.data?.width ?? 1080) / (project.data?.height ?? 1920)) >= 1 ? "100%" : "auto",
                }}
              >
              {videoUrl ? (
                <VideoPreview
                  videoSrc={videoUrl}
                  captions={captions}
                  emphasis={emphasis}
                  style={style}
                  position={styleState.position}
                  wordsPerLine={styleState.wordsPerLine}
                  width={project.data?.width ?? 1080}
                  height={project.data?.height ?? 1920}
                  isSelected={isCaptionSelected}
                  selectedCaptionId={selectedCaptionId}
                  onSelected={(id) => {
                    setSelectedCaptionId(id || null);
                  }}
                  onPositionChange={handlePositionChange}
                  styleState={styleState}
                  videoRef={videoRef}
                  positionScope={positionScope}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading video…
                </div>
              )}
            </div>
          </section>

          {/* Floating toolbar */}
          {isCaptionSelected && (
            <div
              data-floating-toolbar="true"
              className="hidden lg:flex absolute top-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-md rounded-full shadow-lg border border-border px-3 py-1 items-center gap-1.5 z-40 animate-in fade-in slide-in-from-top-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Alignment */}
              <div className="flex items-center gap-0.5 border-r border-border pr-1.5">
                {(["left", "center", "right"] as const).map((a) => {
                  const activeAlign = selectedSegment?.styleOverrides?.align || styleState.align || "center";
                  const isAct = activeAlign === a;
                  return (
                    <button
                      key={a}
                      className={`p-1.5 rounded-full transition-colors ${
                        isAct
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => handleStyleUpdate((s) => ({ ...s, align: a }))}
                      title={`Align ${a.charAt(0).toUpperCase() + a.slice(1)}`}
                    >
                      {a === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                      {a === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                      {a === "right" && <AlignRight className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

              {/* Behind Head toggle in floating toolbar */}
              <div className="flex items-center border-r border-border pr-1.5 gap-1">
                <button
                  className={`h-7 px-2.5 text-xs rounded-full transition-colors flex items-center gap-1 font-medium ${
                    effectiveBehindHead
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSegmentBehindHeadChange(selectedCaptionId!, !effectiveBehindHead);
                  }}
                  title={
                    isBehindHeadOverridden
                      ? `Behind Head (Segment Override: ${effectiveBehindHead ? "ON" : "OFF"})`
                      : `Behind Head (Inherited Global: ${effectiveBehindHead ? "ON" : "OFF"})`
                  }
                >
                  <Layers className="w-3.5 h-3.5" />
                  Behind Head
                  {isBehindHeadOverridden && (
                    <span className="text-[9px] opacity-80 font-normal">(Override)</span>
                  )}
                </button>

                {isBehindHeadOverridden && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetBehindHead(selectedCaptionId!);
                    }}
                    className="h-6 px-1.5 text-[10px] rounded-full text-primary hover:bg-primary/10 transition-colors flex items-center gap-0.5 font-medium ml-0.5"
                    title="Restore global inheritance for Behind Head"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset
                  </button>
                )}
              </div>

              {/* Position Scope Control in floating toolbar */}
              <div className="flex items-center border-r border-border pr-1.5">
                <div className="flex items-center bg-muted/60 rounded-full p-0.5 border border-border/40">
                  <button
                    type="button"
                    onClick={() => setPositionScope("all")}
                    className={`h-6 px-2 text-[11px] rounded-full transition-all flex items-center gap-1 font-medium ${
                      positionScope === "all"
                        ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Move caption box to reposition all captions globally"
                  >
                    <Globe className="w-3 h-3" />
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setPositionScope("segment")}
                    className={`h-6 px-2 text-[11px] rounded-full transition-all flex items-center gap-1 font-medium ${
                      positionScope === "segment"
                        ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Move caption box to reposition only this segment"
                  >
                    <Sparkles className="w-3 h-3" />
                    Segment
                  </button>
                </div>
              </div>

              {/* Reset to Global if overridden */}
              {selectedSegment?.styleOverrides?.position && (
                <div className="flex items-center border-r border-border pr-1.5">
                  <button
                    type="button"
                    onClick={() => handleResetPosition(selectedCaptionId)}
                    className="h-6 px-2 text-[11px] rounded-full text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 font-medium"
                    title="Remove custom position override and inherit global position"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Pos
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1">
                <Button
                  variant={selectedTab === "edit" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTab("edit");
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant={selectedTab === "styles" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTab("styles");
                  }}
                >
                  Styles
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2.5 rounded-full text-muted-foreground hover:text-foreground ml-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCaptionId(null);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {captions.length > 0 && (
            <Timeline 
              captions={captions}
              setCaptions={setCaptions}
              videoRef={videoRef}
              durationMs={(project.data?.duration_sec || 0) * 1000}
              selectedCaptionId={selectedCaptionId}
              onSelectCaption={(id) => {
                setSelectedCaptionId(id);
              }}
              onDeleteCaption={(id) => {
                const remaining = captions.filter((c) => c.id !== id);
                setCaptions(remaining);
                pushSnapshot(remaining);
                setSelectedCaptionId(null);
              }}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onHistoryCommit={(newCaps) => pushSnapshot(newCaps)}
            />
          )}
        </main>
      </div>

      {/* â”€â”€ MOBILE BOTTOM PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="lg:hidden flex flex-col border-t bg-card z-30">
        <div className="flex items-center border-b">
          <div className="flex items-center gap-1 px-2 py-2 flex-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs px-2"
              onClick={handleTranscribe}
              disabled={
                busy ||
                (isLocal ? !(project.data as any)?.video_blob : !(project.data as any)?.video_path)
              }
            >
              Transcribe
            </Button>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as typeof language)}
            >
              <SelectTrigger className="h-7 text-xs bg-secondary/50 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="hi">HI</SelectItem>
                <SelectItem value="hinglish">HG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex p-0.5 mr-2">
            {(["transcript", "styles", "edit"] as const).map((tab) => (
              <button
                key={tab}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  selectedTab === tab && mobilePanel
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  if (selectedTab === tab && mobilePanel) {
                    setMobilePanel(false);
                  } else {
                    setSelectedTab(tab);
                    setMobilePanel(true);
                  }
                }}
              >
                {tab === "styles" ? "Style" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {mobilePanel && (
          <div className="overflow-y-auto p-3 max-h-[45vh] custom-scrollbar animate-in slide-in-from-bottom-2 duration-200">
            {selectedTab === "transcript" && renderTranscript()}
            {selectedTab === "styles" && renderStyles()}
            {selectedTab === "edit" && renderEditTab()}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}













