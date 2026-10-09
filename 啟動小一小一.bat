@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動「小一小一」喚醒助手...
python "desktop\launch_studio.py"
