-- Cadastros de cada academia (funcionários e modalidades), horários sempre de 30 em 30 minutos
-- e remoção do campo Auditoria do controle diário.

-- Funcionários
create table if not exists funcionarios (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  nome text not null,
  departamento text not null check (departamento in ('limpeza', 'recepcao', 'professores', 'estagiario')),
  horario_entrada time check (extract(minute from horario_entrada) in (0, 30)),
  horario_saida time check (extract(minute from horario_saida) in (0, 30)),
  genero text check (genero in ('masculino', 'feminino')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Modalidades oferecidas por cada academia (lista usada nas contagens de coletivas e de lutas)
create table if not exists modalidades (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists modalidades_nome_unico on modalidades (academia_id, lower(nome));

create index if not exists idx_funcionarios_academia on funcionarios(academia_id);

-- Os cadastros da academia seguem a regra do cadastro de academias: todos da academia leem,
-- só o administrador inclui, altera e exclui.
do $$
declare
  t text;
begin
  foreach t in array array['funcionarios', 'modalidades'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s for each row execute function set_updated_at()', t);
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on %1$s', t);
    execute format(
      'create policy "%1$s_select" on %1$s for select to authenticated using (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_write_admin" on %1$s', t);
    execute format(
      'create policy "%1$s_write_admin" on %1$s for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Horários das contagens de 30 em 30 minutos (08:00, 08:30, 09:00...)
alter table contagem_sala drop constraint if exists contagem_sala_horario_30min;
alter table contagem_sala add constraint contagem_sala_horario_30min
  check (extract(minute from horario) in (0, 30) and extract(second from horario) = 0);
alter table contagem_coletivas drop constraint if exists contagem_coletivas_horario_30min;
alter table contagem_coletivas add constraint contagem_coletivas_horario_30min
  check (extract(minute from horario) in (0, 30) and extract(second from horario) = 0);
alter table contagem_lutas drop constraint if exists contagem_lutas_horario_30min;
alter table contagem_lutas add constraint contagem_lutas_horario_30min
  check (extract(minute from horario) in (0, 30) and extract(second from horario) = 0);

-- Controle diário sem Auditoria
alter table controle_diario drop column if exists auditoria;
