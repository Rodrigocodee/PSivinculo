update public.usuarios
set modalidade_consulta = 'ambos'
where modalidade_consulta is null
   or modalidade_consulta = 'presencial_e_online';

alter table public.usuarios
  alter column modalidade_consulta set default 'ambos';

alter table public.usuarios
  drop constraint if exists usuarios_modalidade_consulta_check;

alter table public.usuarios
  add constraint usuarios_modalidade_consulta_check
  check (
    modalidade_consulta in ('presencial', 'online', 'ambos')
  );
