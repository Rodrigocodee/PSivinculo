create or replace function public.mark_all_my_notifications_as_read()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao foi possivel identificar o usuario autenticado para marcar notificacoes como lidas.';
  end if;

  return query
    update public.notificacoes n
       set lida = true
     where n.usuario_id_destino = auth.uid()
       and n.lida = false
    returning n.id;
end;
$$;

create or replace function public.clear_my_notifications()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao foi possivel identificar o usuario autenticado para limpar notificacoes.';
  end if;

  return query
    delete from public.notificacoes n
     where n.usuario_id_destino = auth.uid()
    returning n.id;
end;
$$;

grant execute on function public.mark_all_my_notifications_as_read() to authenticated;
grant execute on function public.clear_my_notifications() to authenticated;
