import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Captions, Play, Sparkles, Upload, FileText, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { readVideoMeta } from "@/modules/transcribe/audio";
import { saveLocalProject } from "@/lib/local-storage";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CaptionCraft — animated captions in English & Hinglish" },
      {
        name: "description",
        content:
          "Upload a video, get word-perfect captions with animated VEED-style presets in English or Hinglish, then export SRT, VTT or JSON.",
      },
      { property: "og:title", content: "CaptionCraft — animated video captions" },
      {
        property: "og:description",
        content: "Word-level captions with animated presets, in English and Hinglish.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024 * 1024) {
      toast.error("That file is larger than 500MB.");
      return;
    }
    if (
      !["video/mp4", "video/quicktime", "video/webm"].includes(file.type) &&
      !/\.(mp4|mov|webm)$/i.test(file.name)
    ) {
      toast.error("Please choose an MP4, MOV or WebM video.");
      return;
    }

    setIsUploading(true);
    try {
      if (signedIn) {
        // Logged in: upload to Supabase directly
        const uploadToast = toast.loading(
          `Uploading ${file.name}… This may take a minute for larger videos.`,
        );
        try {
          const { createProjectFromFile } = await import("@/modules/upload/upload");
          const project = await createProjectFromFile(file);
          toast.dismiss(uploadToast);
          toast.success("Video uploaded!");
          navigate({ to: "/editor/$id", params: { id: project.id } });
        } catch (err: any) {
          toast.dismiss(uploadToast);
          throw err;
        }
      } else {
        // Anonymous: save locally
        toast.info("Preparing project...");
        const meta = await readVideoMeta(file);
        await saveLocalProject({
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Untitled project",
          video_blob: file,
          width: meta.width,
          height: meta.height,
          duration_sec: meta.durationSec,
        });
        navigate({ to: "/editor/$id", params: { id: "local" } });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to prepare video.");
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col selection:bg-primary/30 font-sans">
      {/* Top Banner */}
      <div className="w-full bg-foreground text-background py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium">
        <span>Finally, beautiful animated captions for social</span>
        <div className="w-5 h-5 bg-background text-foreground rounded-full flex items-center justify-center">
          <Sparkles className="w-3 h-3" />
        </div>
      </div>

      {/* Navbar */}
      <header className="flex-none w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto w-full max-w-7xl flex items-center justify-between h-16 px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Captions className="w-6 h-6 text-foreground" />
            <span
              className="text-xl font-bold tracking-tight text-foreground"
              style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.05em" }}
            >
              CAPTIONCRAFT
            </span>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {signedIn ? (
              <Button asChild size="sm" className="rounded-full">
                <Link to="/app">Open Studio</Link>
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex rounded-full"
                >
                  <Link to="/auth">Log in</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Link to="/auth">Sign Up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 min-h-0 mx-auto w-full max-w-5xl px-6 py-20 md:py-28 flex flex-col items-center text-center">
        <h1
          className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6 max-w-4xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          Captions that people actually watch
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl">
          Upload a clip and get word-by-word captions with animated presets. Support for English and
          Hinglish. Ready to export in standard formats in minutes.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-20">
          <Button
            asChild
            size="lg"
            className="rounded-full h-14 px-8 text-base bg-green-500 hover:bg-green-600 text-black border-none font-semibold shadow-lg shadow-green-500/20"
          >
            <Link to={signedIn ? "/app" : "/auth"}>
              <Play className="mr-2 h-5 w-5 fill-current" />
              Start Captioning
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="rounded-full h-14 px-8 text-base bg-muted hover:bg-muted/80 font-medium border border-border/50"
          >
            <Link to="/auth">
              <Sparkles className="mr-2 h-5 w-5" />
              View Demo
            </Link>
          </Button>
        </div>

        {/* Feature Box (replaces the card) */}
        <div className="w-full max-w-3xl rounded-3xl border bg-card p-2 md:p-4 shadow-xl">
          <div className="relative rounded-2xl border border-dashed border-muted-foreground/25 bg-muted/30 p-8 md:p-12 flex flex-col items-center justify-center gap-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              onChange={handleUpload}
              disabled={isUploading}
            />
            <div className="w-16 h-16 rounded-full bg-background border shadow-sm flex items-center justify-center">
              {isUploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-foreground"></div>
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {isUploading ? "Loading video..." : "Upload your video"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isUploading
                  ? "Preparing your project, this will just take a second."
                  : "Drag and drop your MP4, MOV or WebM file here, or click to browse. We'll handle the transcription automatically."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border text-xs font-medium text-muted-foreground">
                <FileText className="w-3.5 h-3.5" /> SRT Export
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border text-xs font-medium text-muted-foreground">
                <Captions className="w-3.5 h-3.5" /> Animated Presets
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border text-xs font-medium text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5" /> Catchy Word Detection
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
