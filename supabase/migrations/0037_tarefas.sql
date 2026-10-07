-- Checklist de tarefas dos usuários: ao entrar no sistema, cada usuário vê as tarefas do seu tipo de acesso que
-- ainda não marcou como feitas no período (no dia, para as diárias; no mês, para as mensais a partir do dia
-- escolhido). O que cada um marcou fica registrado (log de tarefas, no módulo ADM).

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  -- Quem vê: usuários com este módulo (vazio = todos os usuários).
  modulo text check (modulo in ('academia', 'rh', 'financeiro', 'adm')),
  -- false: administradores (acesso a todas as academias) não recebem a tarefa.
  incluir_admin boolean not null default false,
  -- diaria: todo dia; mensal: uma vez por mês, a partir do dia_inicio, até ser marcada.
  recorrencia text not null default 'diaria' check (recorrencia in ('diaria', 'mensal')),
  dia_inicio integer not null default 1 check (dia_inicio between 1 and 28),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tarefas_feitas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas(id) on delete restrict,
  usuario_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  -- Período em que foi feita: aaaa-mm-dd (diária) ou aaaa-mm (mensal).
  periodo text not null check (periodo ~ '^\d{4}-\d{2}(-\d{2})?$'),
  feita_em timestamptz not null default now(),
  unique (tarefa_id, usuario_id, periodo)
);
create index if not exists tarefas_feitas_feita_em on tarefas_feitas (feita_em desc);

-- Tarefas: todos leem (cada um vê as suas); só quem tem o módulo ADM cadastra e altera.
alter table tarefas enable row level security;
drop policy if exists "tarefas_select" on tarefas;
create policy "tarefas_select" on tarefas for select to authenticated using (true);
drop policy if exists "tarefas_insert" on tarefas;
create policy "tarefas_insert" on tarefas for insert to authenticated
  with check ((select is_admin()) and (select tem_modulo('adm')));
drop policy if exists "tarefas_update" on tarefas;
create policy "tarefas_update" on tarefas for update to authenticated
  using ((select is_admin()) and (select tem_modulo('adm')))
  with check ((select is_admin()) and (select tem_modulo('adm')));

-- Marcações: cada usuário marca e vê as suas; quem tem o módulo ADM vê todas (log). Não se apagam.
alter table tarefas_feitas enable row level security;
drop policy if exists "tarefas_feitas_select" on tarefas_feitas;
create policy "tarefas_feitas_select" on tarefas_feitas for select to authenticated
  using (usuario_id = (select auth.uid()) or ((select is_admin()) and (select tem_modulo('adm'))));
drop policy if exists "tarefas_feitas_insert" on tarefas_feitas;
create policy "tarefas_feitas_insert" on tarefas_feitas for insert to authenticated
  with check (usuario_id = (select auth.uid()));

-- Em manutenção (backup), só o administrador passa (mesma regra das outras tabelas).
drop policy if exists "manutencao_bloqueia" on tarefas;
create policy "manutencao_bloqueia" on tarefas as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));
drop policy if exists "manutencao_bloqueia" on tarefas_feitas;
create policy "manutencao_bloqueia" on tarefas_feitas as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- Primeira tarefa: nota do Gympass (Financeiro, sem administradores), todo mês a partir do dia 15.
insert into tarefas (titulo, descricao, modulo, incluir_admin, recorrencia, dia_inicio)
select 'Emiti a nota fiscal do Gympass deste mês',
       'Marque depois de emitir a nota do Gympass. A pergunta aparece todo mês a partir do dia 15, até ser marcada.',
       'financeiro', false, 'mensal', 15
where not exists (select 1 from tarefas where titulo = 'Emiti a nota fiscal do Gympass deste mês');
