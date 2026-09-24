-- Totais por academia num período (um dia ou um mês), usados no menu Relatórios.
-- As somas são feitas aqui no banco: as tabelas de passagens e Gympass são grandes demais para
-- trazer linha a linha para a tela. Roda com as permissões de quem pediu (security invoker):
-- o usuário de uma academia só recebe a linha da academia dele.

create or replace function relatorio_periodo(inicio date, fim date)
returns table (
  academia_id uuid,
  academia text,
  dias_lancados bigint,
  ativos_pagantes integer,
  visitas bigint,
  vendas bigint,
  inadimplentes integer,
  faturamento numeric,
  cancelamentos_solicitados bigint,
  cancelamentos_efetivados bigint,
  nps numeric,
  vendas_site bigint,
  nao_convertidas bigint,
  passagens bigint,
  gympass bigint,
  gympass_valor numeric,
  contagem_sala bigint,
  alunos_coletivas bigint,
  alunos_lutas bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.nome,
    (select count(*) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    -- Ativos pagantes e inadimplentes: o valor do último dia lançado no período
    (select d.ativos_pagantes from controle_diario d
      where d.academia_id = a.id and d.data between inicio and fim and d.ativos_pagantes is not null
      order by d.data desc limit 1),
    (select coalesce(sum(d.visitas), 0) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    (select coalesce(sum(d.vendas), 0) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    (select d.inadimplentes from controle_diario d
      where d.academia_id = a.id and d.data between inicio and fim and d.inadimplentes is not null
      order by d.data desc limit 1),
    (select coalesce(sum(d.faturamento), 0) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    (select coalesce(sum(d.cancelamentos_solicitados), 0) from controle_diario d
      where d.academia_id = a.id and d.data between inicio and fim),
    (select coalesce(sum(d.cancelamentos_efetivados), 0) from controle_diario d
      where d.academia_id = a.id and d.data between inicio and fim),
    (select round(avg(d.nps), 1) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    (select coalesce(sum(d.vendas_site), 0) from controle_diario d where d.academia_id = a.id and d.data between inicio and fim),
    (select count(*) from controle_conversao c where c.academia_id = a.id and c.data between inicio and fim),
    (select count(*) from passagens p where p.academia_id = a.id and p.data between inicio and fim),
    (select count(*) from gympass g where g.academia_id = a.id and g.data between inicio and fim),
    (select coalesce(sum(g.pagamento), 0) from gympass g where g.academia_id = a.id and g.data between inicio and fim),
    (select coalesce(sum(s.musculacao + s.cardio), 0) from contagem_sala s where s.academia_id = a.id and s.data between inicio and fim),
    (select coalesce(sum(c.quantidade), 0) from contagem_coletivas c where c.academia_id = a.id and c.data between inicio and fim),
    (select coalesce(sum(l.quantidade), 0) from contagem_lutas l where l.academia_id = a.id and l.data between inicio and fim)
  from academias a
  order by a.nome;
$$;

grant execute on function relatorio_periodo(date, date) to authenticated;
