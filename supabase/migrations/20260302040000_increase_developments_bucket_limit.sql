-- Aumentar limite do bucket 'developments' para 500 MB por arquivo.
-- Obs: o limite efetivo é o menor entre este valor e o do plano Supabase
-- (Free = 50 MB/arquivo | Pro = 5 GB/arquivo).
-- Para books de construtoras (PDFs grandes), o plano Pro é recomendado.

UPDATE storage.buckets
SET
  file_size_limit  = 524288000,   -- 500 MB
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/octet-stream'    -- fallback para PDFs sem MIME correto
  ]
WHERE id = 'developments';
