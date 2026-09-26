-- Desempenho e base para a "inteligência" do sistema.
--
-- 1. Regras de acesso (RLS) mais rápidas: is_admin(), minha_academia(), is_ativo() e auth.uid() passam a
--    ser calculados UMA vez por consulta, e não uma vez por linha. Em tabelas grandes (passagens, com
--    centenas de milhares de linhas) isso era o que estourava o tempo do banco.
-- 2. Resumos prontos das tabelas volumosas (passagens e Gympass) por dia e por hora, mantidos
--    automaticamente pelo banco a cada importação (e ao desfazer uma importação).
-- 3. relatorio_periodo (Painel) passa a somar os resumos em vez de contar as linhas brutas.
-- 4. Visões diária e mensal por academia com todos os números juntos (vendas, frequência, contagens),
--    prontas para análises e para a inteligência do sistema.
-- 5. Limpeza das contagens repetidas idênticas que vieram das planilhas (mesma academia, dia, horário e
--    mesmos valores).

-- ---------------------------------------------------------------------------------------------------
-- 1. RLS: envolve as funções em (select ...) para o Postgres calcular uma vez só (initplan).
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  p record;
  padrao constant text := '(?<!select )\m(is_admin|minha_academia|is_ativo|auth\.uid)\(\)';
  usando text;
  checando text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    usando := case when p.qual is null then null else regexp_replace(p.qual, padrao, '(select \1())', 'gi') end;
    checando := case when p.with_check is null then null else regexp_replace(p.with_check, padrao, '(select \1())', 'gi') end;
    if usando is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, usando);
    end if;
    if checando is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, checando);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 2. Resumos de passagens e Gympass
-- ---------------------------------------------------------------------------------------------------
create table if not exists resumo_passagens_dia (
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  entradas integer not null,          -- passagens na catraca
  clientes integer not null,          -- pessoas diferentes no dia
  liberadas integer not null,         -- ação "Liberado"
  primary key (academia_id, data)
);

create table if not exists resumo_passagens_hora (
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  hora smallint not null check (hora between 0 and 23),
  entradas integer not null,
  clientes integer not null,
  primary key (academia_id, data, hora)
);

create table if not exists resumo_gympass_dia (
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  checkins integer not null,
  pessoas integer not null,           -- pessoas diferentes (ID do Wellhub) no dia
  valor numeric(12, 2) not null,
  primary key (academia_id, data)
);

create table if not exists resumo_gympass_hora (
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  hora smallint not null check (hora between 0 and 23),
  checkins integer not null,
  valor numeric(12, 2) not null,
  primary key (academia_id, data, hora)
);

-- Leitura com a mesma regra das tabelas de origem; escrita só pelo próprio banco (gatilhos).
do $$
declare
  t text;
