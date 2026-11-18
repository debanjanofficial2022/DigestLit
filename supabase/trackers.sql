-- Digestlit database, Phase 2: trackers.
--
-- A tracker is one research topic with its own keywords, schedule and reports.
-- Each person sees and changes only their own trackers. Run after schema.sql.
-- Safe to run more than once.

create table if not exists public.trackers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  question text not null check (char_length(question) between 1 and 1000),
  specific_asks text check (char_length(specific_asks) <= 1000),
  -- Keyword groups: a paper must match every group; terms within a group are alternatives.
  -- Stored as [["cobalt phthalocyanine","CoPc"],["CO2 reduction","CO2RR"]]
  keywords jsonb not null default '[]'::jsonb check (jsonb_typeof(keywords) = 'array' and jsonb_array_length(keywords) between 1 and 8),
  exclude_words text[] not null default '{}' check (cardinality(exclude_words) <= 30),
  baseline_dois text[] not null default '{}' check (cardinality(baseline_dois) <= 30),
  fields text[] not null default '{}' check (cardinality(fields) <= 26),
  venues text[] not null default '{}' check (cardinality(venues) <= 50),
  include_preprints boolean not null default true,
  cadence text not null default 'biweekly' check (cadence in ('weekly', 'biweekly')),
  run_day smallint not null default 1 check (run_day between 0 and 6), -- 0 = Sunday
  run_hour smallint not null default 2 check (run_hour between 0 and 23), -- in the owner's time zone
  paper_cap smallint not null default 25 check (paper_cap between 5 and 50),
  relevance_cutoff smallint not null default 40 check (relevance_cutoff between 0 and 100),
  report_depth text not null default 'short' check (report_depth in ('short', 'detailed')),
  status text not null default 'active' check (status in ('active', 'paused')),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trackers_owner on public.trackers (owner_id, created_at);

alter table public.trackers enable row level security;
revoke all on public.trackers from anon;
grant select, insert, update, delete on public.trackers to authenticated;

drop policy if exists "trackers: own" on public.trackers;
create policy "trackers: own" on public.trackers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop trigger if exists trackers_touch on public.trackers;
create trigger trackers_touch before update on public.trackers
  for each row execute function public.touch_updated_at();

-- At most 10 trackers per person (the free AI tier will allow 1, from Phase 3)
create or replace function public.trackers_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.trackers where owner_id = new.owner_id) >= 10 then
    raise exception 'You can have up to 10 trackers.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trackers_cap on public.trackers;
create trigger trackers_cap before insert on public.trackers
  for each row execute function public.trackers_cap();
