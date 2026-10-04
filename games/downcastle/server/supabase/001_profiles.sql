-- DOWNCASTLE · cuentas (F3). Aplicada al proyecto Supabase «downcastle» (mkohmjfzuyxtpccvckub).

-- Perfil: un documento JSON por cuenta (misma forma que el perfil local, ver src/profile.js).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
create policy "perfil propio: leer" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "perfil propio: crear" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "perfil propio: actualizar" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Derechos (compras). Solo los escribe el backend de compras (service role, F6); el cliente solo lee los suyos.
create table public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sku text not null,
  source text not null default 'compra' check (source in ('compra', 'regalo')),
  platform text,
  created_at timestamptz not null default now(),
  unique (user_id, sku)
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon;
revoke insert, update, delete on public.entitlements from authenticated;
create policy "derechos propios: leer" on public.entitlements for select to authenticated using ((select auth.uid()) = user_id);
