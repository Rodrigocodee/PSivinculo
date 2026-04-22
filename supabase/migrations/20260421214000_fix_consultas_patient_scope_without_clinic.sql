drop policy if exists consultas_scoped_select on public.consultas;
create policy consultas_scoped_select
  on public.consultas
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(consultas.paciente_id)
      or (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(consultas.psicologo_id)
    )
  );

drop policy if exists consultas_scoped_insert on public.consultas;
create policy consultas_scoped_insert
  on public.consultas
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      (
        exists (
          select 1
          from public.pacientes p
          where p.id = consultas.paciente_id
            and (
              p.id = auth.uid()
              or lower(coalesce(p.email, '')) = public.current_auth_email()
            )
            and p.psicologo_id is not distinct from consultas.psicologo_id
            and p.clinica_id is not distinct from consultas.clinica_id
        )
      )
      or (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(consultas.psicologo_id)
        and consultas.clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

drop policy if exists consultas_scoped_update on public.consultas;
create policy consultas_scoped_update
  on public.consultas
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(consultas.paciente_id)
      or (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(consultas.psicologo_id)
    )
  )
  with check (
    auth.uid() is not null
    and (
      (
        exists (
          select 1
          from public.pacientes p
          where p.id = consultas.paciente_id
            and (
              p.id = auth.uid()
              or lower(coalesce(p.email, '')) = public.current_auth_email()
            )
            and p.psicologo_id is not distinct from consultas.psicologo_id
            and p.clinica_id is not distinct from consultas.clinica_id
        )
      )
      or (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(consultas.psicologo_id)
        and consultas.clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );
