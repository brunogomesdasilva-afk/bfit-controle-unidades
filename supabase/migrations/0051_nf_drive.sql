-- Notas fiscais pelo Google Drive (Administrador > Notas do Drive): todo dia às 19h o sistema lê a pasta de notas
-- fiscais, lança cada nota no contas a pagar e move o PDF, renomeado, para a pasta do fechamento da contabilidade
-- (ano / mês da emissão / academia). Nota que não dá para lançar sozinha fica na pasta e entra no aviso do dia.

-- Configuração (uma linha só): as duas pastas do Drive.
create table if not exists nf_drive_config (
  id boolean primary key default true check (id),
  pasta_notas text,
  pasta_contabilidade text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references profiles(id) on delete set null
);

-- Uma linha por arquivo lido em cada execução: o que aconteceu com ele. "nota" guarda a leitura do PDF para não
-- ler de novo (e pagar de novo) a mesma nota pendente nos dias seguintes.
create table if not exists nf_drive_log (
  id uuid primary key default gen_random_uuid(),
  executado_em timestamptz not null default now(),
  drive_id text not null,
  modificado text,
  arquivo text not null,
  situacao text not null check (situacao in ('lancada', 'ja_lancada', 'pendente', 'erro')),
  motivo text,
  nota jsonb,
  academia_id uuid references academias(id) on delete set null,
  titulo_id uuid references fin_titulos(id) on delete set null,
  destino text
);
create index if not exists nf_drive_log_drive on nf_drive_log (drive_id, executado_em desc);
create index if not exists nf_drive_log_data on nf_drive_log (executado_em desc);

-- Só administrador vê e altera (o robô usa a chave de serviço).
alter table nf_drive_config enable row level security;
alter table nf_drive_log enable row level security;
drop policy if exists "nf_drive_config_admin" on nf_drive_config;
create policy "nf_drive_config_admin" on nf_drive_config for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists "nf_drive_log_admin" on nf_drive_log;
create policy "nf_drive_log_admin" on nf_drive_log for select to authenticated
  using ((select is_admin()));
