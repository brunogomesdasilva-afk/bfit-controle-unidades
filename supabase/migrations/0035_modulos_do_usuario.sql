-- Módulos do usuário: o que cada um pode usar no sistema, marcado no cadastro de Usuários.
--   academia   = painel, academias, vendas, frequência, compras, manutenção, A.D.B, relatórios e clientes
--   rh         = menu RH
--   financeiro = menu Financeiro
--   adm        = Usuários e Backup (só junto com o acesso a todas as academias)
-- Quem já usa o sistema continua com o que tinha: administradores ficam com todos os módulos e os demais
-- com o módulo Academia.

alter table profiles add column if not exists modulos text[] not null default '{academia}';

alter table profiles drop constraint if exists profiles_modulos_check;
alter table profiles add constraint profiles_modulos_check
  check (modulos <@ array['academia', 'rh', 'financeiro', 'adm']::text[]);

update profiles set modulos = '{academia,rh,financeiro,adm}' where perfil = 'admin';

-- O usuário logado (ativo) tem este módulo?
create or replace function tem_modulo(m text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo and m = any (modulos));
$$;
revoke execute on function tem_modulo(text) from public;
grant execute on function tem_modulo(text) to authenticated;

-- Alterar usuários e liberar o sistema (backup) passam a exigir o módulo ADM, também no banco.
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update to authenticated
  using ((select is_admin()) and (select tem_modulo('adm')))
  with check ((select is_admin()) and (select tem_modulo('adm')));

drop policy if exists "sistema_estado_update" on sistema_estado;
create policy "sistema_estado_update" on sistema_estado for update to authenticated
  using ((select is_admin()) and (select tem_modulo('adm')))
  with check ((select is_admin()) and (select tem_modulo('adm')));

-- Usuário novo nasce com o módulo Academia (padrão da coluna); o e-mail do Bruno nasce administrador com todos.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email, perfil, modulos)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    case when lower(new.email) = 'brunogomesdasilva@gmail.com' then 'admin' else 'usuario' end,
    case when lower(new.email) = 'brunogomesdasilva@gmail.com' then '{academia,rh,financeiro,adm}'::text[] else '{academia}'::text[] end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
