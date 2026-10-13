@echo off
chcp 65001 >nul
title CSConfig - Procesar demos
cd /d "%~dp0"

echo.
echo  CSConfig - Procesar demos
echo  -------------------------
echo  Procesa las demos de la carpeta pipeline\demos y sube las miras a la web.
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo  Falta Git. Instalalo desde https://git-scm.com/download/win y vuelve a abrir este archivo.
  goto fin
)

set "PY=python"
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo  Falta Python. Instalalo desde https://www.python.org/downloads/ marcando "Add python.exe to PATH".
    goto fin
  )
  set "PY=py -3"
)

echo  [1/4] Bajando la ultima version de la web...
git pull --quiet
if errorlevel 1 (
  echo  No se pudo actualizar desde GitHub. Revisa tu conexion o tu sesion de Git.
  goto fin
)

echo  [2/4] Comprobando lo necesario (solo tarda la primera vez)...
%PY% -m pip install --quiet --disable-pip-version-check -r pipeline\requirements.txt
if errorlevel 1 (
  echo  No se pudieron instalar las dependencias de Python.
  goto fin
)

echo  [3/4] Procesando demos...
echo.
%PY% pipeline\update.py --only local
echo.

echo  [4/4] Subiendo las miras a la web...
git add -A site/data pipeline/state.json
git diff --cached --quiet
if errorlevel 1 (
  git commit --quiet -m "Demos procesadas desde el PC"
  git push --quiet
  if errorlevel 1 (
    echo  No se pudo subir a GitHub. Vuelve a ejecutar este archivo.
  ) else (
    echo  Listo. La web se actualizara en un par de minutos.
  )
) else (
  echo  No habia demos nuevas: no hay nada que subir.
)

:fin
echo.
pause
