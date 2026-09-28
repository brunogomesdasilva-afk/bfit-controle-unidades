-- Backup pelo sistema e modo manutenção.
--
-- Enquanto o backup roda, o sistema fica "em manutenção": só o administrador acessa. As regras de acesso
-- abaixo (restritivas) garantem isso também no banco: ninguém além do administrador lê ou grava nada.
-- O pacote do backup fica numa pasta privada do armazenamento (só as 2 últimas cópias).

create table if not exists sistema_estado (
  id smallint primary key default 1 check (id = 1),
  manutencao boolean not null default false,
  motivo text,
  iniciado_por uuid references profiles(id) on delete set null,
  iniciado_em timestamptz
);
insert into sistema_estado (id) values (1) on conflict (id) do nothing;

alter table sistema_estado enable row level security;
drop policy if exists "sistema_estado_select" on sistema_estado;
create policy "sistema_estado_select" on sistema_estado for select to authenticated using (true);
drop policy if exists "sistema_estado_update" on sistema_estado;
create policy "sistema_estado_update" on sistema_estado for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create or replace function em_manutencao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select manutencao from sistema_estado where id = 1), false);
$$;
revoke execute on function em_manutencao() from public;
grant execute on function em_manutencao() to authenticated;

-- Regra restritiva em todas as tabelas de dados: em manutenção, só o administrador passa.
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname not in ('sistema_estado', 'profiles')
  loop
    execute format('drop policy if exists "manutencao_bloqueia" on %I', t);
    execute format(
      'create policy "manutencao_bloqueia" on %I as restrictive for all to authenticated '
      'using (not (select em_manutencao()) or (select is_admin())) '
      'with check (not (select em_manutencao()) or (select is_admin()))', t);
  end loop;
end $$;

-- Pasta privada dos pacotes de backup (acesso só pelo servidor do sistema, com a chave de serviço).
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 52428800) -- até 50 MB por arquivo
on conflict (id) do nothing;
