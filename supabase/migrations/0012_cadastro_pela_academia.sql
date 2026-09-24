-- O usuário de uma academia também cuida do cadastro dela: funcionários e modalidades.
-- (Antes só o administrador podia incluir, alterar e excluir.) O cadastro das academias em si
-- (nome, área, custo, máquinas) continua só com o administrador.

drop policy if exists "funcionarios_write_admin" on funcionarios;
drop policy if exists "funcionarios_write" on funcionarios;
create policy "funcionarios_write" on funcionarios for all to authenticated
  using (is_admin() or academia_id = minha_academia())
  with check (is_admin() or academia_id = minha_academia());

drop policy if exists "modalidades_write_admin" on modalidades;
drop policy if exists "modalidades_write" on modalidades;
create policy "modalidades_write" on modalidades for all to authenticated
  using (is_admin() or academia_id = minha_academia())
  with check (is_admin() or academia_id = minha_academia());
