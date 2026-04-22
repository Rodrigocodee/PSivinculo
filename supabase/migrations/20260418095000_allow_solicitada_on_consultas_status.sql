alter table public.consultas
  drop constraint if exists consultas_status_check;

alter table public.consultas
  add constraint consultas_status_check
  check (
    status in (
      'solicitada',
      'pendente',
      'confirmada',
      'cancelada',
      'realizada',
      'faltou',
      'reagendada'
    )
  );
