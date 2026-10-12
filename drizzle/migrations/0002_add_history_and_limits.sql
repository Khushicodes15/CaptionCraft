-- Add new columns to projects for thumbnail, size and status
ALTER TABLE public.projects 
ADD COLUMN thumbnail_path TEXT,
ADD COLUMN file_size_bytes BIGINT DEFAULT 0,
ADD COLUMN status TEXT DEFAULT 'Uploaded';

-- Create project_versions table to store history
CREATE TABLE public.project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  captions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  emphasis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Setup permissions for project_versions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX project_versions_project_id_created_at_idx ON public.project_versions (project_id, created_at DESC);

-- Create a trigger function to enforce free-tier limits
CREATE OR REPLACE FUNCTION check_project_limits()
RETURNS trigger AS $$
DECLARE
  project_count INT;
  total_size BIGINT;
BEGIN
  -- Count only existing projects, don't include the NEW one yet (handled in >= condition)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on INSERT
CREATE TRIGGER enforce_project_limits
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION check_project_limits();
