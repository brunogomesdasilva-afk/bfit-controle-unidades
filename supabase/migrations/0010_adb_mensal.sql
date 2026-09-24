-- A.D.B (Avaliação de Desempenho) mensal, no formato da planilha "A.D.B 2026":
-- uma avaliação por funcionário por mês, 8 perguntas com nota de 1 a 5, as 3 perguntas abertas
-- (STOP, START, CONTINUE) e a nota final (média das 8), calculada pelo banco.
-- O questionário (professores ou recepção) vem do departamento do funcionário.
-- A versão anterior da tabela (cargo + nome, sem notas) não tinha nenhuma avaliação gravada.

drop table if exists avaliacoes_adb;

create table avaliacoes_adb (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  funcionario_id uuid not null references funcionarios(id) on delete restrict,
  -- Mês avaliado (sempre o dia 1 do mês)
  mes date not null check (extract(day from mes) = 1),
  questionario text not null check (questionario in ('professores', 'recepcao')),
  nota_1 smallint not null check (nota_1 between 1 and 5),
  nota_2 smallint not null check (nota_2 between 1 and 5),
  nota_3 smallint not null check (nota_3 between 1 and 5),
  nota_4 smallint not null check (nota_4 between 1 and 5),
  nota_5 smallint not null check (nota_5 between 1 and 5),
  nota_6 smallint not null check (nota_6 between 1 and 5),
  nota_7 smallint not null check (nota_7 between 1 and 5),
  nota_8 smallint not null check (nota_8 between 1 and 5),
  -- NOTA (Avaliação Desempenho): média das 8 perguntas
  media numeric generated always as (
    (nota_1 + nota_2 + nota_3 + nota_4 + nota_5 + nota_6 + nota_7 + nota_8)::numeric / 8
  ) stored,
  stop text,
  start text,
  continuar text,
  -- Avaliador: quem fez a avaliação (preenchido pelo sistema)
  criado_por uuid references profiles(id) on delete set null,
  atualizado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, mes)
);

create index idx_adb_academia_mes on avaliacoes_adb (academia_id, mes);

create trigger trg_avaliacoes_adb_updated_at before update on avaliacoes_adb
  for each row execute function set_updated_at();

-- Acesso: administrador vê tudo; usuário só a academia do seu acesso; excluir só o administrador.
alter table avaliacoes_adb enable row level security;
create policy "avaliacoes_adb_select" on avaliacoes_adb for select to authenticated
  using (is_admin() or academia_id = minha_academia());
create policy "avaliacoes_adb_insert" on avaliacoes_adb for insert to authenticated
  with check (is_admin() or academia_id = minha_academia());
create policy "avaliacoes_adb_update" on avaliacoes_adb for update to authenticated
  using (is_admin() or academia_id = minha_academia()) with check (is_admin() or academia_id = minha_academia());
create policy "avaliacoes_adb_delete" on avaliacoes_adb for delete to authenticated using (is_admin());
