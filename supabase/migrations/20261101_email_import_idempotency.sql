alter table public.gastos
  add column if not exists source_message_id text;

create unique index if not exists gastos_user_source_message_unique
  on public.gastos (user_id, source_message_id)
  where source_message_id is not null;
