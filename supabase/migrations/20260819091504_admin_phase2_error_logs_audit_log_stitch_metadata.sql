-- Phase 2 (Admin Web App) foundation tables.

begin;

-- ── error_logs ───────────────────────────────────────────────────────────
-- Insert-open (even pre-auth: a crash can happen before login), size-capped
-- against abuse of that open policy. Read/update restricted to staff.
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  error_type text not null,
  severity text not null check (severity in ('info','warning','error','fatal')),
  source text not null check (source in ('client','edge_function')),
  app_version text,
  user_id uuid references auth.users(id) on delete set null,
  context jsonb,
  message text not null check (char_length(message) <= 2000),
  stack text check (char_length(stack) <= 8000),
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);

alter table public.error_logs enable row level security;

create policy error_logs_insert_open on public.error_logs
  for insert with check (true);
create policy error_logs_select_staff on public.error_logs
  for select using (public.is_staff(auth.uid(), 'admin'));
create policy error_logs_update_staff on public.error_logs
  for update using (public.is_staff(auth.uid(), 'admin'))
  with check (public.is_staff(auth.uid(), 'admin'));

-- ── admin_audit_log ──────────────────────────────────────────────────────
-- Insert only via Edge Functions (service-role) or the generic trigger
-- below -- no client write path of any kind. Owner-only visibility.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy admin_audit_log_select_owner on public.admin_audit_log
  for select using (public.is_staff(auth.uid(), 'owner'));
-- Deliberately no insert/update/delete policy for any client role.

-- Generic diff-and-log trigger, reused by every admin-writable table so a
-- direct RLS-path edit (not just an Edge Function call) is always captured.
create or replace function public.audit_log_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
begin
  for v_key in select jsonb_object_keys(to_jsonb(new)) loop
    if to_jsonb(old) -> v_key is distinct from to_jsonb(new) -> v_key then
      v_before := v_before || jsonb_build_object(v_key, to_jsonb(old) -> v_key);
      v_after := v_after || jsonb_build_object(v_key, to_jsonb(new) -> v_key);
    end if;
  end loop;
  if v_before <> '{}'::jsonb then
    insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
    values (auth.uid(), TG_OP || '_' || TG_TABLE_NAME, TG_TABLE_NAME, (to_jsonb(new)->>'id'), v_before, v_after);
  end if;
  return new;
end;
$$;

-- ── stitch_metadata ──────────────────────────────────────────────────────
-- Cosmetic overlay only -- deliberately NO geometry/w/h/file/svg column
-- exists, so there is no schema path by which an admin edit here could
-- affect how any saved pattern renders. stitch_key matches the id already
-- hardcoded in index.html's KNIT_SYMS/STITCH_LIBRARY.
create table public.stitch_metadata (
  stitch_key text primary key,
  craft text not null check (craft in ('knit','crochet')),
  category text,
  display_name text not null,
  short_name text,
  description text,
  instructions text,
  status text not null default 'active' check (status in ('active','hidden','deprecated')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.stitch_metadata enable row level security;

create policy stitch_metadata_select_all on public.stitch_metadata
  for select using (true);
create policy stitch_metadata_update_staff on public.stitch_metadata
  for update using (public.is_staff(auth.uid(), 'admin'))
  with check (public.is_staff(auth.uid(), 'admin'));
-- No client insert/delete -- the row set is fixed at seed time; adding a
-- genuinely new stitch id is a code change (index.html), not an admin edit.

create trigger stitch_metadata_audit
  after update on public.stitch_metadata
  for each row execute function public.audit_log_change();

create trigger error_logs_audit
  after update on public.error_logs
  for each row execute function public.audit_log_change();

commit;
