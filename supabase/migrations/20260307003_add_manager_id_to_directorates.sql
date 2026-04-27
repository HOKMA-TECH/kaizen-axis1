-- Migration to add manager_id to directorates table
ALTER TABLE public.directorates ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES auth.users(id);

-- Migration to add foreign key to allProfiles view if necessary
-- Note: the view or table underlying allProfiles may need manager_id, but users table holds it.
