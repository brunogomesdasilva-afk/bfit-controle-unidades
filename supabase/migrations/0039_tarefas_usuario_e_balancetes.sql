-- 1) Tarefas por USUÁRIO (não mais por módulo) e tarefa pontual (aparece a partir de uma data até ser feita, uma vez só).
alter table tarefas add column if not exists usuario_id uuid references profiles(id) on delete restrict;
alter table tarefas add column if not exists data_inicio date;
alter table tarefas drop constraint if exists tarefas_recorrencia_check;
alter table tarefas add constraint tarefas_recorrencia_check check (recorrencia in ('diaria', 'mensal', 'pontual'));
-- Período da marcação: aaaa-mm-dd (diária), aaaa-mm (mensal) ou 'unica' (pontual).
alter table tarefas_feitas drop constraint if exists tarefas_feitas_periodo_check;
alter table tarefas_feitas add constraint tarefas_feitas_periodo_check check (periodo ~ '^\d{4}-\d{2}(-\d{2})?$' or periodo = 'unica');

-- 2) Balancetes da contabilidade (menu Financeiro > Fechamento mensal): um arquivo por academia e período
-- (o primeiro de cada ano pode ser o acumulado de vários meses, ex.: jan a jul; depois, um por mês).
create table if not exists balancetes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  ano integer not null check (ano between 2000 and 2100),
  mes_inicio integer not null check (mes_inicio between 1 and 12),
  mes_fim integer not null check (mes_fim between 1 and 12),
  arquivo_nome text not null,
  importado_por uuid references profiles(id) on delete set null,
  importado_em timestamptz not null default now(),
  check (mes_fim >= mes_inicio),
  unique (academia_id, ano, mes_inicio, mes_fim)
);

-- Linhas do balancete como vieram da contabilidade (sintéticas e analíticas).
create table if not exists balancete_linhas (
  id bigint generated always as identity primary key,
  balancete_id uuid not null references balancetes(id) on delete cascade,
  ordem integer not null,
  conta text not null,
  descricao text not null,
  saldo_anterior numeric(16, 2) not null default 0,
  debito numeric(16, 2) not null default 0,
  credito numeric(16, 2) not null default 0,
  saldo_atual numeric(16, 2) not null default 0
);
create index if not exists balancete_linhas_balancete on balancete_linhas (balancete_id, ordem);

-- Acesso: módulo Financeiro da academia (administrador: todas). Reimportar um período apaga o anterior.
alter table balancetes enable row level security;
drop policy if exists "balancetes_select" on balancetes;
create policy "balancetes_select" on balancetes for select to authenticated using ((select pode_financeiro(academia_id)));
drop policy if exists "balancetes_insert" on balancetes;
create policy "balancetes_insert" on balancetes for insert to authenticated with check ((select pode_financeiro(academia_id)));
drop policy if exists "balancetes_delete" on balancetes;
create policy "balancetes_delete" on balancetes for delete to authenticated using ((select pode_financeiro(academia_id)));

alter table balancete_linhas enable row level security;
drop policy if exists "balancete_linhas_select" on balancete_linhas;
create policy "balancete_linhas_select" on balancete_linhas for select to authenticated
  using (exists (select 1 from balancetes b where b.id = balancete_id and (select pode_financeiro(b.academia_id))));
drop policy if exists "balancete_linhas_insert" on balancete_linhas;
create policy "balancete_linhas_insert" on balancete_linhas for insert to authenticated
  with check (exists (select 1 from balancetes b where b.id = balancete_id and (select pode_financeiro(b.academia_id))));

drop policy if exists "manutencao_bloqueia" on balancetes;
create policy "manutencao_bloqueia" on balancetes as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));
drop policy if exists "manutencao_bloqueia" on balancete_linhas;
create policy "manutencao_bloqueia" on balancete_linhas as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));
