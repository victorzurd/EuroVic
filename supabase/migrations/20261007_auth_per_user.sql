-- Ejecuta esto después de crear la cuenta Eurovic que recibirá los gastos existentes.
-- Sustituye el correo por el correo exacto de esa cuenta.

alter table public.gastos
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
declare
  owner_email text := 'victoretecalvogarcia@gmail.com';
  owner_id uuid;
begin
  select id into owner_id
  from auth.users
  where lower(email) = lower(owner_email)
  limit 1;

  if owner_id is null then
    raise exception 'No existe en auth.users una cuenta con el correo indicado: %', owner_email;
  end if;

  update public.gastos
  set user_id = owner_id
  where user_id is null;
end $$;

alter table public.gastos
  alter column user_id set not null;

create index if not exists gastos_user_id_fecha_idx
  on public.gastos (user_id, fecha desc);

alter table public.gastos enable row level security;

drop policy if exists "Cada usuario lee sus gastos" on public.gastos;
create policy "Cada usuario lee sus gastos"
  on public.gastos for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada usuario crea sus gastos" on public.gastos;
create policy "Cada usuario crea sus gastos"
  on public.gastos for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuario modifica sus gastos" on public.gastos;
create policy "Cada usuario modifica sus gastos"
  on public.gastos for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuario borra sus gastos" on public.gastos;
create policy "Cada usuario borra sus gastos"
  on public.gastos for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.gastos to authenticated;
