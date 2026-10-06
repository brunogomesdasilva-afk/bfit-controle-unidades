-- Funcionários: marca se o professor é contratado como PJ (pessoa jurídica).
alter table funcionarios add column if not exists pj boolean not null default false;
