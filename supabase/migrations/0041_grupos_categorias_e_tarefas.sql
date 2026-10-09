-- 1) Financeiro: grupos de categorias com cadastro próprio (ex.: "Custo com Operação" → Aluguel, Energia...).
create table if not exists fin_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('receita', 'despesa', 'transferencia')),
  ativo boolean not null default true,
  unique (nome, tipo)
);
alter table fin_grupos enable row level security;
drop policy if exists "fin_grupos_acesso" on fin_grupos;
create policy "fin_grupos_acesso" on fin_grupos for all to authenticated
  using ((select tem_modulo('financeiro'))) with check ((select tem_modulo('financeiro')));
drop policy if exists "manutencao_bloqueia" on fin_grupos;
create policy "manutencao_bloqueia" on fin_grupos as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- As categorias passam a apontar para o grupo (a tabela foi esvaziada para o novo cadastro).
delete from fin_categorias;
alter table fin_categorias drop column if exists grupo;
alter table fin_categorias add column if not exists grupo_id uuid not null references fin_grupos(id) on delete restrict;

-- A data de emissão da nota não é usada (a visão depende da coluna: é recriada logo abaixo).
drop view if exists fin_titulos_situacao;
alter table fin_titulos drop column if exists data_emissao;
create or replace view fin_titulos_situacao with (security_invoker = true) as
select
  t.*,
  coalesce(b.baixado, 0) as baixado,
  coalesce(b.pago, 0) as pago,
  b.ultima_baixa,
  greatest(t.valor - coalesce(b.baixado, 0), 0) as saldo,
  case
    when t.cancelado then 'cancelado'
    when coalesce(b.baixado, 0) >= t.valor then 'liquidado'
    when coalesce(b.baixado, 0) > 0 then 'parcial'
    when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    else 'aberto'
  end as situacao
from fin_titulos t
left join (
  select titulo_id, sum(valor + desconto) as baixado, sum(valor + juros + multa) as pago, max(data) as ultima_baixa
  from fin_baixas group by titulo_id
) b on b.titulo_id = t.id;

-- 2) Tarefas: grupos de usuários (ex.: Gerentes, Operacional). Tarefa de grupo aparece para cada membro, que marca
-- a sua. E tarefa cancelada (sai do cadastro e do checklist; fica no log).
create table if not exists tarefa_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  membros uuid[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table tarefa_grupos enable row level security;
drop policy if exists "tarefa_grupos_select" on tarefa_grupos;
create policy "tarefa_grupos_select" on tarefa_grupos for select to authenticated using (true);
drop policy if exists "tarefa_grupos_alterar" on tarefa_grupos;
create policy "tarefa_grupos_alterar" on tarefa_grupos for all to authenticated
  using ((select is_admin()) and (select tem_modulo('adm'))) with check ((select is_admin()) and (select tem_modulo('adm')));

alter table tarefas add column if not exists grupo_id uuid references tarefa_grupos(id) on delete restrict;
alter table tarefas add column if not exists cancelada_em timestamptz;
alter table tarefas add column if not exists cancelada_por uuid references profiles(id) on delete set null;
