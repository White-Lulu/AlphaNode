@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" serve.py %*
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    py -3 serve.py %*
  ) else (
    python serve.py %*
  )
)
if errorlevel 1 pause