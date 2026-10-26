-- Mis finanzas: esquema mínimo de sincronización
-- Ejecutá todo este script en Supabase > SQL Editor > New query.
create table if not exists public.finanzas_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finanzas_data enable row level security;

drop policy if exists "Cada usuario lee sus propios datos" on public.finanzas_data;
create policy "Cada usuario lee sus propios datos"
  on public.finanzas_data for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada usuario inserta sus propios datos" on public.finanzas_data;
create policy "Cada usuario inserta sus propios datos"
  on public.finanzas_data for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuario actualiza sus propios datos" on public.finanzas_data;
create policy "Cada usuario actualiza sus propios datos"
  on public.finanzas_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
