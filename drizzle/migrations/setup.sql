-- 1. Create the storage bucket for videos and thumbnails
INSERT INTO storage.buckets (id, name, public) 
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Base projects table (from 0000)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled project',
  video_path TEXT,
  duration_sec DOUBLE PRECISION,
  width INTEGER,
  height INTEGER,
  language TEXT NOT NULL DEFAULT 'auto',
  captions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  emphasis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own projects" ON public.projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY "Users insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users update own projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users delete own projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS projects_user_id_created_at_idx ON public.projects (user_id, created_at DESC);

-- 3. Storage Policies (from 0001)
DO $$ BEGIN
  CREATE POLICY "Users read own videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "Users upload own videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "Users update own videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
  CREATE POLICY "Users delete own videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. History and Limits (from 0002)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Uploaded';

CREATE TABLE IF NOT EXISTS public.project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  captions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  emphasis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users access own project versions" ON public.project_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_versions.project_id
      AND projects.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS project_versions_project_id_created_at_idx ON public.project_versions (project_id, created_at DESC);

CREATE OR REPLACE FUNCTION check_project_limits()
RETURNS trigger AS $func$
DECLARE
  project_count INT;
  total_size BIGINT;
BEGIN
  SELECT count(*), coalesce(sum(file_size_bytes), 0) 
  INTO project_count, total_size 
  FROM public.projects 
  WHERE user_id = NEW.user_id;

  IF project_count >= 5 THEN
    RAISE EXCEPTION 'MAX_PROJECTS_REACHED';
  END IF;

  IF (total_size + coalesce(NEW.file_size_bytes, 0)) > (500 * 1024 * 1024) THEN
    RAISE EXCEPTION 'MAX_STORAGE_REACHED';
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_project_limits ON public.projects;
CREATE TRIGGER enforce_project_limits
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION check_project_limits();
