# buildcluster-glitch.github.io deploy script (PowerShell)
# Usage:
#   .\deploy.ps1                     -> auto commit message
#   .\deploy.ps1 "修繕タブ追加"       -> custom commit message

param(
    [string]$CommitMsg = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  buildcluster-glitch.github.io デプロイ"
Write-Host "========================================"
Write-Host ""

# ===== 1. ローカルの最新ファイルをコピー =====
Write-Host "[1/4] ローカルの最新ファイルをコピー中..."
Write-Host ""

$desktop = [Environment]::GetFolderPath("Desktop")
$srcMitsumori = Join-Path $desktop "見積作成アプリ_electron\src"
$srcTaskmgr   = Join-Path $desktop "工事タスクマネージャー"
$srcZaiko     = Join-Path $desktop "在庫管理アプリ"

function Copy-IfExists($src, $dst) {
    if (Test-Path $src) {
        Copy-Item -Force $src $dst
        Write-Host "  [OK] $dst"
    }
}

# 見積アプリ
$mitsumoriFiles = @(
    "index.html","sales.html","invoice.html","progress.html",
    "bukken.js","data.js","templates.js",
    "hiroidashi_template.js","suido_templates.js"
)
foreach ($f in $mitsumoriFiles) {
    Copy-IfExists (Join-Path $srcMitsumori $f) "mitsumori\$f"
}

# 工事タスクマネージャー
Copy-IfExists (Join-Path $srcTaskmgr "index.html") "task-manager\index.html"

# 在庫管理アプリ
Copy-IfExists (Join-Path $srcZaiko "index.html") "zaiko\index.html"

Write-Host ""

# ===== 1.5. パスワードゲート script を各 index.html / .html に差し込む =====
Write-Host "[1.5/4] パスワードゲートを差し込み..."
$gateTag = '<script src="/gate.js" defer></script>'
$targets = @(
    "index.html",
    "mitsumori\index.html","mitsumori\sales.html","mitsumori\invoice.html","mitsumori\progress.html",
    "task-manager\index.html",
    "zaiko\index.html"
)
foreach ($t in $targets) {
    if (-not (Test-Path $t)) { continue }
    $content = Get-Content -Raw -Path $t -Encoding UTF8
    # 既に差し込み済みならスキップ
    if ($content -match '/gate\.js') { continue }
    # </head> の直前に挿入
    $new = $content -replace '</head>', "$gateTag`r`n</head>"
    if ($new -ne $content) {
        Set-Content -Path $t -Value $new -Encoding UTF8 -NoNewline
        Write-Host "  [OK] $t に gate.js 追加"
    }
}
Write-Host ""

# ===== 2. git status =====
Write-Host "[2/4] 変更ファイルの確認..."
Write-Host ""
& git add -A
& git status --short
Write-Host ""

# 変更が無ければ終了
& git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "  変更ファイルなし - デプロイ不要"
    Write-Host ""
    Start-Sleep -Seconds 3
    exit 0
}

# ===== 3. コミットメッセージ =====
Write-Host "[3/4] コミットメッセージ"
Write-Host ""
if ([string]::IsNullOrWhiteSpace($CommitMsg)) {
    if ($env:DEPLOY_MSG) {
        $CommitMsg = $env:DEPLOY_MSG
    } else {
        $CommitMsg = "update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
}
Write-Host "メッセージ: $CommitMsg"
Write-Host ""

# ===== 4. コミット + プッシュ =====
Write-Host "[4/4] コミット + GitHub へプッシュ..."
Write-Host ""

& git commit -m $CommitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [NG] コミット失敗" -ForegroundColor Red
    Read-Host "Enter で終了"
    exit 1
}

# push 前にリモートの差分を取り込む(別端末/Web編集で先に commit されてた場合の保険)
Write-Host ""
Write-Host "  リモートとの整合チェック (git pull --rebase)..."
& git pull --rebase origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [NG] rebase でコンフリクト発生" -ForegroundColor Red
    Write-Host "  手動で解決してください:"
    Write-Host "    1. コンフリクトしたファイルを編集"
    Write-Host "    2. git add <ファイル>"
    Write-Host "    3. git rebase --continue"
    Write-Host "  または中止:"
    Write-Host "    git rebase --abort"
    Write-Host ""
    Read-Host "Enter で終了"
    exit 1
}

& git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [NG] プッシュ失敗" -ForegroundColor Red
    Write-Host "  - Personal Access Token が必要かも:"
    Write-Host "    https://github.com/settings/tokens (repo 権限)"
    Write-Host "  - インターネット接続も確認"
    Write-Host ""
    Read-Host "Enter で終了"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  デプロイ完了!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "1〜2分後 GitHub Pages に反映されます:"
Write-Host "  https://buildcluster-glitch.github.io/mitsumori/"
Write-Host "  https://buildcluster-glitch.github.io/task-manager/"
Write-Host ""

Start-Sleep -Seconds 3
