-- KAI Knowledge Base (RAG) structure + retrieval RPC

create extension if not exists vector;

create table if not exists public.kai_knowledge_chunks (
  id bigserial primary key,
  source text not null default 'manual',
  volume smallint,
  bloco text,
  item_code text not null,
  question text,
  answer text not null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  search_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.kai_knowledge_chunks_refresh_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('portuguese', coalesce(new.question, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(new.answer, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(new.tags, '{}'), ' ')), 'C');

  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.kai_knowledge_chunks') is not null then
    execute 'drop trigger if exists kai_knowledge_chunks_refresh_tsv_trg on public.kai_knowledge_chunks';
  end if;
end $$;
create trigger kai_knowledge_chunks_refresh_tsv_trg
before insert or update of question, answer, tags
on public.kai_knowledge_chunks
for each row
execute function public.kai_knowledge_chunks_refresh_tsv();

create unique index if not exists kai_knowledge_chunks_item_code_uq
  on public.kai_knowledge_chunks (item_code);

create index if not exists kai_knowledge_chunks_search_tsv_idx
  on public.kai_knowledge_chunks using gin (search_tsv);

create index if not exists kai_knowledge_chunks_tags_idx
  on public.kai_knowledge_chunks using gin (tags);

-- Optional semantic retrieval (works when embeddings are populated)
create index if not exists kai_knowledge_chunks_embedding_idx
  on public.kai_knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.kai_knowledge_chunks enable row level security;

drop policy if exists kai_knowledge_select_auth on public.kai_knowledge_chunks;
create policy kai_knowledge_select_auth
  on public.kai_knowledge_chunks
  for select
  to authenticated
  using (true);

create or replace function public.match_kai_knowledge(
  query_text text,
  match_count integer default 8,
  query_embedding vector(1536) default null
)
returns table (
  id bigint,
  item_code text,
  volume smallint,
  bloco text,
  question text,
  answer text,
  tags text[],
  score double precision
)
language plpgsql
stable
as $$
declare
  cleaned_query text := trim(coalesce(query_text, ''));
  q tsquery;
  limit_rows integer := greatest(1, coalesce(match_count, 8));
begin
  if cleaned_query = '' then
    return query
      select k.id, k.item_code, k.volume, k.bloco, k.question, k.answer, k.tags, 0.01::double precision as score
      from public.kai_knowledge_chunks k
      order by k.updated_at desc
      limit limit_rows;
    return;
  end if;

  q := websearch_to_tsquery('portuguese', cleaned_query);

  return query
  with lexical as (
    select
      k.id,
      k.item_code,
      k.volume,
      k.bloco,
      k.question,
      k.answer,
      k.tags,
      ts_rank_cd(k.search_tsv, q)::double precision as lexical_score,
      0::double precision as semantic_score
    from public.kai_knowledge_chunks k
    where k.search_tsv @@ q
    order by lexical_score desc
    limit greatest(limit_rows * 4, 16)
  ),
  semantic as (
    select
      k.id,
      k.item_code,
      k.volume,
      k.bloco,
      k.question,
      k.answer,
      k.tags,
      0::double precision as lexical_score,
      (1 - (k.embedding <=> query_embedding))::double precision as semantic_score
    from public.kai_knowledge_chunks k
    where query_embedding is not null
      and k.embedding is not null
    order by k.embedding <=> query_embedding
    limit greatest(limit_rows * 4, 16)
  ),
  merged as (
    select
      x.id,
      x.item_code,
      x.volume,
      x.bloco,
      x.question,
      x.answer,
      x.tags,
      max(x.lexical_score) as lexical_score,
      max(x.semantic_score) as semantic_score
    from (
      select * from lexical
      union all
      select * from semantic
    ) x
    group by x.id, x.item_code, x.volume, x.bloco, x.question, x.answer, x.tags
  ),
  ranked as (
    select
      m.id,
      m.item_code,
      m.volume,
      m.bloco,
      m.question,
      m.answer,
      m.tags,
      case
        when query_embedding is null then m.lexical_score
        else ((m.lexical_score * 0.45) + (m.semantic_score * 0.55))
      end as score
    from merged m
  )
  select
    r.id,
    r.item_code,
    r.volume,
    r.bloco,
    r.question,
    r.answer,
    r.tags,
    r.score
  from ranked r
  order by r.score desc nulls last, r.id desc
  limit limit_rows;

  if not found then
    return query
      select k.id, k.item_code, k.volume, k.bloco, k.question, k.answer, k.tags, 0.01::double precision as score
      from public.kai_knowledge_chunks k
      order by k.updated_at desc
      limit limit_rows;
  end if;
end;
$$;

grant execute on function public.match_kai_knowledge(text, integer, vector) to authenticated;
