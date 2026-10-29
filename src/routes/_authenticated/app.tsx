import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { createProjectFromFile } from "@/modules/upload/upload";
import { getLocalProject, clearLocalProject } from "@/lib/local-storage";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Your projects — CaptionCraft" },
      { name: "description", content: "All your captioned video projects in one place." },
      { property: "og:title", content: "Your projects — CaptionCraft" },
      { property: "og:description", content: "All your captioned video projects in one place." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, title, created_at, duration_sec, captions_json, thumbnail_path, status, file_size_bytes",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const withUrls = await Promise.all(
        data.map(async (p) => {
          if (!p.thumbnail_path) return { ...p, thumbUrl: null };
          const { data: urlData } = await supabase.storage
            .from("videos")
            .createSignedUrl(p.thumbnail_path, 60 * 60);
          return { ...p, thumbUrl: urlData?.signedUrl };
        }),
      );
      return withUrls;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Get paths before deleting
      const { data: project } = await supabase
        .from("projects")
        .select("video_path, thumbnail_path")
        .eq("id", id)
        .single();
      if (project) {
        const paths = [];
        if (project.video_path) paths.push(project.video_path);
        if (project.thumbnail_path) paths.push(project.thumbnail_path);
        if (paths.length > 0) {
          await supabase.storage.from("videos").remove(paths);
        }
      }

      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const clearHistory = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      // Get all paths
      const { data: projects } = await supabase
        .from("projects")
        .select("video_path, thumbnail_path")
        .eq("user_id", data.user.id);
      if (projects && projects.length > 0) {
        const paths: string[] = [];
        projects.forEach((p) => {
          if (p.video_path) paths.push(p.video_path);
          if (p.thumbnail_path) paths.push(p.thumbnail_path);
        });

        // Supabase allows removing up to 100 files at once
        for (let i = 0; i < paths.length; i += 100) {
          await supabase.storage.from("videos").remove(paths.slice(i, i + 100));
        }
      }

      const { error } = await supabase.from("projects").delete().eq("user_id", data.user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleFile(file: File) {
    if (file.size > 500 * 1024 * 1024) {
      toast.error("That file is larger than 500MB.");
      return;
    }
    setUploading(true);
    const uploadToast = toast.loading(
      `Uploading ${file.name}… This may take a minute for larger videos.`,
    );
    try {
      const project = await createProjectFromFile(file);
      toast.dismiss(uploadToast);
      toast.success("Video uploaded successfully!");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/editor/$id", params: { id: project.id } });
    } catch (error) {
      toast.dismiss(uploadToast);
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    async function syncLocal() {
      const local = await getLocalProject();
      if (!local || !local.video_blob) return;

      try {
        toast.info("Syncing your recent project...");
        const project = await createProjectFromFile(local.video_blob as File);

        await supabase
          .from("projects")
          .update({
            captions_json: local.captions_json as any,
            emphasis_json: local.emphasis_json as any,
            style_json: local.style_json as any,
            language: local.language,
          })
          .eq("id", project.id);

        await clearLocalProject();
        toast.success("Project synced successfully!");
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        navigate({ to: "/editor/$id", params: { id: project.id } });
      } catch (e) {
        toast.error("Failed to sync local project.");
      }
    }
    syncLocal();
  }, [navigate, queryClient]);

  async function signOut() {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out error:", e);
    } finally {
      navigate({ to: "/auth", replace: true });
    }
  }

  const totalMb = projects.data
    ? Math.round(
        projects.data.reduce((acc, p) => acc + (p.file_size_bytes || 0), 0) / (1024 * 1024),
      )
    : 0;

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link to="/" className="text-lg font-bold tracking-tight">
          Caption<span className="text-primary">Craft</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your projects</h1>
            {projects.data && (
              <p className="mt-1 text-sm text-muted-foreground">
                {projects.data.length} / 5 projects · {totalMb} / 500 MB used
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {projects.data && projects.data.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Clear all history?")) clearHistory.mutate();
                }}
                disabled={clearHistory.isPending}
              >
                Clear history
              </Button>
            )}
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading || (projects.data && projects.data.length >= 5)}
            >
              {uploading ? "Uploading…" : "New video"}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </div>

        {uploading ? <Progress value={undefined} className="mt-6" /> : null}

        {projects.isLoading ? (
          <p className="mt-10 text-muted-foreground">Loading your projects…</p>
        ) : projects.error ? (
          <p className="mt-10 text-destructive">Could not load your projects. Please refresh.</p>
        ) : projects.data && projects.data.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((project) => (
              <li
                key={project.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                <Link
                  to="/editor/$id"
                  params={{ id: project.id }}
                  className="block aspect-video w-full bg-muted overflow-hidden"
                >
                  {project.thumbUrl ? (
                    <img
                      src={project.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      No thumbnail
                    </div>
                  )}
                </Link>
                <div className="p-3 bg-card z-10">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/editor/$id"
                      params={{ id: project.id }}
                      className="text-sm font-semibold truncate hover:text-primary flex-1"
                    >
                      {project.title}
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => remove.mutate(project.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                  <p className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {project.duration_sec ? `${Math.round(project.duration_sec)}s · ` : ""}
                      {Array.isArray(project.captions_json) && project.captions_json.length > 0
                        ? `${project.captions_json.length} words`
                        : project.status || "Uploaded"}
                    </span>
                    <span>{Math.round((project.file_size_bytes || 0) / (1024 * 1024))}MB</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              No projects yet. Upload an MP4, MOV or WebM up to 500MB to get started.
            </p>
            <Button
              className="mt-4"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              Upload a video
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
