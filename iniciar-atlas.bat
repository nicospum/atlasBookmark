@echo off
title Atlas de Guardados
cd /d "%~dp0"
echo ========================================================
echo         ATLAS DE GUARDADOS - TU ARCHIVO PERSONAL
echo ========================================================
echo.
echo Iniciando servidor en puerto 3070...
echo Base de datos: data/atlas.db (SQLite)
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3070
npm run dev
