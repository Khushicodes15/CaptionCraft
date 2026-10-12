import { createServerFn } from "@tanstack/react-start";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";

export const renderMp4 = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    let localVideoPath = "";
    try {
      const uniqueId = Date.now();
      const tempVideoFilename = `temp-${uniqueId}.mp4`;
      localVideoPath = path.resolve(process.cwd(), "public", tempVideoFilename);

      console.log("Downloading source video to local disk to prevent FFmpeg remote streaming corruption...");
      const response = await fetch(data.videoUrl);
      if (!response.ok || !response.body) throw new Error("Failed to fetch video for rendering");
      
      const fileStream = fs.createWriteStream(localVideoPath);
      // @ts-ignore - node fetch streams are compatible enough
      await finished(Readable.fromWeb(response.body).pipe(fileStream));
      console.log("Video downloaded locally.");

      // Inspect source video for exact duration, frame rate, and dimensions
      let videoMeta: any = null;
      try {
        console.log("Extracting video metadata...");
        videoMeta = await getVideoMetadata(localVideoPath);
        console.log("Extracted video metadata:", {
          durationInSeconds: videoMeta?.durationInSeconds,
          fps: videoMeta?.fps,
          width: videoMeta?.width,
          height: videoMeta?.height,
        });
      } catch (metaErr) {
        console.warn("Could not extract metadata via getVideoMetadata:", metaErr);
      }

      // Prioritize actual source video metadata extracted from the file on disk
      const videoFps = videoMeta?.fps && videoMeta.fps > 0 ? videoMeta.fps : (data.fps || 30);
      const rawWidth = videoMeta?.width || data.width || 1080;
      const rawHeight = videoMeta?.height || data.height || 1920;
      // Ensure even dimensions for H.264 (yuv420p) compatibility
      const videoWidth = Math.floor(rawWidth / 2) * 2;
      const videoHeight = Math.floor(rawHeight / 2) * 2;

      // Priority for duration:
      // 1. Source video metadata duration (actual full video duration)
      // 2. data.duration_sec passed from project/client
      // 3. Caption timestamps endMs
      // 4. Default fallback
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

      console.log(`Resolved export duration: ${durationSec ?? (durationInFrames / videoFps)}s (${durationInFrames} frames @ ${videoFps}fps), resolution: ${videoWidth}x${videoHeight}`);

      console.log("Bundling Remotion project...");
      const bundleLocation = await bundle({
        entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
      });

      const inputProps = {
        videoSrc: tempVideoFilename,
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

      console.log("Selecting composition...");
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "CaptionedVideo",
        inputProps,
      });

      // Explicitly override composition properties to ensure full video duration and proper resolution
      composition.durationInFrames = durationInFrames;
      composition.fps = videoFps;
      composition.width = videoWidth;
      composition.height = videoHeight;

      const outputFilename = `render-${uniqueId}.mp4`;
      const outputLocation = path.resolve(process.cwd(), "public", outputFilename);

      console.log("Rendering media with high-quality settings (lossless PNG frames, CRF 16, x264Preset slow)...");
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        crf: 16,
        x264Preset: "slow",
        pixelFormat: "yuv420p",
        imageFormat: "png",
        audioCodec: "aac",
        audioBitrate: "320k",
        scale: 1,
        outputLocation,
        inputProps,
      });

      const base64 = fs.readFileSync(outputLocation).toString("base64");
      const dataUrl = `data:video/mp4;base64,${base64}`;
      fs.unlinkSync(outputLocation);
      if (fs.existsSync(localVideoPath)) fs.unlinkSync(localVideoPath);
      return { success: true, url: dataUrl };
    } catch (error: any) {
      console.error(error);
      if (localVideoPath && fs.existsSync(localVideoPath)) fs.unlinkSync(localVideoPath);
      return { success: false, error: error.message };
    }
  });
