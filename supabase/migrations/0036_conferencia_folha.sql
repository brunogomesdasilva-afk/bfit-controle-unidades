-- Conferência da folha de pagamento (menu RH): por academia e mês, os arquivos enviados (folha, ponto e vale
-- transporte), o relatório da conferência feito pelo Claude e o fechamento da folha (histórico do que foi aprovado).
-- Tudo só para quem tem o módulo RH, e cada usuário só vê a academia dele (o administrador vê todas).

-- Valor da hora do professor (pago por fora da folha quando é PJ; o CLT tem o valor na própria folha).
alter table funcionarios add column if not exists valor_hora numeric(10, 2);
-- Funcionário dispensado de marcar ponto (ex.: líder isenta): a conferência não cobra o ponto dele.
alter table funcionarios add column if not exists isento_ponto boolean not null default false;

create table if not exists folha_conferencias (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- processando: o Claude está conferindo; conferida: relatório pronto; fechada: folha aprovada;
  -- erro: a conferência não terminou (o texto parcial fica em "relatorio").
  status text not null default 'processando' check (status in ('processando', 'conferida', 'fechada', 'erro')),
  -- Arquivos enviados: [{tipo: 'folha'|'ponto'|'vt', nome, caminho}] (caminho na pasta "folha" do armazenamento).
  arquivos jsonb not null default '[]',
  -- Dados do sistema enviados junto (horas previstas pela grade, coberturas, PJ/CLT...), para o histórico.
  dados_sistema jsonb,
  relatorio text,
  modelo text,
  erro text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  fechada_por uuid references profiles(id) on delete set null,
  fechada_em timestamptz,
  -- Fechamentos e reaberturas: [{acao: 'fechada'|'reaberta', por, nome, em}].
  eventos jsonb not null default '[]'
);
create index if not exists folha_conferencias_academia_mes on folha_conferencias (academia_id, mes, criado_em desc);
-- Só uma folha fechada por academia e mês.
create unique index if not exists folha_conferencias_uma_fechada on folha_conferencias (academia_id, mes) where status = 'fechada';

-- Quem tem o módulo RH, na academia dele (administrador: todas).
create or replace function pode_rh(academia uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tem_modulo('rh') and (is_admin() or academia = minha_academia());
$$;
revoke execute on function pode_rh(uuid) from public;
grant execute on function pode_rh(uuid) to authenticated;

alter table folha_conferencias enable row level security;
drop policy if exists "folha_conferencias_select" on folha_conferencias;
create policy "folha_conferencias_select" on folha_conferencias for select to authenticated
  using ((select pode_rh(academia_id)));
drop policy if exists "folha_conferencias_insert" on folha_conferencias;
create policy "folha_conferencias_insert" on folha_conferencias for insert to authenticated
  with check ((select pode_rh(academia_id)));
drop policy if exists "folha_conferencias_update" on folha_conferencias;
create policy "folha_conferencias_update" on folha_conferencias for update to authenticated
  using ((select pode_rh(academia_id))) with check ((select pode_rh(academia_id)));
-- Sem exclusão: o histórico da folha não se apaga.

-- Em manutenção (backup), só o administrador passa (mesma regra das outras tabelas).
drop policy if exists "manutencao_bloqueia" on folha_conferencias;
create policy "manutencao_bloqueia" on folha_conferencias as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- Pasta privada dos arquivos da folha: <academia_id>/<mês>/<arquivo>. Enviar e ler: módulo RH da academia.
insert into storage.buckets (id, name, public, file_size_limit)
values ('folha', 'folha', false, 31457280) -- até 30 MB por arquivo
on conflict (id) do nothing;

-- A primeira pasta do caminho é o id da academia (pasta com outro nome: ninguém acessa).
create or replace function pode_rh_pasta(caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(caminho, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pode_rh(split_part(caminho, '/', 1)::uuid)
    else false
  end;
$$;
revoke execute on function pode_rh_pasta(text) from public;
grant execute on function pode_rh_pasta(text) to authenticated;

drop policy if exists "folha_enviar" on storage.objects;
create policy "folha_enviar" on storage.objects for insert to authenticated
  with check (case when bucket_id = 'folha' then pode_rh_pasta(name) else false end);
drop policy if exists "folha_ler" on storage.objects;
create policy "folha_ler" on storage.objects for select to authenticated
  using (case when bucket_id = 'folha' then pode_rh_pasta(name) else false end);
