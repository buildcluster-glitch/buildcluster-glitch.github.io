@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo ========================================
echo   buildcluster-glitch.github.io �f�v���C
echo ========================================
echo.

REM ===== 1. ���[�J���ŐV�t�@�C�����R�s�[ =====
echo [1/4] ���[�J���̍ŐV�t�@�C�����R�s�[��...
echo.

set "SRC_MITSUMORI=C:\Users\�R�c �T�M\Desktop\���ύ쐬�A�v��_electron\src"
set "SRC_TASKMGR=C:\Users\�R�c �T�M\Desktop\�H���^�X�N�}�l�[�W���["
set "SRC_ZAIKO=C:\Users\�R�c �T�M\Desktop\�݌ɊǗ��A�v��"

REM ���σA�v��(mitsumori)
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

REM �H���^�X�N�}�l�[�W���[
if exist "%SRC_TASKMGR%\index.html" (
  copy /Y "%SRC_TASKMGR%\index.html" "task-manager\index.html" > nul
  echo   [OK] task-manager/index.html
)

REM �݌ɊǗ��A�v��(�����)
if exist "%SRC_ZAIKO%\index.html" (
  copy /Y "%SRC_ZAIKO%\index.html" "zaiko\index.html" > nul
  echo   [OK] zaiko/index.html
)

echo.

REM ===== 2. git status �ō����m�F =====
echo [2/4] �ύX�t�@�C���̊m�F...
echo.
git add -A
git status --short
echo.

REM �ύX��������ΏI��
git diff --cached --quiet
if !errorlevel! equ 0 (
  echo.
  echo  �ύX�t�@�C���Ȃ� - �f�v���C�s�v
  echo.
  pause
  exit /b 0
)

REM ===== 3. �R�~�b�g���b�Z�[�W���� =====
echo [3/4] �R�~�b�g���b�Z�[�W
echo.
REM ����1 > ���ϐ�DEPLOY_MSG > �������b�Z�[�W �̏��ɗD��
if not "%~1"=="" (
  set "COMMIT_MSG=%~1"
) else if defined DEPLOY_MSG (
  set "COMMIT_MSG=%DEPLOY_MSG%"
) else (
  set "COMMIT_MSG=update %date:~0,10% %time:~0,5%"
)
echo ���b�Z�[�W: !COMMIT_MSG!
echo.
echo ���b�Z�[�W: !COMMIT_MSG!
echo.

REM ===== 4. �R�~�b�g + �v�b�V�� =====
echo [4/4] �R�~�b�g + GitHub�փv�b�V����...
echo.
git commit -m "!COMMIT_MSG!"
if errorlevel 1 goto :fail_commit

git push origin main
if errorlevel 1 goto :fail_push

echo.
echo ========================================
echo  �f�v���C����!
echo ========================================
echo.
echo 1?2�����GitHub Pages�ɔ��f����܂�:
echo   https://buildcluster-glitch.github.io/mitsumori/
echo   https://buildcluster-glitch.github.io/task-manager/
echo.
goto :end

:fail_commit
echo.
echo  [NG] �R�~�b�g���s
echo.
set DEPLOY_FAIL=1
goto :end

:fail_push
echo.
echo  [NG] �v�b�V�����s
echo  - Personal Access Token �����߂�ꂽ�ꍇ:
echo    https://github.com/settings/tokens �Ő��� -^> repo�����t�^
echo  - �C���^�[�l�b�g�ڑ����m�F
echo.
set DEPLOY_FAIL=1
goto :end

:end
REM ���������� 3�b�҂��ĕ��� (���s���͌��₷���悤 30�b)
if defined DEPLOY_FAIL (
  echo.
  echo  [NG] �G���[���m�F���Ă� ESC �ŕ��Ă�������
  pause ^> nul
) else (
  timeout /t 3 /nobreak ^> nul
)
