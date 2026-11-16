@echo off
rem Robo das notas fiscais com pastas do computador (Administrador > Notas do Drive). Ver scripts\notas-locais.mts.
rem Faz o mesmo que o botao "Rodar agora" da tela: le as notas, lanca no contas a pagar e move para a contabilidade.
cd /d "%~dp0"
call npx --yes tsx scripts\notas-locais.mts
pause
