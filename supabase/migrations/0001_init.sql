-- BFIT - Controle de unidades: base de usuários (perfis, administrador, ativo/inativo).
-- As tabelas do negócio entram nas próximas migrations.

create extension if not exists "pgcrypto";

-- Perfis dos usuários (espelha auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  perfil text not null default 'usuario' check (perfil in ('admin', 'usuario')),
  ativo boolean not null default true,
  ativo_alterado_em timestamptz,
  ativo_alterado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- updated_at automático (para as tabelas que vierem a usar)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Cria o profile automaticamente quando um usuário é criado no Supabase Auth.
-- O e-mail do Bruno já nasce administrador.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    case when lower(new.email) = 'brunogomesdasilva@gmail.com' then 'admin' else 'usuario' end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Caso o usuário do Bruno já exista no Auth antes desta migration rodar
insert into profiles (id, nome, email, perfil)
select id, 'Bruno', email, 'admin' from auth.users where lower(email) = 'brunogomesdasilva@gmail.com'
on conflict (id) do update set perfil = 'admin';

-- Administrador ativo
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil = 'admin' and ativo);
$$;

revoke execute on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- profiles: todos leem (para mostrar nomes); só admin altera
alter table profiles enable row level security;

drop policy if exists "profiles_select_auth" on profiles;
create policy "profiles_select_auth" on profiles for select to authenticated using (true);
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update to authenticated
  using (is_admin()) with check (is_admin());
