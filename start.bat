@echo off
chcp 65001 >nul
title CyberDeck OS 2077 Launcher
echo ===================================================
echo     CYBERDECK 2077 - 赛博摸鱼终端与修仙元宇宙
echo ===================================================
echo 正在启动本地开发服务器并就绪后自动打开浏览器...
npm run dev -- --open
pause
