import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import { tmpdir } from "os";
import { Readable } from "stream";
import { finished } from "stream/promises";

const projectId = process.env.PROJECT_ID || process.argv[2];
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required parameters (PROJECT_ID, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log(`[Cloud Render Worker] Starting job for project: ${projectId}`);
  
  // Update status to Rendering
  await supabase.from("projects").update({ status: "Rendering" }).eq("id", projectId);

  // Fetch project row
  const { data: project, error: fetchErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (fetchErr || !project) {
    throw new Error(`Failed to load project details: ${fetchErr?.message}`);
  }

  console.log(`[Cloud Render Worker] Project "${project.title}" loaded. Video path: ${project.video_path}`);

  // Obtain signed download URL for source video
  const { data: signedData, error: signErr } = await supabase.storage
    .from("videos")
    .createSignedUrl(project.video_path, 3600);

  if (signErr || !signedData?.signedUrl) {
    throw new Error(`Failed to obtain source video signed URL: ${signErr?.message}`);
  }

  const uniqueId = Date.now();
  const tempWorkDir = path.join(tmpdir(), "captioncraft-cloud-render");
  if (!fs.existsSync(tempWorkDir)) {
    fs.mkdirSync(tempWorkDir, { recursive: true });
  }

  const localVideoPath = path.join(tempWorkDir, `source-${uniqueId}.mp4`);
  const outputLocation = path.join(tempWorkDir, `export-${uniqueId}.mp4`);

  try {
    console.log("[Cloud Render Worker] Downloading source video from Supabase Storage...");
    const res = await fetch(signedData.signedUrl);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download source video HTTP status: ${res.status}`);
    }

    const ws = fs.createWriteStream(localVideoPath);
    // @ts-ignore
    await finished(Readable.fromWeb(res.body).pipe(ws));
    console.log("[Cloud Render Worker] Source video downloaded to disk:", localVideoPath);

    // Inspect video metadata
    let videoMeta = null;
    try {
      videoMeta = await getVideoMetadata(localVideoPath);
    } catch (metaErr) {
      console.warn("[Cloud Render Worker] Could not extract video metadata via ffprobe:", metaErr);
    }

    const videoFps = videoMeta?.fps && videoMeta.fps > 0 ? videoMeta.fps : 30;
    const rawWidth = videoMeta?.width || project.width || 1080;
    const rawHeight = videoMeta?.height || project.height || 1920;
    const videoWidth = Math.floor(rawWidth / 2) * 2;
    const videoHeight = Math.floor(rawHeight / 2) * 2;

    const durationSec = videoMeta?.durationInSeconds || project.duration_sec || 10;
    const durationInFrames = Math.max(1, Math.round(durationSec * videoFps));

    console.log(`[Cloud Render Worker] Duration: ${durationSec}s (${durationInFrames} frames @ ${videoFps}fps), resolution: ${videoWidth}x${videoHeight}`);

    console.log("[Cloud Render Worker] Bundling Remotion project...");
    const bundleLocation = await bundle({
      entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    });

    const inputProps = {
      videoSrc: localVideoPath,
      captions: project.captions_json || [],
      emphasis: project.emphasis_json || {},
      style: project.style_json || {},
      position: project.style_json?.position || { xPercent: 50, yPercent: 50, widthPercent: 80 },
      wordsPerLine: project.style_json?.wordsPerLine || 4,
      styleOverrides: project.style_json || {},
      behindHeadMasks: {},
      durationInFrames,
      durationSec,
      fps: videoFps,
      width: videoWidth,
      height: videoHeight,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "CaptionedVideo",
      inputProps,
    });

    composition.durationInFrames = durationInFrames;
    composition.fps = videoFps;
    composition.width = videoWidth;
    composition.height = videoHeight;

    console.log("[Cloud Render Worker] Rendering media with Remotion on 16GB runner...");
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      crf: 16,
      x264Preset: "medium",
      pixelFormat: "yuv420p",
      imageFormat: "png",
      audioCodec: "aac",
      audioBitrate: "320k",
      scale: 1,
      outputLocation,
      inputProps,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    console.log("[Cloud Render Worker] Rendering completed. Uploading finished MP4 to Supabase Storage...");
    const fileBuffer = fs.readFileSync(outputLocation);
    const storagePath = `${project.user_id}/exports/export-${uniqueId}.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from("videos")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Failed to upload rendered video to Supabase Storage: ${uploadErr.message}`);
    }

    const readyStatus = `Ready:${storagePath}`;
    await supabase.from("projects").update({
      status: readyStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", projectId);

    console.log(`[Cloud Render Worker] SUCCESS! Status updated to "${readyStatus}"`);
  } finally {
    if (fs.existsSync(localVideoPath)) try { fs.unlinkSync(localVideoPath); } catch {}
    if (fs.existsSync(outputLocation)) try { fs.unlinkSync(outputLocation); } catch {}
  }
}

main().catch(async (err) => {
  console.error("[Cloud Render Worker] Error:", err);
  if (projectId) {
    await supabase.from("projects").update({
      status: `Error: ${err.message}`,
      updated_at: new Date().toISOString(),
    }).eq("id", projectId);
  }
  process.exit(1);
});
