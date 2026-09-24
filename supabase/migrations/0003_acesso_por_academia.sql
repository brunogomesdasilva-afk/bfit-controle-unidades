-- Acesso por academia: o administrador vê todas; os demais usuários só a academia do seu perfil
-- (ex.: perfil "Continental" só vê e lança compras e manutenções da Continental).
-- Usuário que não é administrador e está sem academia não enxerga nada.

alter table profiles add column if not exists academia_id uuid references academias(id) on delete restrict;

create or replace function minha_academia()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academia_id from profiles where id = auth.uid() and ativo;
$$;

revoke execute on function minha_academia() from public;
grant execute on function minha_academia() to authenticated;

-- academias: admin vê todas; usuário só a dele
drop policy if exists "academias_select" on academias;
create policy "academias_select" on academias for select to authenticated
  using (is_admin() or id = minha_academia());

-- compras
drop policy if exists "compras_select" on compras;
create policy "compras_select" on compras for select to authenticated
  using (is_admin() or academia_id = minha_academia());
drop policy if exists "compras_insert" on compras;
create policy "compras_insert" on compras for insert to authenticated
  with check (is_admin() or academia_id = minha_academia());
drop policy if exists "compras_update" on compras;
create policy "compras_update" on compras for update to authenticated
  using (is_admin() or academia_id = minha_academia())
  with check (is_admin() or academia_id = minha_academia());

-- manutenções
drop policy if exists "manutencoes_select" on manutencoes;
create policy "manutencoes_select" on manutencoes for select to authenticated
  using (is_admin() or academia_id = minha_academia());
drop policy if exists "manutencoes_insert" on manutencoes;
create policy "manutencoes_insert" on manutencoes for insert to authenticated
  with check (is_admin() or academia_id = minha_academia());
drop policy if exists "manutencoes_update" on manutencoes;
create policy "manutencoes_update" on manutencoes for update to authenticated
  using (is_admin() or academia_id = minha_academia())
  with check (is_admin() or academia_id = minha_academia());
