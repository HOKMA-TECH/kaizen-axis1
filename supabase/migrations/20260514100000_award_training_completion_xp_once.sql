-- Award XP when a user completes a training, exactly once per user/training.
-- The UI already stores training_completions; this trigger converts that
-- completion into a user_points row using trainings.xp_reward.

-- Keep only one completion row per user/training before enforcing uniqueness.
DELETE FROM public.training_completions tc
USING public.training_completions newer
WHERE tc.user_id = newer.user_id
  AND tc.training_id = newer.training_id
  AND tc.ctid < newer.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS training_completions_once_per_user
ON public.training_completions (user_id, training_id);

-- Keep only one training XP row per user/training, even if old rows used
-- either "training" or "treinamento" as the source.
DELETE FROM public.user_points up
USING public.user_points newer
WHERE up.user_id = newer.user_id
  AND up.reference_id = newer.reference_id
  AND up.reference_id IS NOT NULL
  AND lower(coalesce(up.source, '')) IN ('training', 'treinamento')
  AND lower(coalesce(newer.source, '')) IN ('training', 'treinamento')
  AND up.ctid < newer.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS user_points_training_once_per_user
ON public.user_points (user_id, reference_id)
WHERE reference_id IS NOT NULL
  AND lower(coalesce(source, '')) IN ('training', 'treinamento');

CREATE OR REPLACE FUNCTION public.award_training_completion_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 0;
  v_training_title text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.training_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(t.xp_reward, 0), t.title
  INTO v_xp, v_training_title
  FROM public.trainings t
  WHERE t.id = NEW.training_id;

  IF coalesce(v_xp, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize by user/training so retries or simultaneous inserts cannot award twice.
  PERFORM pg_advisory_xact_lock(
    hashtext('training_xp_' || NEW.user_id::text || '_' || NEW.training_id::text)
  );

  INSERT INTO public.user_points (user_id, points, source, reference_id)
  SELECT NEW.user_id, v_xp, 'training', NEW.training_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_points existing
    WHERE existing.user_id = NEW.user_id
      AND existing.reference_id = NEW.training_id
      AND lower(coalesce(existing.source, '')) IN ('training', 'treinamento')
  )
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.system_events (type, user_id, payload)
    VALUES (
      'training_completed',
      NEW.user_id,
      jsonb_build_object(
        'training_id', NEW.training_id,
        'title', coalesce(v_training_title, 'Treinamento concluido'),
        'xp', v_xp
      )
    );

    PERFORM public.check_user_achievements(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_training_completion_xp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_training_completion_xp() TO authenticated;

DROP TRIGGER IF EXISTS trg_award_training_completion_xp ON public.training_completions;

CREATE TRIGGER trg_award_training_completion_xp
AFTER INSERT ON public.training_completions
FOR EACH ROW
EXECUTE FUNCTION public.award_training_completion_xp();
