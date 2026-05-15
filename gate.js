// ============================================================
//  ビルドクラスタ 社内アプリ パスワードゲート
//  全アプリ共通(mitsumori / task-manager / zaiko)
//  - localhost / file: で開いた場合(開発・Electron)はスキップ
//  - 一度正しいパスワード入力 → 30日 localStorage 記憶
// ============================================================
(function(){
  // 開発環境/Electron では発動しない
  if (location.protocol === 'file:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1') return;

  // 既に認証済み(有効期限内)ならスキップ
  try {
    const stored = JSON.parse(localStorage.getItem('_bcgate') || 'null');
    if (stored && stored.expires > Date.now()) return;
  } catch (e) {}

  // パスワードハッシュ (SHA-256)
  const HASH = '48a2399994760df4e681d30fbd73147499ebeedadefa80ad972ee907efaca04d';

  async function sha256(s){
    const buf = new TextEncoder().encode(s);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ゲート画面を初期表示時に挟む(本体はぼかして待機)
  document.documentElement.style.visibility = 'hidden';

  function mount(){
    const overlay = document.createElement('div');
    overlay.id = '_bcgate_overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;color:#fff;display:grid;place-items:center;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;padding:20px';
    overlay.innerHTML =
      '<div style="text-align:center;max-width:340px;width:100%">' +
      '  <div style="font-size:40px;margin-bottom:10px">🔒</div>' +
      '  <h2 style="margin:0 0 6px;font-size:18px;font-weight:700">ビルドクラスタ 社内アプリ</h2>' +
      '  <p style="font-size:12px;color:#94a3b8;margin:0 0 20px">パスワードを入力してください</p>' +
      '  <input id="_bcgate_pw" type="password" autofocus autocomplete="current-password" placeholder="パスワード" ' +
      '    style="width:100%;padding:12px 14px;border:1px solid #334155;border-radius:10px;background:#1e293b;color:#fff;font-size:15px;outline:none;box-sizing:border-box;margin-bottom:10px">' +
      '  <button id="_bcgate_btn" style="width:100%;padding:12px;background:#2563eb;color:#fff;border:0;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">入る</button>' +
      '  <div id="_bcgate_err" style="margin-top:10px;color:#fca5a5;font-size:12px;min-height:14px"></div>' +
      '  <div style="margin-top:24px;font-size:10px;color:#475569">© BuildCluster</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.documentElement.style.visibility = '';

    const pw = document.getElementById('_bcgate_pw');
    const btn = document.getElementById('_bcgate_btn');
    const errEl = document.getElementById('_bcgate_err');

    async function tryUnlock(){
      const v = pw.value;
      if (!v) return;
      btn.disabled = true;
      btn.textContent = '確認中...';
      const h = await sha256(v);
      if (h === HASH) {
        // 30日間有効
        localStorage.setItem('_bcgate', JSON.stringify({
          expires: Date.now() + 30*24*60*60*1000,
          at: new Date().toISOString()
        }));
        overlay.remove();
      } else {
        errEl.textContent = 'パスワードが違います';
        pw.value = '';
        btn.disabled = false;
        btn.textContent = '入る';
        pw.focus();
      }
    }
    btn.onclick = tryUnlock;
    pw.onkeydown = e => { if (e.key === 'Enter') tryUnlock(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
