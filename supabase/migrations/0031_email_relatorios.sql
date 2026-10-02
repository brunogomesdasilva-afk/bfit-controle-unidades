-- E-mail secundário do usuário para os relatórios. Preenchido, os relatórios por e-mail (acompanhamento diário,
-- fechamento do mês, compras e manutenção) vão para ele no lugar do e-mail de acesso (login).
alter table profiles add column if not exists email_relatorios text;
