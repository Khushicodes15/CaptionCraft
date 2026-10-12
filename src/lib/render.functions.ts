import { createServerFn } from "@tanstack/react-start";
import path from "path";
import fs from "fs";
import { tmpdir } from "os";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const renderMp4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => data)
  .handler(async ({ data, context }) => {
    let localVideoPath = "";
    let outputLocation = "";

    try {
      const userId = context.userId;
      if (!userId) {
        throw new Error("Unauthorized: Invalid user session.");
      }

      // Optional project ownership verification when a projectId is provided
      if (data.projectId && data.projectId !== "local") {
        try {
          const { data: proj, error: projErr } = await context.supabase
            .from("projects")
            .select("id")
            .eq("id", data.projectId)
            .eq("user_id", userId)
            .maybeSingle();

          if (projErr || !proj) {
            console.warn(`[renderMp4] Project verification warning for project ${data.projectId}:`, projErr?.message);
          }
        } catch (e) {
          console.warn("[renderMp4] Non-blocking project ownership check exception:", e);
        }
      }

      // Check if GitHub Actions 16GB Cloud Render Worker is configured
      const githubToken = process.env["GITHUB_DISPATCH_TOKEN"] || process.env["GITHUB_TOKEN"];
      const githubRepo = process.env["GITHUB_REPO"] || "Khushicodes15/CaptionCraft";

      if (githubToken && data.projectId && data.projectId !== "local") {
        console.log(`[renderMp4] Dispatching 16GB Cloud Render to GitHub Actions (${githubRepo})...`);
        try {
          const dispatchRes = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "CaptionCraft-Cloud",
            },
            body: JSON.stringify({
              event_type: "render-video",
              client_payload: {
                projectId: data.projectId,
              },
            }),
          });

          if (dispatchRes.ok || dispatchRes.status === 204) {
            console.log("[renderMp4] Successfully dispatched to GitHub Actions Cloud Worker!");
            return {
              success: true,
              pending: true,
              message: "Render queued on GitHub Actions (16 GB cloud runner).",
            };
          } else {
            const errText = await dispatchRes.text();
            console.warn("[renderMp4] GitHub Actions dispatch returned non-OK:", dispatchRes.status, errText);
          }
        } catch (dispatchErr) {
          console.warn("[renderMp4] Error dispatching to GitHub Actions:", dispatchErr);
        }
      }

      const uniqueId = Date.now();
      const tempWorkDir = path.join(tmpdir(), "captioncraft-renders");
      if (!fs.existsSync(tempWorkDir)) {
        fs.mkdirSync(tempWorkDir, { recursive: true });
      }

      const tempVideoFilename = `source-${uniqueId}.mp4`;
      localVideoPath = path.join(tempWorkDir, tempVideoFilename);

      console.log("[renderMp4] Downloading source video to local temp directory to prevent FFmpeg streaming stalls...");
      const response = await fetch(data.videoUrl);
      if (!response.ok || !response.body) {
        throw new Error("Failed to fetch video for rendering.");
      }

      const fileStream = fs.createWriteStream(localVideoPath);
      // @ts-ignore - node fetch streams are compatible enough
      await finished(Readable.fromWeb(response.body).pipe(fileStream));
      console.log("[renderMp4] Video downloaded to temp storage:", localVideoPath);

      // Inspect source video for exact duration, frame rate, and dimensions
      let videoMeta: any = null;
      const remotionRendererModule = "@remotion/renderer";
      const remotionBundlerModule = "@remotion/bundler";

      try {
        console.log("[renderMp4] Extracting video metadata...");
        const { getVideoMetadata }: any = await import(/* @vite-ignore */ remotionRendererModule);
        videoMeta = await getVideoMetadata(localVideoPath);
        console.log("[renderMp4] Extracted video metadata:", {
          durationInSeconds: videoMeta?.durationInSeconds,
          fps: videoMeta?.fps,
          width: videoMeta?.width,
          height: videoMeta?.height,
        });
      } catch (metaErr) {
        console.warn("[renderMp4] Could not extract metadata via getVideoMetadata:", metaErr);
      }

      // Prioritize actual source video metadata extracted from the file on disk
      const videoFps = videoMeta?.fps && videoMeta.fps > 0 ? videoMeta.fps : (data.fps || 30);
      const rawWidth = videoMeta?.width || data.width || 1080;
      const rawHeight = videoMeta?.height || data.height || 1920;
      // Ensure even dimensions for H.264 (yuv420p) compatibility
      const videoWidth = Math.floor(rawWidth / 2) * 2;
      const videoHeight = Math.floor(rawHeight / 2) * 2;

      const durationSec =
        videoMeta?.durationInSeconds && videoMeta.durationInSeconds > 0
          ? videoMeta.durationInSeconds
          : data.duration_sec && data.duration_sec > 0
            ? data.duration_sec
            : undefined;

      let durationInFrames: number;
      if (data.durationInFrames && data.durationInFrames > 0) {
        durationInFrames = data.durationInFrames;
      } else if (durationSec && durationSec > 0) {
        durationInFrames = Math.max(1, Math.round(durationSec * videoFps));
      } else if (Array.isArray(data.captions) && data.captions.length > 0) {
        const maxEndMs = Math.max(...data.captions.map((c: any) => c.endMs || 0));
        durationInFrames = maxEndMs > 0 ? Math.max(1, Math.ceil((maxEndMs / 1000) * videoFps)) : 300;
      } else {
        durationInFrames = 300;
      }

      console.log(`[renderMp4] Resolved export duration: ${durationSec ?? (durationInFrames / videoFps)}s (${durationInFrames} frames @ ${videoFps}fps), resolution: ${videoWidth}x${videoHeight}`);

      console.log("[renderMp4] Bundling Remotion project...");
      const { bundle }: any = await import(/* @vite-ignore */ remotionBundlerModule);
      const bundleLocation = await bundle({
        entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
      });

      const inputProps = {
        videoSrc: localVideoPath,
        captions: data.captions,
        emphasis: data.emphasis,
        style: data.style,
        position: data.position,
        wordsPerLine: data.wordsPerLine,
        styleOverrides: data.styleOverrides,
        behindHeadMasks: data.behindHeadMasks || {},
        durationInFrames,
        durationSec: durationSec ?? durationInFrames / videoFps,
        fps: videoFps,
        width: videoWidth,
        height: videoHeight,
      };

      console.log("[renderMp4] Selecting composition...");
      const { renderMedia, selectComposition }: any = await import(/* @vite-ignore */ remotionRendererModule);
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "CaptionedVideo",
        inputProps,
      });

      composition.durationInFrames = durationInFrames;
      composition.fps = videoFps;
      composition.width = videoWidth;
      composition.height = videoHeight;

      const outputFilename = `export-${uniqueId}.mp4`;
      outputLocation = path.join(tempWorkDir, outputFilename);

      console.log("[renderMp4] Rendering media with Remotion (CRF 16, x264Preset medium, lossless PNG frames)...");
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

      console.log("[renderMp4] Render complete. Uploading MP4 to private Supabase Storage...");
      const fileBuffer = fs.readFileSync(outputLocation);
      const storagePath = `${userId}/exports/export-${uniqueId}.mp4`;

      const { error: uploadError } = await context.supabase.storage
        .from("videos")
        .upload(storagePath, fileBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload rendered video to Supabase Storage: ${uploadError.message}`);
      }

      console.log("[renderMp4] Creating 24-hour signed download URL...");
      const { data: signData, error: signError } = await context.supabase.storage
        .from("videos")
        .createSignedUrl(storagePath, 60 * 60 * 24);

      if (signError || !signData?.signedUrl) {
        throw new Error(`Failed to generate signed download URL: ${signError?.message || "Unknown error"}`);
      }

      return { success: true, url: signData.signedUrl };
    } catch (error: any) {
      console.error("[renderMp4] Export failed:", error);
      return { success: false, error: error.message };
    } finally {
      // Clean up temporary files on disk unconditionally
      if (localVideoPath && fs.existsSync(localVideoPath)) {
        try { fs.unlinkSync(localVideoPath); } catch (e) { console.warn("[renderMp4] Could not remove temp source video:", e); }
      }
      if (outputLocation && fs.existsSync(outputLocation)) {
        try { fs.unlinkSync(outputLocation); } catch (e) { console.warn("[renderMp4] Could not remove temp output video:", e); }
      }
    }
  });
