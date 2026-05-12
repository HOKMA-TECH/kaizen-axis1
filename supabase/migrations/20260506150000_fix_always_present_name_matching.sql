-- ============================================================
-- HOTFIX: CORRIGE MATCH DE NOMES COM ACENTOS (ALWAYS PRESENT)
-- Migration: 20260506150000_fix_always_present_name_matching.sql
-- ============================================================

WITH target_names AS (
  SELECT unnest(ARRAY[
    'GUSTAVO MACIEL',
    'BRENER RIBEIRO DE SOUZA',
    'ANDREY GUIMARAES MUNIZ',
    'PABLO ALCANTARA',
    'LUIZA MONTTEIRO',
    'BRUNO RIBEIRO DE SOUZA',
    'EVERSON DIEGO SANTOS DA SILVA',
    'MAICON OLIVEIRA'
  ]) AS normalized_name
), matched_profiles AS (
  SELECT p.id
  FROM public.profiles p
  JOIN target_names t
    ON UPPER(
      TRANSLATE(
        TRIM(COALESCE(p.name, '')),
        'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )
    ) = t.normalized_name
)
INSERT INTO public.checkin_always_present_users (user_id, enabled, start_date)
SELECT mp.id, TRUE, CURRENT_DATE
FROM matched_profiles mp
ON CONFLICT (user_id) DO UPDATE
SET enabled = TRUE,
    start_date = LEAST(public.checkin_always_present_users.start_date, EXCLUDED.start_date),
    updated_at = NOW();
