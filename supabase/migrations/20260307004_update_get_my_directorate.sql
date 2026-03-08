-- Migration to update get_my_directorate to include directorates where the user is the manager_id

CREATE OR REPLACE FUNCTION public.get_my_directorate()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    -- If the user is defined as the manager of a directorate, that's their primary directorate
    (SELECT id FROM public.directorates WHERE manager_id = auth.uid() LIMIT 1),
    -- Otherwise, fall back to the profile's assigned directorate_id
    (SELECT directorate_id FROM public.profiles WHERE id = auth.uid())
  )
$function$;
