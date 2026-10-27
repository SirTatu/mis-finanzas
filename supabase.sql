-- Pegar completo en Supabase > SQL Editor > New query > Run

create table if not exists public.datos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  doc        jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Cada usuario solo puede ver y modificar SU fila.
alter table public.datos enable row level security;

create policy "ver mis datos" on public.datos
  for select using (auth.uid() = user_id);
create policy "crear mis datos" on public.datos
  for insert with check (auth.uid() = user_id);
create policy "actualizar mis datos" on public.datos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Guarda la fecha de la última modificación.
create or replace function public.tocar_fecha() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger datos_fecha before update on public.datos
  for each row execute function public.tocar_fecha();
