-- Perfil "manutencao": entra no sistema e só vê (e lança/finaliza) as manutenções das unidades escolhidas para
-- ele, que podem ser várias. Recebe por WhatsApp e e-mail só as manutenções pendentes dessas unidades.

alter table profiles drop constraint if exists profiles_perfil_check;
alter table profiles add constraint profiles_perfil_check check (perfil in ('admin', 'usuario', 'manutencao'));
alter table profiles add column if not exists academias_manutencao uuid[] not null default '{}';

-- Unidades do usuário de manutenção logado (vazio para os outros perfis).
create or replace function minhas_academias_manutencao()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select academias_manutencao from profiles where id = auth.uid() and ativo and perfil = 'manutencao'), '{}');
$$;
revoke execute on function minhas_academias_manutencao() from public;
grant execute on function minhas_academias_manutencao() to authenticated;

-- Regras a mais (somam com as existentes): o usuário de manutenção vê as academias dele e as manutenções delas.
drop policy if exists "academias_select_manutencao" on academias;
create policy "academias_select_manutencao" on academias for select to authenticated
  using (id = any ((select minhas_academias_manutencao())));

drop policy if exists "manutencoes_select_manutencao" on manutencoes;
create policy "manutencoes_select_manutencao" on manutencoes for select to authenticated
  using (academia_id = any ((select minhas_academias_manutencao())));
drop policy if exists "manutencoes_insert_manutencao" on manutencoes;
create policy "manutencoes_insert_manutencao" on manutencoes for insert to authenticated
  with check (academia_id = any ((select minhas_academias_manutencao())));
drop policy if exists "manutencoes_update_manutencao" on manutencoes;
create policy "manutencoes_update_manutencao" on manutencoes for update to authenticated
  using (academia_id = any ((select minhas_academias_manutencao())))
  with check (academia_id = any ((select minhas_academias_manutencao())));
