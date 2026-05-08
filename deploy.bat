@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo ========================================
echo   buildcluster-glitch.github.io デプロイ
echo ========================================
echo.

REM ===== 1. ローカル最新ファイルをコピー =====
echo [1/4] ローカルの最新ファイルをコピー中...
echo.

set "SRC_MITSUMORI=C:\Users\山田 裕貴\Desktop\見積作成アプリ_electron\src"
set "SRC_TASKMGR=C:\Users\山田 裕貴\Desktop\工事タスクマネージャー"
set "SRC_ZAIKO=C:\Users\山田 裕貴\Desktop\在庫管理アプリ"

REM 見積アプリ(mitsumori)
if exist "%SRC_MITSUMORI%\index.html" (
  copy /Y "%SRC_MITSUMORI%\index.html" "mitsumori\index.html" > nul
  echo   [OK] mitsumori/index.html
)
if exist "%SRC_MITSUMORI%\sales.html" (
  copy /Y "%SRC_MITSUMORI%\sales.html" "mitsumori\sales.html" > nul
  echo   [OK] mitsumori/sales.html
)
if exist "%SRC_MITSUMORI%\invoice.html" (
  copy /Y "%SRC_MITSUMORI%\invoice.html" "mitsumori\invoice.html" > nul
  echo   [OK] mitsumori/invoice.html
)
if exist "%SRC_MITSUMORI%\progress.html" (
  copy /Y "%SRC_MITSUMORI%\progress.html" "mitsumori\progress.html" > nul
  echo   [OK] mitsumori/progress.html
)
if exist "%SRC_MITSUMORI%\bukken.js" (
  copy /Y "%SRC_MITSUMORI%\bukken.js" "mitsumori\bukken.js" > nul
  echo   [OK] mitsumori/bukken.js
)
if exist "%SRC_MITSUMORI%\data.js" (
  copy /Y "%SRC_MITSUMORI%\data.js" "mitsumori\data.js" > nul
  echo   [OK] mitsumori/data.js
)
if exist "%SRC_MITSUMORI%\templates.js" (
  copy /Y "%SRC_MITSUMORI%\templates.js" "mitsumori\templates.js" > nul
  echo   [OK] mitsumori/templates.js
)
if exist "%SRC_MITSUMORI%\hiroidashi_template.js" (
  copy /Y "%SRC_MITSUMORI%\hiroidashi_template.js" "mitsumori\hiroidashi_template.js" > nul
  echo   [OK] mitsumori/hiroidashi_template.js
)
if exist "%SRC_MITSUMORI%\suido_templates.js" (
  copy /Y "%SRC_MITSUMORI%\suido_templates.js" "mitsumori\suido_templates.js" > nul
  echo   [OK] mitsumori/suido_templates.js
)

REM 工事タスクマネージャー
if exist "%SRC_TASKMGR%\index.html" (
  copy /Y "%SRC_TASKMGR%\index.html" "task-manager\index.html" > nul
  echo   [OK] task-manager/index.html
)

REM 在庫管理アプリ(あれば)
if exist "%SRC_ZAIKO%\index.html" (
  copy /Y "%SRC_ZAIKO%\index.html" "zaiko\index.html" > nul
  echo   [OK] zaiko/index.html
)

echo.

REM ===== 2. git status で差分確認 =====
echo [2/4] 変更ファイルの確認...
echo.
git add -A
git status --short
echo.

REM 変更が無ければ終了
git diff --cached --quiet
if !errorlevel! equ 0 (
  echo.
  echo  変更ファイルなし - デプロイ不要
  echo.
  pause
  exit /b 0
)

REM ===== 3. コミットメッセージ入力 =====
echo [3/4] コミットメッセージ入力
echo.
set /p COMMIT_MSG="メッセージ(Enterで自動メッセージ): "
if "!COMMIT_MSG!"=="" (
  set "COMMIT_MSG=update %date:~0,10% %time:~0,5%"
)
echo.
echo メッセージ: !COMMIT_MSG!
echo.

REM ===== 4. コミット + プッシュ =====
echo [4/4] コミット + GitHubへプッシュ中...
echo.
git commit -m "!COMMIT_MSG!"
if errorlevel 1 goto :fail_commit

git push origin main
if errorlevel 1 goto :fail_push

echo.
echo ========================================
echo  デプロイ成功!
echo ========================================
echo.
echo 1?2分後にGitHub Pagesに反映されます:
echo   https://buildcluster-glitch.github.io/mitsumori/
echo   https://buildcluster-glitch.github.io/task-manager/
echo.
goto :end

:fail_commit
echo.
echo  [NG] コミット失敗
echo.
goto :end

:fail_push
echo.
echo  [NG] プッシュ失敗
echo  - Personal Access Token を求められた場合:
echo    https://github.com/settings/tokens で生成 -^> repo権限付与
echo  - インターネット接続を確認
echo.
goto :end

:end
echo Press any key to close...
pause ^> nul
