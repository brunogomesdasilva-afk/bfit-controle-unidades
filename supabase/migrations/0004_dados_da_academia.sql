-- Dados de cada academia: tamanho, custo financeiro e inventário de máquinas por grupo muscular.

alter table academias add column if not exists area_m2 numeric(10, 2) check (area_m2 >= 0);
alter table academias add column if not exists custo_financeiro numeric(14, 2) check (custo_financeiro >= 0);
alter table academias add column if not exists maquinas_peitoral integer not null default 0 check (maquinas_peitoral >= 0);
alter table academias add column if not exists maquinas_costas integer not null default 0 check (maquinas_costas >= 0);
alter table academias add column if not exists maquinas_pernas integer not null default 0 check (maquinas_pernas >= 0);
alter table academias add column if not exists maquinas_bracos integer not null default 0 check (maquinas_bracos >= 0);
