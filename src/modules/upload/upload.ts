import { supabase } from "@/integrations/supabase/client";
import { readVideoMeta } from "@/modules/transcribe/audio";
import { DEFAULT_STYLE_STATE } from "@/modules/styles/types";

export const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"];

export type CreatedProject = { id: string };

export async function createProjectFromFile(file: File): Promise<CreatedProject> {
  if (file.size > MAX_BYTES) throw new Error("That file is larger than 500MB.");
  if (!ALLOWED.includes(file.type) && !/\.(mp4|mov|webm)$/i.test(file.name)) {
    throw new Error("Please choose an MP4, MOV or WebM video.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Please sign in again.");

  // Fast client-side limits check
  const { count } = await supabase.from("projects").select("*", { count: "exact", head: true });

  if (count && count >= 5) {
    throw new Error(
      "You have reached the free tier limit of 5 projects. Please clear some history.",
    );
  }

  const meta = await readVideoMeta(file);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const uuid = crypto.randomUUID();
  const path = `${userId}/${uuid}.${extension}`;
  const thumbPath = `${userId}/${uuid}_thumb.jpg`;

  // Generate thumbnail
  let thumbBlob: Blob | null = null;
  try {
    const videoURL = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = videoURL;
    video.muted = true;
    await new Promise((resolve, reject) => {
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };
      video.onseeked = resolve;
      video.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = (480 / video.videoWidth) * video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumbBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.7),
      );
    }
    URL.revokeObjectURL(videoURL);
  } catch (e) {
    console.warn("Could not generate thumbnail", e);
  }

  // Upload video
  const { error: uploadError } = await supabase.storage
    .from("videos")
    .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Upload thumbnail
  if (thumbBlob) {
    await supabase.storage
      .from("videos")
      .upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: false })
      .catch(() => console.warn("Thumb upload failed"));
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Untitled project",
      video_path: path,
      thumbnail_path: thumbBlob ? thumbPath : null,
      file_size_bytes: file.size,
      duration_sec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      style_json: DEFAULT_STYLE_STATE,
      status: "Uploaded",
    })
    .select("id")
    .single();

  if (error || !data) {
    await supabase.storage.from("videos").remove([path]);
    if (thumbBlob) await supabase.storage.from("videos").remove([thumbPath]);
    if (error?.message?.includes("MAX_PROJECTS_REACHED"))
      throw new Error("You have reached the free tier limit of 5 projects.");
    if (error?.message?.includes("MAX_STORAGE_REACHED"))
      throw new Error("You have reached the free tier limit of 500MB total storage.");
    throw new Error(`Could not create the project: ${error?.message ?? "unknown error"}`);
  }
  return { id: data.id };
}

export async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(path, 60 * 60 * 6);
  if (error || !data) throw new Error("Could not load the video file.");
  return data.signedUrl;
}
