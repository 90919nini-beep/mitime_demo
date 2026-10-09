-- Email Marketing foundation, part 2: templates. A template is a named
-- kind of email (welcome, project_reminder, finished_project,
-- product_update, monthly_inspiration); each has zero or more localized
-- versions, one per language in profiles.lang's check constraint. Copy is
-- never hardcoded in an Edge Function -- it's managed data, editable from
-- Admin.
--
-- Admin-only end to end (Miiitime-owned content, same posture as
-- stitch_metadata) -- fail closed: no policy at all for anon, and no
-- INSERT/UPDATE/DELETE policy for any client role beyond is_staff('admin').
-- The generic audit_log_change() trigger (20260819091504 /
-- 20260819092359, parameterized by primary-key column name) covers both
-- tables automatically, same as stitch_metadata/error_logs.

begin;

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  lang text not null check (lang in ('en','fr','ja','zh','ko','es','de','th','pt','hi')),
  subject text not null check (char_length(subject) between 1 and 200),
  body_html text not null,
  body_text text,
  status text not null default 'draft' check (status in ('draft','active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (template_id, lang)
);
create index email_template_versions_template_id_idx on public.email_template_versions(template_id);

alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;

create policy email_templates_staff_all on public.email_templates
  for all using (public.is_staff(auth.uid(), 'admin')) with check (public.is_staff(auth.uid(), 'admin'));
create policy email_template_versions_staff_all on public.email_template_versions
  for all using (public.is_staff(auth.uid(), 'admin')) with check (public.is_staff(auth.uid(), 'admin'));

create trigger email_templates_audit
  after update on public.email_templates
  for each row execute function public.audit_log_change('id');
create trigger email_template_versions_audit
  after update on public.email_template_versions
  for each row execute function public.audit_log_change('id');

commit;
