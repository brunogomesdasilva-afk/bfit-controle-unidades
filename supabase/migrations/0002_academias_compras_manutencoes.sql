-- Academias e os controles ligados a cada uma: compras e manutenções.

create table if not exists academias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

-- Controle de compras
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data_solicitacao date not null default current_date,
  descricao text not null,
  necessario_ate date,
  data_efetivacao date,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Controle de manutenção
create table if not exists manutencoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  tipo text not null check (tipo in ('predial', 'preventiva', 'corretiva')),
  data_inclusao date not null default current_date,
  descricao text not null,
  data_finalizacao date,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compras_academia on compras(academia_id);
create index if not exists idx_manutencoes_academia on manutencoes(academia_id);

drop trigger if exists trg_compras_updated_at on compras;
create trigger trg_compras_updated_at
  before update on compras
  for each row execute function set_updated_at();

drop trigger if exists trg_manutencoes_updated_at on manutencoes;
create trigger trg_manutencoes_updated_at
  before update on manutencoes
  for each row execute function set_updated_at();

-- Acesso: todos os usuários logados leem; academias só o administrador cadastra/altera;
-- compras e manutenções qualquer usuário ativo lança e altera; excluir só o administrador.
alter table academias enable row level security;
alter table compras enable row level security;
alter table manutencoes enable row level security;

create or replace function is_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo);
$$;

revoke execute on function is_ativo() from public;
grant execute on function is_ativo() to authenticated;

drop policy if exists "academias_select" on academias;
create policy "academias_select" on academias for select to authenticated using (true);
drop policy if exists "academias_write_admin" on academias;
create policy "academias_write_admin" on academias for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "compras_select" on compras;
create policy "compras_select" on compras for select to authenticated using (true);
drop policy if exists "compras_insert" on compras;
create policy "compras_insert" on compras for insert to authenticated with check (is_ativo());
drop policy if exists "compras_update" on compras;
create policy "compras_update" on compras for update to authenticated using (is_ativo()) with check (is_ativo());
drop policy if exists "compras_delete" on compras;
create policy "compras_delete" on compras for delete to authenticated using (is_admin());

drop policy if exists "manutencoes_select" on manutencoes;
create policy "manutencoes_select" on manutencoes for select to authenticated using (true);
drop policy if exists "manutencoes_insert" on manutencoes;
create policy "manutencoes_insert" on manutencoes for insert to authenticated with check (is_ativo());
drop policy if exists "manutencoes_update" on manutencoes;
create policy "manutencoes_update" on manutencoes for update to authenticated using (is_ativo()) with check (is_ativo());
drop policy if exists "manutencoes_delete" on manutencoes;
create policy "manutencoes_delete" on manutencoes for delete to authenticated using (is_admin());
