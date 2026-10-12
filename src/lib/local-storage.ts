import { get, set, del } from "idb-keyval";
import type { Caption, EmphasisMap, ProjectStyleState } from "@/modules/styles/types";
import { DEFAULT_STYLE_STATE } from "@/modules/styles/types";

export type LocalProject = {
  id: "local";
  title: string;
  video_blob: Blob | null;
  width: number;
  height: number;
  duration_sec: number;
  captions_json: Caption[];
  emphasis_json: EmphasisMap;
  style_json: ProjectStyleState;
  language: "en" | "hi" | "hinglish";
  updated_at: string;
};

const LOCAL_PROJECT_KEY = "captioncraft_local_project";

export async function saveLocalProject(project: Partial<LocalProject>) {
  const existing = await getLocalProject();
  const next: LocalProject = {
    id: "local",
    title: project.title ?? existing?.title ?? "Untitled Video",
    video_blob:
      project.video_blob !== undefined ? project.video_blob : (existing?.video_blob ?? null),
    width: project.width ?? existing?.width ?? 1080,
    height: project.height ?? existing?.height ?? 1920,
    duration_sec: project.duration_sec ?? existing?.duration_sec ?? 10,
    captions_json: project.captions_json ?? existing?.captions_json ?? [],
    emphasis_json: project.emphasis_json ?? existing?.emphasis_json ?? {},
    style_json: project.style_json ?? existing?.style_json ?? DEFAULT_STYLE_STATE,
    language: project.language ?? existing?.language ?? "en",
    updated_at: new Date().toISOString(),
  };
  await set(LOCAL_PROJECT_KEY, next);
  return next;
}

export async function getLocalProject(): Promise<LocalProject | null> {
  const data = await get(LOCAL_PROJECT_KEY);
  if (!data) return null;
  return data as LocalProject;
}

export async function clearLocalProject() {
  await del(LOCAL_PROJECT_KEY);
}
