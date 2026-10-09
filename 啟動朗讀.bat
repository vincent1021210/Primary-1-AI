@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在啟動 AI 朗讀（本機版）...
python -m pip install -r "desktop\requirements.txt" -q
if errorlevel 1 (
  echo 套件安裝失敗，請確認已安裝 Python。
  pause
  exit /b 1
)

python "desktop\tts_app.py"
if errorlevel 1 (
  echo.
  echo 程式結束時發生錯誤。
  pause
)