begin
  foreach t in array array['resumo_passagens_dia', 'resumo_passagens_hora', 'resumo_gympass_dia', 'resumo_gympass_hora'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on %1$I', t);
    execute format(
      'create policy "%1$s_select" on %1$I for select to authenticated using ((select is_admin()) or academia_id = (select minha_academia()))', t);
  end loop;
end $$;

-- Recalcula os resumos de uma academia nos dias informados (a partir das linhas brutas).
create or replace function recalcular_resumo_passagens(p_academia uuid, p_datas date[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from resumo_passagens_dia where academia_id = p_academia and data = any (p_datas);
  delete from resumo_passagens_hora where academia_id = p_academia and data = any (p_datas);
  insert into resumo_passagens_dia (academia_id, data, entradas, clientes, liberadas)
    select academia_id, data, count(*), count(distinct cliente_id), count(*) filter (where acao ilike 'liberad%')
    from passagens where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data;
  insert into resumo_passagens_hora (academia_id, data, hora, entradas, clientes)
    select academia_id, data, extract(hour from hora)::smallint, count(*), count(distinct cliente_id)
    from passagens where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data, extract(hour from hora);
end;
$$;

create or replace function recalcular_resumo_gympass(p_academia uuid, p_datas date[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from resumo_gympass_dia where academia_id = p_academia and data = any (p_datas);
  delete from resumo_gympass_hora where academia_id = p_academia and data = any (p_datas);
  insert into resumo_gympass_dia (academia_id, data, checkins, pessoas, valor)
    select academia_id, data, count(*), count(distinct wellhub_id), coalesce(sum(pagamento), 0)
    from gympass where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data;
  insert into resumo_gympass_hora (academia_id, data, hora, checkins, valor)
    select academia_id, data, extract(hour from hora)::smallint, count(*), coalesce(sum(pagamento), 0)
    from gympass where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data, extract(hour from hora);
end;
$$;

revoke execute on function recalcular_resumo_passagens(uuid, date[]) from public, anon, authenticated;
revoke execute on function recalcular_resumo_gympass(uuid, date[]) from public, anon, authenticated;

-- Gatilhos por comando (não por linha): uma importação de 1.000 linhas recalcula só os dias tocados,
-- uma vez. Valem para incluir e para apagar (inclusive ao desfazer uma importação, que apaga em cascata).
create or replace function resumo_passagens_ao_incluir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_resumo_passagens(academia_id, array_agg(distinct data)) from novas group by academia_id;
  return null;
end;
$$;
create or replace function resumo_passagens_ao_apagar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_resumo_passagens(academia_id, array_agg(distinct data)) from antigas group by academia_id;
  return null;
end;
$$;
create or replace function resumo_gympass_ao_incluir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_resumo_gympass(academia_id, array_agg(distinct data)) from novas group by academia_id;
  return null;
end;
$$;
create or replace function resumo_gympass_ao_apagar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_resumo_gympass(academia_id, array_agg(distinct data)) from antigas group by academia_id;
  return null;
end;
$$;

drop trigger if exists trg_resumo_passagens_incluir on passagens;
create trigger trg_resumo_passagens_incluir after insert on passagens
  referencing new table as novas for each statement execute function resumo_passagens_ao_incluir();
drop trigger if exists trg_resumo_passagens_apagar on passagens;
create trigger trg_resumo_passagens_apagar after delete on passagens
  referencing old table as antigas for each statement execute function resumo_passagens_ao_apagar();
drop trigger if exists trg_resumo_gympass_incluir on gympass;
create trigger trg_resumo_gympass_incluir after insert on gympass
  referencing new table as novas for each statement execute function resumo_gympass_ao_incluir();
drop trigger if exists trg_resumo_gympass_apagar on gympass;
create trigger trg_resumo_gympass_apagar after delete on gympass
  referencing old table as antigas for each statement execute function resumo_gympass_ao_apagar();

-- Carga inicial com o que já foi importado.
select recalcular_resumo_passagens(academia_id, array_agg(distinct data)) from passagens group by academia_id;
select recalcular_resumo_gympass(academia_id, array_agg(distinct data)) from gympass group by academia_id;

-- ---------------------------------------------------------------------------------------------------
-- 3. Painel: passagens e Gympass vindos dos resumos
-- ---------------------------------------------------------------------------------------------------
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
    d.dias,
    (select x.ativos_pagantes from controle_diario x
      where x.academia_id = a.id and x.data between inicio and fim and x.ativos_pagantes is not null
      order by x.data desc limit 1),
    d.visitas,
    d.vendas,
    (select x.inadimplentes from controle_diario x
      where x.academia_id = a.id and x.data between inicio and fim and x.inadimplentes is not null
      order by x.data desc limit 1),
    d.faturamento,
    d.canc_solic,
    d.canc_efet,
    d.nps,
    d.vendas_site,
    (select count(*) from controle_conversao c where c.academia_id = a.id and c.data between inicio and fim),
    (select coalesce(sum(p.entradas), 0) from resumo_passagens_dia p where p.academia_id = a.id and p.data between inicio and fim),
    (select coalesce(sum(g.checkins), 0) from resumo_gympass_dia g where g.academia_id = a.id and g.data between inicio and fim),
    (select coalesce(sum(g.valor), 0) from resumo_gympass_dia g where g.academia_id = a.id and g.data between inicio and fim),
    (select coalesce(sum(s.musculacao + s.cardio), 0) from contagem_sala s where s.academia_id = a.id and s.data between inicio and fim),
    (select coalesce(sum(c.quantidade), 0) from contagem_coletivas c where c.academia_id = a.id and c.data between inicio and fim),
    (select coalesce(sum(l.quantidade), 0) from contagem_lutas l where l.academia_id = a.id and l.data between inicio and fim)
  from academias a
  cross join lateral (
    select
      count(*) as dias,
      coalesce(sum(x.visitas), 0) as visitas,
      coalesce(sum(x.vendas), 0) as vendas,
      coalesce(sum(x.faturamento), 0) as faturamento,
      coalesce(sum(x.cancelamentos_solicitados), 0) as canc_solic,
      coalesce(sum(x.cancelamentos_efetivados), 0) as canc_efet,
      round(avg(x.nps), 1) as nps,
      coalesce(sum(x.vendas_site), 0) as vendas_site
    from controle_diario x
    where x.academia_id = a.id and x.data between inicio and fim
  ) d
  order by a.nome;
$$;

grant execute on function relatorio_periodo(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 4. Visões para análise: um registro por academia e dia, e por academia e mês
-- ---------------------------------------------------------------------------------------------------
create or replace view v_resumo_diario with (security_invoker = true) as
with dias as (
  select academia_id, data from controle_diario
  union select academia_id, data from resumo_passagens_dia
  union select academia_id, data from resumo_gympass_dia
  union select academia_id, data from contagem_sala
  union select academia_id, data from contagem_coletivas
  union select academia_id, data from contagem_lutas
),
sala as (
  select academia_id, data, sum(musculacao) musculacao, sum(cardio) cardio, count(*) contagens_sala,
         max(musculacao + cardio) pico_sala
  from contagem_sala group by academia_id, data
),
coletivas as (
  select academia_id, data, count(*) aulas, sum(quantidade) alunos from contagem_coletivas group by academia_id, data
),
lutas as (
  select academia_id, data, count(*) aulas, sum(quantidade) alunos from contagem_lutas group by academia_id, data
),
conversao as (
  select academia_id, data, count(*) nao_convertidas from controle_conversao group by academia_id, data
)
select
  k.academia_id,
  k.data,
  extract(isodow from k.data)::smallint as dia_semana,         -- 1 = segunda ... 7 = domingo
  exists (select 1 from feriados f where f.data = k.data and (f.academia_id is null or f.academia_id = k.academia_id)) as feriado,
  d.ativos_pagantes, d.visitas, d.vendas, d.inadimplentes, d.faturamento,
  d.cancelamentos_solicitados, d.cancelamentos_efetivados, d.nps, d.neoassist, d.vendas_site,
  d.icv, d.churn, d.previsao_churn,
  c.nao_convertidas,
  p.entradas as passagens, p.clientes as clientes_catraca,
  g.checkins as gympass_checkins, g.pessoas as gympass_pessoas, g.valor as gympass_valor,
  s.musculacao, s.cardio, s.contagens_sala, s.pico_sala,
  co.aulas as aulas_coletivas, co.alunos as alunos_coletivas,
  l.aulas as aulas_lutas, l.alunos as alunos_lutas
from dias k
left join controle_diario d on d.academia_id = k.academia_id and d.data = k.data
left join resumo_passagens_dia p on p.academia_id = k.academia_id and p.data = k.data
left join resumo_gympass_dia g on g.academia_id = k.academia_id and g.data = k.data
left join sala s on s.academia_id = k.academia_id and s.data = k.data
left join coletivas co on co.academia_id = k.academia_id and co.data = k.data
left join lutas l on l.academia_id = k.academia_id and l.data = k.data
left join conversao c on c.academia_id = k.academia_id and c.data = k.data;

create or replace view v_resumo_mensal with (security_invoker = true) as
select
  academia_id,
  date_trunc('month', data)::date as mes,
  count(*) filter (where faturamento is not null) as dias_lancados,
  (array_agg(ativos_pagantes order by data desc) filter (where ativos_pagantes is not null))[1] as ativos_pagantes,
  (array_agg(inadimplentes order by data desc) filter (where inadimplentes is not null))[1] as inadimplentes,
  sum(visitas) as visitas,
  sum(vendas) as vendas,
  sum(faturamento) as faturamento,
  sum(cancelamentos_solicitados) as cancelamentos_solicitados,
  sum(cancelamentos_efetivados) as cancelamentos_efetivados,
  round(avg(nps), 1) as nps,
  sum(neoassist) as neoassist,
  sum(vendas_site) as vendas_site,
  sum(nao_convertidas) as nao_convertidas,
  sum(passagens) as passagens,
  sum(gympass_checkins) as gympass_checkins,
  sum(gympass_valor) as gympass_valor,
  sum(musculacao) as musculacao,
  sum(cardio) as cardio,
  sum(aulas_coletivas) as aulas_coletivas,
  sum(alunos_coletivas) as alunos_coletivas,
  sum(aulas_lutas) as aulas_lutas,
  sum(alunos_lutas) as alunos_lutas
from v_resumo_diario
group by academia_id, date_trunc('month', data);

grant select on v_resumo_diario, v_resumo_mensal to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 5. Contagens repetidas idênticas (vieram assim das planilhas): fica uma de cada.
-- ---------------------------------------------------------------------------------------------------
delete from contagem_sala a using contagem_sala b
where a.id > b.id and a.academia_id = b.academia_id and a.data = b.data and a.horario = b.horario
  and a.musculacao = b.musculacao and a.cardio = b.cardio and a.professores is not distinct from b.professores;

delete from contagem_coletivas a using contagem_coletivas b
where a.id > b.id and a.academia_id = b.academia_id and a.data = b.data and a.horario = b.horario
  and a.modalidade is not distinct from b.modalidade and a.professor is not distinct from b.professor
  and a.professor_substituto is not distinct from b.professor_substituto and a.quantidade = b.quantidade;

delete from contagem_lutas a using contagem_lutas b
where a.id > b.id and a.academia_id = b.academia_id and a.data = b.data and a.horario = b.horario
  and a.modalidade is not distinct from b.modalidade and a.professor is not distinct from b.professor
  and a.professor_substituto is not distinct from b.professor_substituto and a.quantidade = b.quantidade;

-- Estatísticas atualizadas para o planejador de consultas.
analyze passagens;
analyze gympass;
analyze contagem_sala;
analyze contagem_coletivas;
analyze contagem_lutas;
analyze controle_diario;
