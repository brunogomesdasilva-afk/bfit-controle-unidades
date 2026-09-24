-- Controle de vendas: visitas que não viraram venda e o motivo.
-- Avaliação de desempenho: A.D.B (cargo e funcionário avaliado).
-- Novos departamentos: professor de coletivas, professor de lutas e gerente.

alter table funcionarios drop constraint if exists funcionarios_departamento_check;
alter table funcionarios add constraint funcionarios_departamento_check check (
  departamento in ('gerente', 'recepcao', 'professores', 'professor_coletivas', 'professor_lutas', 'estagiario', 'limpeza')
);

create table if not exists controle_conversao (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  visita text not null,
  motivo text,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists avaliacoes_adb (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  data date not null,
  cargo text not null check (
    cargo in ('gerente', 'recepcao', 'professores', 'professor_coletivas', 'professor_lutas', 'estagiario', 'limpeza')
  ),
  funcionario_id uuid not null references funcionarios(id) on delete restrict,
  -- Quem fez a avaliação (preenchido pelo sistema com o usuário logado)
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversao_academia_data on controle_conversao(academia_id, data);
create index if not exists idx_adb_academia_data on avaliacoes_adb(academia_id, data);

-- Mesmas regras dos demais lançamentos: administrador vê tudo; usuário só a academia do seu acesso;
-- excluir só o administrador.
do $$
declare
  t text;
begin
  foreach t in array array['controle_conversao', 'avaliacoes_adb'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s for each row execute function set_updated_at()', t);
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on %1$s', t);
    execute format(
      'create policy "%1$s_select" on %1$s for select to authenticated using (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_insert" on %1$s', t);
    execute format(
      'create policy "%1$s_insert" on %1$s for insert to authenticated with check (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_update" on %1$s', t);
    execute format(
      'create policy "%1$s_update" on %1$s for update to authenticated using (is_admin() or academia_id = minha_academia()) with check (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_delete" on %1$s', t);
    execute format('create policy "%1$s_delete" on %1$s for delete to authenticated using (is_admin())', t);
  end loop;
end $$;
