alter table public.consultas
  add column if not exists valor_consulta numeric(10,2),
  add column if not exists duracao_consulta_min integer,
  add column if not exists local_presencial text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consultas_valor_consulta_check'
  ) then
    alter table public.consultas
      add constraint consultas_valor_consulta_check
      check (valor_consulta is null or valor_consulta >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'consultas_duracao_consulta_min_check'
  ) then
    alter table public.consultas
      add constraint consultas_duracao_consulta_min_check
      check (duracao_consulta_min is null or duracao_consulta_min > 0);
  end if;
end $$;
