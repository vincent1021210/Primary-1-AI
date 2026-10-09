@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在啟動 AI 語音助手（聽寫 + 朗讀）...
echo 將開啟瀏覽器：http://127.0.0.1:8765/voice_studio.html
echo.

python "desktop\launch_studio.py"
if errorlevel 1 (
  echo.
  echo 啟動失敗，請確認已安裝 Python。
  pause
)
