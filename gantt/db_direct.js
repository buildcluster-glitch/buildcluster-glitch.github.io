// ============================================================
// 台帳のDB直結 (v1.4.1043・2026-09-14・台帳DB/見積⑨)
//   何のためか: いまの保存経路 アプリ→GAS→(DB+Drive) は、GASのWebアプリが散発的に落ちると
//   **作業がまるごと消える**(9/11〜9/12に発注確定が3件消失。9/14の実測でGASは5回中3回失敗)。
//   DBを正面にすれば、この経路が1本減って消えなくなる。
//
//   読み: anken から月単位で doc を一括取得(従来は get-ledger でDriveから1件ずつ)
//   書き: anken_save(op_id, doc, base_version, projection) を直接呼ぶ
//        - 版はサーバが採番(保存済み+1)。クライアントの doc.version は信用されない
//        - base_version が現在と食い違えば stale_version(黙って上書きしない)
//        - actor はJWTから解決(クライアントの申告を使わない)
//        - 射影(projection)は src/projection.js の移植版で作る。本番908件でGASの出力と全件一致を確認済み
//
//   安全装置:
//     * 既定はOFF。DBの shared_config `db_direct` に書いた人だけON(=遠隔スイッチ・PCを触らずに戻せる)
//     * 未ログイン/通信失敗/フラグOFF は**必ず従来のGAS経路に落ちる**(fail-open)
//     * 本物の衝突(他の人が先に保存)は落とさずに throw する(=1042の赤い警告と再送に乗る)
// ============================================================
(function (global) {
  'use strict';
  var SB_URL = 'https://grbqpsunbuduvvgdntzc.supabase.co';
  var SB_KEY = 'sb_publishable__CEhKynIR-v9uGW_cBg_1g_wHyN-k8n';   // 公開前提のキー(守りはRLSとRPC)

  function session() { try { return JSON.parse(localStorage.getItem('bc_sb_session') || 'null'); } catch (e) { return null; } }
  function token() { var s = session(); return (s && s.access_token) || ''; }
  function me() { try { return String((global.state && global.state.settings && global.state.settings.userName) || '').trim(); } catch (e) { return ''; } }

  async function rest(pathAndQuery, init) {
    var t = token();
    if (!t) throw new Error('nologin');
    var opt = Object.assign({ headers: {} }, init || {});
    opt.headers = Object.assign({
      apikey: SB_KEY, Authorization: 'Bearer ' + t,
      Accept: 'application/json', 'Content-Type': 'application/json',
    }, opt.headers);
    var r = await fetch(SB_URL + '/rest/v1/' + pathAndQuery, opt);
    if (!r.ok) { var b = await r.text().catch(function () { return ''; }); throw new Error('http' + r.status + ':' + String(b).slice(0, 120)); }
    var txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  // ---- 遠隔スイッチ ----------------------------------------------------------
  //   shared_config の key='db_direct' に例:
  //     {"read":["大村 まどか"],"write":["大村 まどか"],"allRead":false,"allWrite":false}
  //   名前は見積アプリの「担当者名」(settings.userName)と完全一致で見る。
  var _flag = null, _flagAt = 0, _flagMs = 3 * 60 * 1000, _flagDegraded = false, _everOn = false;
  async function flag() {
    if (_flag && (Date.now() - _flagAt) < _flagMs) return _flag;
    try {
      var rows = await rest('shared_config?key=eq.db_direct&select=value,value_json&limit=1');
      var raw = rows && rows[0] ? (rows[0].value_json != null ? rows[0].value_json : rows[0].value) : null;
      _flag = (typeof raw === 'string') ? JSON.parse(raw) : (raw || {});
      _flagDegraded = false;
      _flagAt = Date.now();
    } catch (e) {
      // ★v1.4.1050: 読めなかった時に **前回の名簿を捨てない**。
      //   旧は `_flag = {}` = OFF を**3分キャッシュ**していた。つまり通信が一瞬こけただけで、
      //   その端末は**黙って3分間、従来のGAS経路に戻る**(しかも誰にも見えない)。
      //   2026-09-14 18:07 大村将史さんの「保存できていたのに急に404」がこれ。
      //   全件同期で通信が混んだ直後に名簿の読み直しがコケ→OFF→GAS→GASの散発404。
      //   「つながらない=安全側に倒す」つもりが、実際には**一番落ちる経路へ戻す**動きになっていた。
      //   → ①一度でも読めていれば**その名簿を使い続ける** ②3分待たずに30秒後に読み直す
      if (_flag == null) _flag = {};                         // 一度も読めていない時だけOFF(初回は従来どおり)
      _flagDegraded = true;
      _flagAt = Date.now() - _flagMs + 30 * 1000;            // 30秒後に再挑戦(居座らせない)
    }
    if (allowed(_flag, 'write')) _everOn = true;             // 「本来はONの端末」を覚えておく(下の警告用)
    // ★v1.4.1119: 「本来はON」を**端末に覚える**。旧は画面を開いている間だけの記憶で、ログアウトしたまま
    //   アプリを起動し直すと忘れ、保存が**黙ってGAS経由**になっていた。GAS経由の保存は版の照合が効かないので、
    //   古い写しのまま他の人の入力を上書きする(10/6 木村さん コーポ川内203=まどかさんの立会メモが消えた)。
    //   ⚠名簿が**ちゃんと読めて**、名前も分かっていて、そのうえで「書きOFF」だった時だけ忘れる
    //     (=非常停止で全員OFFにした時は、従来どおりGAS経路に戻れる)。読めなかった時は何も変えない。
    try {
      if (!_flagDegraded && myNames().length) {
        if (allowed(_flag, 'write')) localStorage.setItem('bc_dbdirect_wason', '1');
        else { localStorage.removeItem('bc_dbdirect_wason'); _everOn = false; }
      }
    } catch (e) {}
    return _flag;
  }
  // v1.4.1046: 名前の照合を**空白を無視**して行う。さらに「設定タブの担当者名」だけでなく
  //   **ログインしている本人の表示名(DBのbc_users)**でも照合する。
  //   理由: この会社は表記が割れる(見積=「山田 裕貴」/カレンダー=「山田裕貴」)うえ、
  //   設定タブの担当者名が空のPCが実在する(=名簿に載せてもONにならず、しかも何も表示されない)。
  //   2026-09-14 まどかさんが「1045にしたのに保存失敗」になった時の容疑者がこれ。
  var _dbName = null;                                    // rpc/bc_actor_name の結果(1回だけ取る)
  function norm(s) { return String(s == null ? '' : s).replace(/[\s　]/g, ''); }
  function myNames() {
    var out = [];
    var a = norm(me()); if (a) out.push(a);
    var b = norm(_dbName); if (b && out.indexOf(b) < 0) out.push(b);
    return out;
  }
  async function fetchDbName() {
    if (_dbName !== null) return _dbName;
    try { var r = await rest('rpc/bc_actor_name', { method: 'POST', body: '{}' }); _dbName = (typeof r === 'string') ? r : ''; }
    catch (e) { _dbName = ''; }
    return _dbName;
  }
  function allowed(f, kind) {
    if (!f) return false;
    // v1.4.1088: read/write 以外の種類(invoiceRead 等)は「all+先頭大文字」で全員一括(allInvoiceRead)
    var _allKey = kind === 'read' ? 'allRead' : kind === 'write' ? 'allWrite' : ('all' + kind.charAt(0).toUpperCase() + kind.slice(1));
    if (f[_allKey] === true) return true;
    var list = f[kind];
    if (!Array.isArray(list)) return false;
    var mine = myNames();
    if (!mine.length) return false;
    for (var i = 0; i < list.length; i++) {
      if (mine.indexOf(norm(list[i])) >= 0) return true;
    }
    return false;
  }
  // 同期で引ける版(呼び出し側が毎回awaitしなくて済むように、直前のflag()結果を使う)
  function canReadSync() { return !!token() && allowed(_flag, 'read'); }
  function canWriteSync() { return !!token() && allowed(_flag, 'write'); }
  async function refresh() {
    if (token()) { await fetchDbName(); await flag(); }
    var s = { read: canReadSync(), write: canWriteSync(), loggedIn: !!token(), name: me(), dbName: _dbName };
    return s;
  }
  // 設定タブ等から現状を見るための窓(なぜONにならないのかを人が判断できるように)
  function status() {
    return {
      ログイン: !!token(),
      設定の担当者名: me() || '(空)',
      DBの表示名: _dbName || '(未取得)',
      名簿読み込み: _flag ? (_flagDegraded ? '失敗中(前回の名簿で動作)' : 'できた') : 'まだ',
      読み: canReadSync() ? 'ON' : 'OFF',
      書き: canWriteSync() ? 'ON' : 'OFF',
      本来はON: _everOn ? 'はい' : 'いいえ',
    };
  }

  // ---- 読み: 月まるごと ------------------------------------------------------
  //   戻り: Map(id → doc)。失敗したら null(=呼び出し側は従来どおりDriveから読む)
  async function loadMonthDocs(month) {
    if (!canReadSync() || !month) return null;
    try {
      var out = new Map();
      var from = 0, size = 200;
      for (;;) {
        // ★v1.4.1057: fileIdは列を正にする(loadMonthAllと揃える)。
        //   ⚠いまアプリからは呼ばれていないが公開しているので、**片方だけ直った状態にしない**
        var q = 'anken?select=id,doc,source_version,drive_file_id&is_deleted=eq.false&month=eq.' + encodeURIComponent(month)
              + '&order=id.asc&offset=' + from + '&limit=' + size;
        var rows = await rest(q);
        if (!rows || !rows.length) break;
        rows.forEach(function (r) {
          if (!r || !r.doc) return;
          var d = r.doc;
          // 版はDBの source_version を正とする(docの中の version がズレていても直結の基準を合わせる)
          if (r.source_version != null) d.version = r.source_version;
          d._dbLoadedVersion = (r.source_version != null) ? r.source_version : (Number(d.version) || 0);
          d._driveFileId = r.drive_file_id || d._driveFileId || '';   // ★v1.4.1057
          out.set(r.id, d);
        });
        if (rows.length < size) break;
        from += size;
      }
      return out;
    } catch (e) { console.warn('[DB直結] 月の読み込みに失敗→従来経路へ', month, e && e.message); return null; }
  }

  // ---- 読み: その月の「一覧+中身」を1往復で ----------------------------------
  //   従来は list-ledger(GAS) → get-ledger×件数(GAS/Drive) の2段。直結ではこれ1回で済む。
  //   ⚠**削除済み(is_deleted)も含める**。見積アプリは「一覧に載った deleted:true を読んで手元の写しを消す」
  //   方式で削除を伝えるので、生存行だけにすると**他端末の削除が届かない**(GASのver92が同じ穴を塞いでいる)。
  //   戻り: { items:[{fileId,name,modifiedAt}], docs:Map(id→doc) } / OFF・失敗は null
  async function loadMonthAll(month) {
    if (!canReadSync() || !month) return null;
    try {
      var items = [], docs = new Map();
      var from = 0, size = 200;
      for (;;) {
        // ⚠`anken_v` は削除済みを落とすので使わない(2026-09-14実測: 2026-09で anken 146件 / anken_v 141件)。
        //   削除は「一覧に載った deleted:true を読んで手元の写しを消す」方式で伝わるため、落とすと他端末の削除が届かない。
        // ★v1.4.1056: `drive_file_id` **列**も取る。docの中の `_driveFileId` は空のことがある(実測910件中103件)
        var q = 'anken?select=id,doc,source_version,updated_at,is_deleted,drive_file_id&month=eq.'
              + encodeURIComponent(month) + '&order=id.asc&offset=' + from + '&limit=' + size;
        var rows = await rest(q);
        if (!rows || !rows.length) break;
        rows.forEach(function (r) {
          if (!r || !r.id || !r.doc) return;
          var d = r.doc;
          if (r.source_version != null) d.version = r.source_version;
          d._dbLoadedVersion = (r.source_version != null) ? r.source_version : (Number(d.version) || 0);
          if (r.is_deleted === true && d.deleted !== true) d.deleted = true;   // 削除を確実に伝える
          docs.set(r.id, d);
          // ★v1.4.1050: `fromDb` は「この modifiedAt は **DBの更新時刻** であってDriveのmodifiedTimeではない」印。
          //   取り込み側(index.html)が Drive時計専用の `_driveModifiedAt` にこれを入れないようにするために要る。
          // ★v1.4.1056: fileIdは **列を正** にする。docの中の `_driveFileId` は空のことがあり、
          //   空のまま取り込むと ①台帳に「📍未同期」と出る ②GAS経路で保存した時にDriveへ**新しいファイルが作られて重複**する
          //   (2026-09-15 南部さん Repeament勾当台706 が「未同期」になっていた正体)。
          d._driveFileId = r.drive_file_id || d._driveFileId || '';
          items.push({ fileId: d._driveFileId, name: r.id, modifiedAt: r.updated_at || '', size: 0, fromDb: true });
        });
        if (rows.length < size) break;
        from += size;
      }
      return { items: items, docs: docs };
    } catch (e) { console.warn('[DB直結] 月の一括読み込みに失敗→従来経路へ', month, e && e.message); return null; }
  }

  // ---- 読み: 月一覧 ----------------------------------------------------------
  //   なぜ要るか: 全件同期(📥)も台帳タブの月バーも、**月一覧だけはGASから取っていた**。
  //   2026-09-14のGAS不調(30〜60秒/401/404)で「差分確認中…」から進まなくなった。
  //   `anken_month_stats_v`(migration023・GASのver92も同じものを見ている)をそのまま読む。
  //   戻り: [{month, count, newestModifiedAt}] / OFF・失敗は null(=従来どおりGASへ)
  // ---- 読み: その月にDBがもつ案件idの一覧(v1.4.1114・起動時の埋め戻し用) ----------------
  //   なぜ: 起動時pullは since 差分。一度取りこぼした案件(GASの一覧が瞬間的に0件を返した等)は、
  //         更新されない限り二度と来ない(佳織 10/4: 8月棚の完了4件が端末に無い)。
  //   索引(anken_index_v・RLSで削除済みは落ちる)から id だけ取り、手元に無い id があればその月を全件で取り直す。
  //   戻り: 配列(id) / null=読めない(呼び手は何もしない)
  async function loadMonthIds(month) {
    if (!canReadSync() || !month) return null;
    try {
      var rows = await rest('anken_index_v?select=id&month=eq.' + encodeURIComponent(month) + '&limit=5000');
      if (!Array.isArray(rows)) return null;
      return rows.map(function (r) { return r && r.id; }).filter(Boolean);
    } catch (e) { console.warn('[DB直結] 月のid一覧に失敗', month, e && e.message); return null; }
  }

  // ---- 読み: 見積idの一覧 → 元請け(請求書台帳の「依頼元」表示用・v1.4.1116) ----------------
  //   戻り: {id: 元請け} / null=読めない(呼び手は何もしない)
  async function loadMotoukeByIds(ids) {
    if (!canReadSync()) return null;
    var list = (ids || []).filter(function (x) { return /^E[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+$/.test(String(x || '')); });
    if (!list.length) return {};
    try {
      var out = {};
      for (var i = 0; i < list.length; i += 80) {
        var part = list.slice(i, i + 80);
        var rows = await rest('anken_index_v?select=id,motouke&id=in.(' + part.map(encodeURIComponent).join(',') + ')');
        if (!Array.isArray(rows)) return null;
        rows.forEach(function (r) { if (r && r.id) out[r.id] = r.motouke || ''; });
      }
      return out;
    } catch (e) { console.warn('[DB直結] 元請けの読み込みに失敗', e && e.message); return null; }
  }

  async function loadMonths() {
    if (!canReadSync()) return null;
    try {
      var rows = await rest('anken_month_stats_v?select=month,count,newest_modified_at&order=month.desc');
      if (!rows) return null;
      return rows.filter(function (r) { return r && r.month; }).map(function (r) {
        return { month: r.month, count: Number(r.count) || 0, newestModifiedAt: r.newest_modified_at || '' };
      });
    } catch (e) { console.warn('[DB直結] 月一覧の読み込みに失敗→従来経路へ', e && e.message); return null; }
  }

  // ---- 読み: 1件だけ(fileId指定) --------------------------------------------
  //   なぜ要るか: 📥「Drive版で上書き取込」・開いた時の最新採用・保存前の衝突検知 は、どれも
  //   `gasGetLedger(fileId)` でDriveから1件読んでいる。直結で書くと**DBのほうが新しい**ので、
  //   そこだけDriveのままだと「最新を取り込んだつもりが古い版に戻る」事故になる。
  //   戻り: doc / 見つからない・OFF・失敗は null(=呼び出し側は従来どおりDriveから読む)
  // ---- 読み: 見積idで1件(v1.4.1118・請求書の画面から状態だけ書き戻す時に使う) ----------------
  async function loadOneById(id) {
    if (!canReadSync() || !id) return null;
    try {
      var rows = await rest('anken?select=id,doc,source_version,drive_file_id,month&id=eq.' + encodeURIComponent(id) + '&limit=1');
      if (!rows || !rows.length || !rows[0].doc) return null;
      var d = rows[0].doc;
      if (rows[0].source_version != null) { d.version = rows[0].source_version; d._dbLoadedVersion = rows[0].source_version; }
      d._driveFileId = rows[0].drive_file_id || d._driveFileId || '';
      if (rows[0].month) d._driveMonth = rows[0].month;   // v1.4.1119: 射影の月を空にしない
      return d;
    } catch (e) { console.warn('[DB直結] 1件(id)の読み込みに失敗', e && e.message); return null; }
  }
  async function loadOneByFileId(fileId) {
    if (!canReadSync() || !fileId) return null;
    try {
      var rows = await rest('anken_v?select=id,doc,source_version,drive_file_id&drive_file_id=eq.'
        + encodeURIComponent(fileId) + '&limit=1');
      if (!rows || !rows.length || !rows[0].doc) return null;
      var d = rows[0].doc;
      if (rows[0].source_version != null) { d.version = rows[0].source_version; d._dbLoadedVersion = rows[0].source_version; }
      d._driveFileId = rows[0].drive_file_id || d._driveFileId || '';   // ★v1.4.1056: 列を正にする
      return d;
    } catch (e) { console.warn('[DB直結] 1件の読み込みに失敗→従来経路へ', e && e.message); return null; }
  }

  // ---- 書き -----------------------------------------------------------------
  // ★v1.4.1075: **この保存で相手から消えるもの**を列挙する(時刻でなく中身で守る)。
  //   相手(サーバ)に値があり、こちら(手元)が空/無い ものだけを拾う。**足すぶんは何も言わない**。
  //   ⚠守る対象は「消えたら業務が止まるもの」に絞る。全部見ると誤検知だらけになって誰も読まなくなる。
  var PROTECT_TAIKYO = {
    madori: '間取り', menseki: '面積', builtYM: '築年月', builtYears: '築年数',
    contractorName: '契約者名', contractorTel: '契約者TEL', contractStart: '契約開始日',
    taikyoStart: '退去日', taikyoStartTime: '退去時刻', eigyoTantou: '営業担当',
    shoudakuKubun: '承諾区分', kagiNo: '鍵番号', kagiHonsu: '鍵本数',
    corpName: '法人名', corpTel: '法人TEL', memo: 'メモ', lastTaikyo: '前回退去',
    waterCheck: '水道確認', waterHeater: '給湯器', taikyoStatus: '立会状況',
    maeukeHcTenant: 'HC前受(入居者)', maeukeHcOwner: 'HC前受(家主)', tachiaiPerson: '立会担当',
  };
  var PROTECT_META = {
    bukken: '物件名', room: '号室', atena: '元請け', kojiName: '工事名称',
    completeDate: '完了日', invoiceStatus: '請求状態',
  };
  function _blank(v) {
    return v === '' || v == null || (typeof v === 'object' && JSON.stringify(v) === '{}')
        || (Array.isArray(v) && v.length === 0);
  }
  function lostIfOverwrite(theirs, mine) {
    var out = [];
    try {
      if (!theirs || !mine) return out;
      var tm = theirs.meta || {}, mm = mine.meta || {};
      var tt = tm.taikyo || {}, mt = mm.taikyo || {};
      for (var k in PROTECT_TAIKYO) {
        if (!_blank(tt[k]) && _blank(mt[k])) out.push(PROTECT_TAIKYO[k]);
      }
      for (var k2 in PROTECT_META) {
        if (!_blank(tm[k2]) && _blank(mm[k2])) out.push(PROTECT_META[k2]);
      }
      // 明細が減る(行が消える)= いちばん重い。行数だけでなく「金額のある行」で見る
      var paid = function (d) {
        return ((d && d.lines) || []).filter(function (l) {
          if (!l) return false;
          var a = (l.amountOverride != null && l.amountOverride !== '')
                ? Number(l.amountOverride) : (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
          return (l.item && String(l.item).trim()) || a;
        }).length;
      };
      var pt = paid(theirs), pm = paid(mine);
      if (pt > pm) out.push('明細 ' + pt + '行 → ' + pm + '行');
    } catch (e) { /* 判定に失敗したら「消えるものなし」とは言わない=安全側へ */ return ['(中身を比べられませんでした)']; }
    return out;
  }

  function opId() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    return 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
  // ★v1.4.1049: 射影が作れなかったら **直結しない**(GAS経路へ落とす)。
  //   旧は `{"__skip":true}`(=射影を触らない)を送っていたが、それだと**カレンダーが静かに古い台帳を見せる**。
  //   エラーも件数の減りも出ないので誰も気づけない。⚠山田裁定でカレンダー側は保険を持たない(二重に見張らない)ので、
  //   **ここが唯一の防波堤**。GASへ落とせばサーバ側で射影を作り直すので穴が塞がる(遅いほうがまし)。
  //   ⚠`null` は**失敗ではない**。「発注確定でもなく修繕activeでもない案件」に対する正常な答えで、
  //     GASの `wtProjection_` も同じく null を返して射影を消す。そのまま送る。
  function buildProjection(est) {
    if (typeof global.bcBuildProjection !== 'function') return { fail: 'projection.jsが読み込まれていない' };
    var pj;
    try { pj = global.bcBuildProjection(est, est._driveMonth || ''); }
    catch (e) { return { fail: '射影の生成で例外: ' + (e && e.message) }; }
    if (pj && pj.__skip === true) return { fail: '射影の生成に失敗(__skip)' };
    return { pj: pj };
  }
  async function callSave(est, base, opid) {
    var b = buildProjection(est);
    if (b.fail) { var e2 = new Error('no_projection:' + b.fail); e2.noProjection = true; throw e2; }
    var r = await rest('rpc/anken_save', {
      method: 'POST',
      body: JSON.stringify({ p_op_id: opid, p_doc: est, p_base_version: base, p_projection: b.pj }),
    });
    return (typeof r === 'string') ? r : String(r);
  }

  // 戻り: {ok:true, version} / {ok:false, code:'stale'|'deleted'|...}
  //   ⚠ここで throw したものは呼び出し側(gasSaveLedger)が従来経路へ落とす。
  //   ★v1.4.1057: opts.force = **人が「手元の内容で上書きする」と決めた時だけ**true。
  //     衝突で止まったあと、取り込みもできない(未保存保護)ので**出口が無くなる**のを塞ぐための逃げ道。
  //     ⚠自動では絶対に立てない。呼び出し側が、両方の時刻を見せて確認を取ったうえで渡す。
  async function saveLedger(est, opts) {
    opts = opts || {};
    if (!canWriteSync()) return { ok: false, code: 'off' };
    if (!est || !est.id) return { ok: false, code: 'noid' };
    var base = (est._dbLoadedVersion != null) ? Number(est._dbLoadedVersion) : (Number(est.version) || 0);
    if (opts.force) {
      // いまのサーバの版を読んで、それを基準に上書きする(比較交換は生かしたまま=他の端末の割り込みは弾く)
      try {
        var _cur = await rest('anken?select=source_version&id=eq.' + encodeURIComponent(est.id) + '&limit=1');
        if (_cur && _cur[0] && _cur[0].source_version != null) base = Number(_cur[0].source_version) || 0;
      } catch (e) { return { ok: false, code: 'recheck_failed' }; }
      delete est._pendingOpId;                                  // 新しい操作として送る
    }

    // ★v1.4.1049: op_idは「送信の試行」ではなく**「操作」に紐づける**。
    //   応答が落ちた時は**同じop_idで再送**する(=これが冪等の本番)。
    //   ⚠確定した答え(applied/stale/deleted…)が返ったら**その操作は終わり**。次は新しいop_idを採番する。
    //     migration031以降、RPCは処理済みop_idに"その時の結果"を返すので、
    //     拒否されたop_idを使い回すと**永久に同じ拒否が返る**。
    // ★v1.4.1083: **op_idは「中身ごと」**。応答が落ちたあと、再送までに編集が進んでいたら**新しく採番**する。
    //   旧: 同じop_idのまま新しい中身を送っていた。anken_save は op_id を**版より先に**照合する(031)ので、
    //       前回が実は入っていた場合 'already_processed' が返り、**新しい中身は捨てられて ok 扱い**になる
    //       (Driveの写しだけ新しく、DBは古いまま=他の端末は古い内容を見る)。2026-09-25 点検で発覚。
    //   新しいop_idにしても二重には入らない: 版(base)の照合が弾き、stale→読み直し→lostIfOverwrite で判定される。
    if (est._pendingOpId && est._pendingOpFor !== (est.updatedAt || '')) {
      try { console.warn('[DB直結] 応答が落ちた後に編集が進んだので新しいop_idで送ります:', est.id); } catch (e) {}
      delete est._pendingOpId;
    }
    if (!est._pendingOpId) { est._pendingOpId = opId(); est._pendingOpFor = est.updatedAt || ''; }
    var opid = est._pendingOpId;
    var r;
    try { r = await callSave(est, base, opid); }
    catch (e) {
      if (e && e.noProjection) {                 // 射影が作れない=直結しない(GAS経路でサーバ側に作らせる)
        delete est._pendingOpId;
        console.warn('[DB直結] 射影が作れないのでGAS経路に落とします:', e.message);
        return { ok: false, code: 'no_projection' };
      }
      throw e;                                    // 応答が落ちた= _pendingOpId を残したまま上へ(次回同じidで再送)
    }
    delete est._pendingOpId;                      // ここから先は「確定した答え」なので操作は終わり
    if (r === 'applied') {
      est.version = base + 1; est._dbLoadedVersion = base + 1;
      return { ok: true, version: base + 1 };
    }
    if (r === 'already_processed') return { ok: true, version: base + 1 };
    if (r === 'deleted') return { ok: false, code: 'deleted' };
    if (r !== 'stale_version') return { ok: false, code: 'unknown:' + r };
    if (opts.force) return { ok: false, code: 'force_stale' };   // 上書き中にさらに別の書き込みが入った=もう一度やり直す

    // stale_version = 手元の base が古い。**本物の衝突か、単に基準がズレただけか**を読み直して判定する
    //   (GAS経路で保存した直後などは、手元の版だけが取り残される。それは衝突ではない)
    var cur = null;
    try {
      var rows = await rest('anken?select=doc,source_version,updated_at&id=eq.' + encodeURIComponent(est.id) + '&limit=1');
      cur = rows && rows[0];
    } catch (e) { return { ok: false, code: 'recheck_failed' }; }
    if (!cur) return { ok: false, code: 'notfound' };
    // ★v1.4.1094: クラウドでは削除済みなのに、手元は削除を知らない写し → 保存しない(削除した見積を生き返らせない)。
    //   わざと戻す(ゴミ箱から復元)時だけ est.restoredAt が削除時刻より新しい → 通す。
    if (cur.doc && cur.doc.deleted === true && est.deleted !== true) {
      var _delAt = String(cur.doc.deletedAt || ''), _resAt = String(est.restoredAt || '');
      if (!_resAt || (_delAt && _resAt <= _delAt)) {
        return { ok: false, code: 'deleted_remote', remote: cur.doc, version: Number(cur.source_version) || 0 };
      }
    }

    // ★v1.4.1075(2026-09-19): 物差しを **時刻から「中身」へ** 変えた。
    //   🔴ここが「立会情報・間取りが巻き戻る」の真因だった(2026-09-18 コンフォート永和台Ⅲ203ほか7案件)。
    //   旧(v1.4.1055)は localT に **est.updatedAt** を混ぜていた。ところが `saveEstimate()` は
    //   **保存のたびに updatedAt = 今** を押す。⇒ **保存する側の時刻は必ず相手より新しい**
    //   ⇒ 何と比べても「衝突ではない」と答える ⇒ **同時編集では掛け金が常に外れていた**。
    //   実際: 11:16:16 まどかさん保存(立会31項目) → 11:16:18 最上さん保存 → 15項目が消えた。
    //   ⚠GAS経路では同じ誤りを **v1.4.1038(レピュートC102)** と **v1.4.1048(Anera202)** で既に直しており、
    //     1055は **外したはずの物差しを新しい経路に入れ直してしまった**形。
    //
    //   新しい考え方:
    //     A) 土台は `_driveLoadedUpdatedAt` → 無ければ `_driveSavedAt` → それも無ければ **0**
    //        (=自分の保存時刻は使わない。1048と同じ)
    //     B) 時刻で決めきらず **「この保存で何が消えるか」** を見る。消えるものが無ければ通し、
    //        消えるなら止める。⇒ **時刻の比較では同時編集は原理的に判定できない**ため
    //     C) 止めたときは呼び出し側(index.html)が出口を出す(取り込む/上書きするを人が選ぶ)
    // ★v1.4.1090(2026-09-26): **3者で判断する**(読み込んだ時 / 手元 / クラウド最新)。
    //   🔴旧(1075〜1089)は「この保存で消えるもの」(立会・一部のmeta・金額のある明細の行数)が0なら
    //   **最新の版を基準に上書きし直していた**。状態・確定版・発注書・業者/発注額・明細の中身は数えないので、
    //   **古い写しが他の人の新しい入力を黙って消していた**(9/18から毎日。9/26 ヴィラ フィレーチェ101=
    //   まどかさん16:30〜16:31の受注・確定版・発注確定が13:37の写しで消えた/ベルシティ八木山102の発注書 等)。
    //   ⚠土台は **この写しが読み込んだ版**(_dbLoadedVersion)の中身をDBの履歴から取る。
    //     アプリの _bcBaseDocs は見積ごとに1つ=**同じ見積の古い写しと新しい写しを区別できない**
    //     (新しい写しの保存で土台が進むと、古い写しの「巻き戻し」が「自分の変更」に見えてしまう)。
    var _sentUpd = est.updatedAt || '';
    var _baseDoc = null;
    if (est._dbLoadedVersion != null && Number(est._dbLoadedVersion) > 0) {
      try {
        var _hb = await rest('anken_history?select=doc&id=eq.' + encodeURIComponent(est.id)
          + '&source_version=eq.' + Number(est._dbLoadedVersion) + '&order=replaced_at.desc&limit=1');
        _baseDoc = (_hb && _hb[0] && _hb[0].doc) || null;
      } catch (e) { _baseDoc = null; }
    }
    var _dec = (typeof global._bcDbStaleDecide_ === 'function')
      ? global._bcDbStaleDecide_(est, cur.doc, _baseDoc)
      : { action: 'conflict', lost: ['(判定の部品が読み込まれていません)'] };
    var _by = (cur.doc && cur.doc.meta && cur.doc.meta.lastEditor) || (cur.doc && cur.doc.meta && cur.doc.meta.creator) || '別の端末';
    var _at = (cur.doc && cur.doc.updatedAt) || cur.updated_at;
    if (_dec && _dec.action === 'same') {
      // v1.4.1095: 中身が同じ = 書かない。手元の版だけクラウドに合わせる(版だけ進めると、同じ見積を開いている他の画面が止まる)
      est.version = Number(cur.source_version) || 0; est._dbLoadedVersion = est.version;
      return { ok: true, version: est.version, unchanged: true };
    }
    if (!_dec || _dec.action === 'conflict') {
      return { ok: false, code: 'conflict', lost: (_dec && _dec.lost) || [], by: _by, at: _at };
    }
    if (_dec.action === 'adopt') {
      // 手元は読み込んだ時から何も変えていない = 古い写し。保存せずクラウドの最新を取り込ませる
      if ((est.updatedAt || '') !== _sentUpd) return { ok: false, code: 'conflict', lost: _dec.lost || [], by: _by, at: _at };
      return { ok: false, code: 'adopt', remote: cur.doc, version: Number(cur.source_version) || 0 };
    }
    if (_dec.action === 'merged') {
      est.meta = _dec.merged.meta;
      est.lines = _dec.merged.lines;
      est.updatedAt = new Date().toISOString();
      delete est._pendingOpId;
    }
    // _dec.action === 'rebase'(相手は中身を変えていない) / 'merged'(重ならない変更を合流した)
    // 基準がズレていただけ → 現在の版で1回だけやり直す
    //   ⚠これは**新しい操作**(前の op_id は stale_version で確定済み。使い回すと永久に stale が返る)
    var base2 = Number(cur.source_version) || 0;
    if (!est._pendingOpId) { est._pendingOpId = opId(); est._pendingOpFor = est.updatedAt || ''; }
    var opid2 = est._pendingOpId;
    var r2;
    try { r2 = await callSave(est, base2, opid2); }
    catch (e2) {
      if (e2 && e2.noProjection) { delete est._pendingOpId; return { ok: false, code: 'no_projection' }; }
      throw e2;                                   // 応答が落ちた=同じop_idで次回再送
    }
    delete est._pendingOpId;
    if (r2 === 'applied' || r2 === 'already_processed') {
      est.version = base2 + 1; est._dbLoadedVersion = base2 + 1;
      return { ok: true, version: base2 + 1, retried: true, merged: (_dec.action === 'merged') ? _dec.theirKeys : null };
    }
    return { ok: false, code: 'retry_failed:' + r2 };
  }

  // ---- 書き: 「自分が変えた欄だけ」をDBの最新に載せて保存する(v1.4.1119) ----------------
  //   なぜ: 進捗・売上集計・請求書の画面は、**手元の見積を丸ごと** GAS の save-ledger へ送っていた。
  //        GAS は版を「DBとDriveの新しい方+1」に振り直す(ver93)ので**DBの版の照合が効かない**うえ、
  //        この3画面は「読み込んだ時刻」も送らない=**止める仕組みが何も無い**。手元が古ければ、
  //        その古い中身で他の人の入力を丸ごと上書きする(9/17 八乙女A201・10/6 コーポ川内203 と同じ形)。
  //   どうするか: DBから最新を1件読み、そこへ**自分が変えた欄だけ**を載せ、版の照合つき(anken_save)で保存する。
  //     opts.fields = ['invoiceStatus', …] … その meta の欄だけ載せる(請求・入金などの切り替え。押した人の値で決める)
  //     opts.base   = 画面が読み込んだ時の {meta, lines} … 3者で比べ、自分が変えた欄だけ載せる。
  //                   相手も同じ欄を変えていたら**相手の値を残す**(黙って上書きしない)= kept に入れて返す
  //   ⚠明細(lines)は index.html と同じく**丸ごと1つの欄**として扱う(行の途中を混ぜない)。
  //   戻り: {ok:true, doc, applied:[…], kept:[…]} / {ok:true, unchanged:true, doc, kept} / {ok:false, code}
  //     code: 'nologin'(ログインが切れている) / 'off'(書き直結が使えない) / 'nobase' / 'notfound' / 'busy' / その他
  var _PC_IGNORE = { 'meta.lastEditor': 1, 'meta.lastEditedAt': 1 };
  function _pcFlat(o, prefix, out) {
    out = out || {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).forEach(function (k) {
      var v = o[k], p = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) _pcFlat(v, p, out);
      else out[p] = JSON.stringify(v === undefined ? null : v);
    });
    return out;
  }
  function _pcGet(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function _pcSet(o, p, val) {
    var ks = p.split('.'), cur = o;
    for (var i = 0; i < ks.length - 1; i++) { if (!cur[ks[i]] || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {}; cur = cur[ks[i]]; }
    cur[ks[ks.length - 1]] = val;
  }
  function _pcDel(o, p) {
    var ks = p.split('.'), par = _pcGet(o, ks.slice(0, -1).join('.'));
    if (ks.length === 1) par = o;
    if (par && typeof par === 'object') { try { delete par[ks[ks.length - 1]]; } catch (e) {} }
  }
  async function pushChanges(id, local, opts) {
    opts = opts || {};
    try { await refresh(); } catch (e) {}
    if (!token()) return { ok: false, code: 'nologin' };
    if (!canWriteSync()) return { ok: false, code: 'off' };
    if (!id || !local) return { ok: false, code: 'noid' };
    var base = null;
    if (!Array.isArray(opts.fields)) {
      try { base = (typeof opts.base === 'string') ? JSON.parse(opts.base) : opts.base; } catch (e) { base = null; }
      if (!base) return { ok: false, code: 'nobase' };
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      var fresh = await loadOneById(id);
      if (!fresh) return { ok: false, code: 'notfound' };
      if (!fresh.meta) fresh.meta = {};
      var applied = [], kept = [];
      if (Array.isArray(opts.fields)) {
        opts.fields.forEach(function (f) {
          var p = 'meta.' + f, mv = _pcGet(local, p);
          if (mv === undefined) return;
          if (JSON.stringify(_pcGet(fresh, p)) !== JSON.stringify(mv)) { _pcSet(fresh, p, JSON.parse(JSON.stringify(mv))); applied.push(p); }
        });
      } else {
        var fb = _pcFlat({ meta: base.meta || {}, lines: base.lines || [] });
        var fm = _pcFlat({ meta: local.meta || {}, lines: local.lines || [] });
        var fr = _pcFlat({ meta: fresh.meta || {}, lines: fresh.lines || [] });
        var paths = {}; Object.keys(fb).forEach(function (k) { paths[k] = 1; }); Object.keys(fm).forEach(function (k) { paths[k] = 1; });
        var sets = [], dels = [];
        Object.keys(paths).forEach(function (p) {
          if (_PC_IGNORE[p]) return;
          var b = fb[p], m = fm[p], r = fr[p];
          if (m === b) return;                 // 自分は変えていない
          if (r === m) return;                 // もう同じ値
          if (r !== b) { kept.push(p); return; } // 相手も変えていた → 相手の値を残す
          if (m === undefined) dels.push(p); else sets.push(p);
        });
        dels.forEach(function (p) { _pcDel(fresh, p); });
        sets.forEach(function (p) { _pcSet(fresh, p, JSON.parse(fm[p])); });
        applied = dels.concat(sets);
      }
      if (!applied.length) return { ok: true, unchanged: true, doc: fresh, applied: [], kept: kept };
      fresh.updatedAt = new Date().toISOString();
      var nm = me() || String(_dbName || '').trim(); if (nm) { fresh.meta.lastEditor = nm; fresh.meta.lastEditedAt = fresh.updatedAt; }   // 進捗・売上集計の画面は担当者名を持たないことがある
      var r2 = null;
      try { r2 = await saveLedger(fresh, {}); } catch (e) { r2 = { ok: false, code: 'error:' + String((e && e.message) || '').slice(0, 60) }; }
      if (r2 && r2.ok) return { ok: true, doc: fresh, applied: applied, kept: kept };
      // 版がずれた(読んでから保存までの間に誰かが保存した)=読み直してやり直す。それ以外は諦めて呼び出し側へ
      if (!r2 || !/stale|conflict|force_stale|adopt/.test(String(r2.code || ''))) return { ok: false, code: (r2 && r2.code) || 'unknown' };
    }
    return { ok: false, code: 'busy' };
  }

  // ---- 書き: 物件マスタ(2026-09-20) ------------------------------------------
  //   なぜ: 読みは 1.4.1067 でDB直読みにしたが、**書きはスプシのままだった**ので DBが取り残される。
  //        実測(2026-09-20) スプシ458件 / DB457件。3日で1件ズレた(新しく登録した物件が候補に出ない)。
  //   ⚠テーブルへの直接書きは開いていない(authenticatedはSELECTのみ)。**RPC経由**(台帳と同じ作法)。
  //   🔴RPC側に歯止めがある: **0件は拒否 / 既存より1割以上減る反映は拒否**(force で越える)。
  //     2026-09-17に「458件→422件で入れ替えて41物件を消しかけた」実例があるため。
  //   ⚠**消す操作はしない**(スプシに無い物件をDBから消さない)。
  //   戻り: {ok:true, before, received, inserted, updated, after} / 失敗は throw(呼び出し側が表示する)
  async function saveBukken(rows, opts) {
    opts = opts || {};
    if (!canWriteSync()) throw new Error('db直結が無効です');
    var r = await rest('rpc/bukken_bulk_upsert', {
      method: 'POST',
      body: JSON.stringify({ p_rows: rows || [], p_actor: me() || '', p_force: !!opts.force }),
    });
    return r;
  }
  // ---- 立会チェック(退去立会表)をDBで(2026-10-02・1.4.1107・migration 069) ----------------
  //   なぜ: 端末ごとに Gmail から取って解析し、全体ビューのHTML(1〜2MB)を localStorage に保存していた。
  //        容量超過で黙って空になる・共有は Drive 経由で端末ごとに結果が違いうる(10/2 まどか/山田「反映されない」)。
  //   形: 解析した行(entries)と差分(changes)をDBに。取った端末が put、全端末は load して描く。
  //   戻り: load → {latest:{id,file_name,file_date,mail_at,by,created_at,entries}, prev:{file_name,file_date}|null, changes:[...]}
  //         / **null = 従来どおり端末保存(localStorage)+Drive共有へ**(落ちても止まらない)
  async function tachiaiLoad() {
    if (!canReadSync()) return null;
    try {
      var snaps = await rest('tachiai_snapshots?select=id,file_name,file_date,mail_at,by,created_at,entries&order=id.desc&limit=2');
      if (!Array.isArray(snaps)) return null;
      var since = new Date(Date.now() - 30 * 86400000).toISOString();
      var changes = await rest('tachiai_changes?select=id,snapshot_id,detected_at,prev_file,new_file,type,sheet,date,bukken,heya,time,tanto'
                             + '&confirmed_at=is.null&detected_at=gte.' + encodeURIComponent(since) + '&order=id.desc&limit=500');
      return { latest: snaps[0] || null, prev: snaps[1] ? { file_name: snaps[1].file_name, file_date: snaps[1].file_date } : null,
               changes: Array.isArray(changes) ? changes : [] };
    } catch (e) { try { console.warn('[db直読み] 立会表が読めず→従来へ:', e.message); } catch (e2) {} return null; }
  }
  // 戻り: {result:'inserted'|'exists', id, changes} / 失敗は throw
  async function tachiaiPut(snap, changes) {
    if (!canWriteSync()) throw new Error('db直結が無効です');
    return await rest('rpc/tachiai_put_snapshot', {
      method: 'POST',
      body: JSON.stringify({ p_file_name: snap.file_name, p_file_date: snap.file_date || null, p_mail_at: snap.mail_at || null,
                             p_entries: snap.entries || {}, p_changes: changes || [] }),
    });
  }
  async function tachiaiConfirm() {
    if (!canWriteSync()) throw new Error('db直結が無効です');
    return await rest('rpc/tachiai_confirm_all', { method: 'POST', body: '{}' });
  }

  // ---- 書き: 物件マスタ 1件(2026-09-29・1.4.1103) --------------------------------
  //   なぜ: 1件編集の保存はスプシだけに行き、DBは📤反映の時だけだった(9/20から誰も押さず9日ズレ)。
  //        読みはDB直読みなので「登録したばかりの物件が起動のたびに消える」形になる(9/29 まどか)。
  //   bukken_bulk_upsert は全件用(1割減で拒否)なので、1件用の口(065)を呼ぶ。
  //   戻り: {ok:true, action:'inserted'|'updated'|'unchanged'} / 失敗は throw(呼び出し側が赤で出す)
  async function saveBukkenOne(doc) {
    if (!canWriteSync()) throw new Error('db直結が無効です');
    return await rest('rpc/bukken_upsert_one', {
      method: 'POST',
      body: JSON.stringify({ p_doc: doc || {}, p_actor: me() || '' }),
    });
  }
  async function deleteBukkenOne(name) {
    if (!canWriteSync()) throw new Error('db直結が無効です');
    return await rest('rpc/bukken_delete_one', {
      method: 'POST',
      body: JSON.stringify({ p_name: name || '', p_actor: me() || '' }),
    });
  }

  // ---- 読み: 要望・バグ板(2026-09-19) ----------------------------------------
  //   なぜ: バグ板は **GAS+Driveのまま**だった。`list-templates` で一覧を取り、
  //        変わった投稿だけ `get-template` で**1件ずつ**取りに行く作り(6並列)。
  //        投稿は129件・合計19.6MB(平均153KB・最大919KB=スクショ同梱の古い分)あり、
  //        **タブを開くたびに数秒〜数十秒**かかっていた(山田「同期が遅い」2026-09-19)。
  //   DBには既に `templates`(kind=feedback 129件)が入っていて、RLSも開いている。**使っていなかっただけ**。
  //   ⚠設計: **メタ(一覧)と本文を分ける**。
  //     ・一覧 = `templates_v`(content を含まないビュー)。129件で十数KB=**一瞬**。
  //       新着マークもこれだけで出せる(本文を1件も読まずに「誰がいつ上げたか」が分かる)
  //     ・本文 = 変わったものだけ `templates` から。ふだんは0件=**何も読まない**
  //   戻り: 配列 / **null = 呼び出し側は従来どおりGASへ**(落ちても止まらない)
  async function loadFeedbackMeta() {
    if (!canReadSync()) return null;
    try {
      var rows = await rest('templates_v?kind=eq.feedback&select=drive_file_id,name,bytes,actor,updated_at'
                          + '&order=updated_at.desc&limit=2000');
      if (!Array.isArray(rows)) return null;
      return rows;
    } catch (e) { try { console.warn('[db直読み] バグ板の一覧が読めず→GASへ:', e.message); } catch (e2) {} return null; }
  }
  //   fileIds の本文だけ取る。多いときは分けて投げる(URLが長くなりすぎないように)
  async function loadFeedbackContent(fileIds) {
    if (!canReadSync()) return null;
    var ids = (fileIds || []).filter(Boolean);
    if (!ids.length) return [];
    try {
      var out = [];
      for (var i = 0; i < ids.length; i += 30) {
        var chunk = ids.slice(i, i + 30);
        var rows = await rest('templates?kind=eq.feedback&select=drive_file_id,content,updated_at'
                            + '&drive_file_id=in.(' + encodeURIComponent(chunk.join(',')) + ')');
        if (!Array.isArray(rows)) return null;
        out = out.concat(rows);
      }
      return out;
    } catch (e) { try { console.warn('[db直読み] バグ板の本文が読めず→GASへ:', e.message); } catch (e2) {} return null; }
  }

  // ---- 読み: 物件マスタ(2026-09-17) ------------------------------------------
  //   なぜ: 起動と「🔄取込」で GASのdoGetが**スプシ3枚を毎回読んで351KB**返している(実測3.8〜90秒・中央値13秒)。
  //        物件マスタは DBの bukken に**シートと同じ形(docまるごと)**で入っているので、ここだけ先に置き換える。
  //        ⚠ bukkenテーブルは2026-09-17にスプレッドシート(正本)から入れ直し済み(457件・33項目)。
  //   戻り: 配列(シートの1行と同じ形) / **null = 呼び出し側は従来どおりGASから取る**
  //   安全弁: ①未ログイン/名簿OFFは null ②0件は信用しない ③**手元の8割未満なら信用しない**(流し込み途中を掴まない)
  async function loadBukken(localCount) {
    if (!canReadSync()) return null;
    try {
      var out = [];
      for (var from = 0; from <= 5000; from += 500) {
        var rows = await rest('bukken?select=doc&order=name.asc&limit=500&offset=' + from);
        if (!Array.isArray(rows)) return null;
        for (var i = 0; i < rows.length; i++) {
          var doc = rows[i] && rows[i].doc;
          if (doc && doc.name) out.push(doc);
        }
        if (rows.length < 500) break;
      }
      if (!out.length) return null;                                   // 0件=信用しない
      var base = Number(localCount) || 0;
      if (base >= 20 && out.length < base * 0.8) {
        console.warn('[DB直読み] 物件マスタが手元より大幅に少ない(DB ' + out.length + ' / 手元 ' + base + ') → 従来経路へ');
        return null;
      }
      return out;
    } catch (e) { console.warn('[DB直読み] 物件マスタ:', e && e.message); return null; }
  }

  // ---- 単価マスタ(2026-09-21・段2) ------------------------------------------
  //   なぜ: スマホ単価表に**編集画面(段3)**が付き、そこは `tanka_items` を直に書く。
  //     アプリがGoogleシートを読んだままだと、**単価表で直しても見積に出ない**
  //     =「単価表では直っているのに見積は古い単価のまま」。金額なので気づくのは請求の後。
  //
  //   🔴**読みだけ切ってはいけない。必ず saveMasterRow(書き)とセットで使うこと。**
  //     読みだけDBに向けると、アプリでの編集はシートに行き、**次の取込で自分の編集が消える**。
  //     いまの「単価表の編集が届かない」より悪くなる。
  //
  //   ⚠`tanka_items.doc` は **シートの行そのもの**(日本語キー)なので、そのままマスタ行として使える。
  //     細い列(prices/hatchu/…)はスマホ単価表の表示用の派生なので、アプリは見ない。
  var _tankaVer = null;   // {項目番号: version} … 書く時の楽観ロックに使う。行には混ぜない(シートに漏れるため)

  // 戻り: 配列(マスタ行) / **null = 呼び出し側は従来どおりGAS(シート)へ**。落ちても止まらない
  async function loadMaster(localCount) {
    if (!canReadSync()) return null;
    var t = token(); if (!t) return null;
    try {
      var out = [], vers = {}, total = null, PAGE = 500;
      for (var from = 0; from <= 20000; from += PAGE) {
        var url = SB_URL + '/rest/v1/tanka_items?select=item_no,doc,version&is_deleted=eq.false&order=item_no.asc';
        var r = await fetch(url, { headers: {
          apikey: SB_KEY, Authorization: 'Bearer ' + t, Accept: 'application/json',
          Range: from + '-' + (from + PAGE - 1), 'Range-Unit': 'items', Prefer: 'count=exact',
        } });
        // 表がまだ無い/形が違う = 段0前。例外にせず従来経路へ
        if (r.status === 404 || r.status === 400) return null;
        if (!(r.status === 200 || r.status === 206)) throw new Error('http' + r.status);
        // 🔑総件数を受け取って、最後に受信数と突き合わせる(**流し込み途中を掴まない**)
        if (total === null) {
          var cr = String(r.headers.get('content-range') || '');        // 例 "0-499/403"
          var m = cr.match(/\/(\d+)\s*$/);
          if (m) total = Number(m[1]);
        }
        var rows = await r.json();
        if (!Array.isArray(rows)) throw new Error('形が違う');
        for (var i = 0; i < rows.length; i++) {
          var d = rows[i] && rows[i].doc;
          if (!d || typeof d !== 'object' || !d['項目番号']) continue;
          out.push(d);
          vers[String(d['項目番号'])] = Number(rows[i].version) || 0;
        }
        if (rows.length < PAGE) break;
      }
      // ① 0件は「そういう答え」にしない(流し込み前 or 読めていない)
      if (!out.length) return null;
      // ② 総件数と受信数が合わなければ信用しない
      if (total != null && out.length !== total) {
        console.warn('[DB直読み] 単価マスタの件数が合わない(受信 ' + out.length + ' / 総数 ' + total + ') → 従来経路へ');
        return null;
      }
      // ③ 手元より大幅に少なければ信用しない(激減ガードの前段)
      var base = Number(localCount) || 0;
      if (base >= 20 && out.length < base * 0.8) {
        console.warn('[DB直読み] 単価マスタが手元より大幅に少ない(DB ' + out.length + ' / 手元 ' + base + ') → 従来経路へ');
        return null;
      }
      _tankaVer = vers;
      return out;
    } catch (e) { console.warn('[DB直読み] 単価マスタ:', e && e.message); return null; }
  }

  function masterVersionOf(itemNo) {
    if (!_tankaVer) return null;
    var v = _tankaVer[String(itemNo)];
    return (v === undefined) ? null : v;
  }

  // 1行を書く。⚠`doc` は**変えたキーだけ**でよい(サーバ側がキー単位でマージする)。
  //   `null` を入れたキーは**削除**(=欄を空に戻す)。`0` は「0という値」として残る。
  //   戻り: 'applied' / 'stale_version' / 'not_loaded' / 'item_no_mismatch' / 'no_such_item' / 'already_processed'
  //   ⚠金額キーが整数でないとサーバが**例外**を返す(黙って丸めない)。呼び元は throw を拾って赤く出すこと。
  async function saveMasterRow(itemNo, doc, version, opts) {
    opts = opts || {};
    if (!canWriteSync()) throw new Error('db直結が無効です');
    var no = Number(itemNo);
    if (!no || no < 1) throw new Error('項目番号がありません');
    var r = await rest('rpc/tanka_set_item', {
      method: 'POST',
      body: JSON.stringify({
        p_op_id: opts.opId || opId(), p_item_no: no, p_doc: doc || {},
        p_version: (version === null || version === undefined) ? null : Number(version),
        p_actor: me() || '',
      }),
    });
    var code = (typeof r === 'string') ? r : (r && r.tanka_set_item) || String(r || '');
    if (code === 'applied' && _tankaVer) _tankaVer[String(no)] = (Number(version) || 0) + 1;
    return code;
  }

  // ---- 新規品目(2026-10-02・v1.4.1108・カレンダー相談): **番号はDBが採番**(tanka_add_item・max+1・op_idで冪等)
  //   なぜ: アプリは手元で max+1 を付けてシートだけに書いていた。カレンダー(スマホ単価表)もDBで採番すると同じ番号が
  //        2つできて、朝の sheet:load が片方を飛ばす=消えたように見える。新規追加は全部ここに一本化。
  //   戻り: 採番された項目番号(整数)。失敗は throw。
  async function addMasterRow(doc, opts) {
    opts = opts || {};
    if (!canWriteSync()) throw new Error('db直結が無効です');
    var d = Object.assign({}, doc || {}); delete d['項目番号'];
    var r = await rest('rpc/tanka_add_item', {
      method: 'POST',
      body: JSON.stringify({ p_op_id: opts.opId || opId(), p_doc: d, p_actor: me() || '' }),
    });
    var no = (typeof r === 'number') ? r : (r && (r.tanka_add_item != null ? r.tanka_add_item : r)) ;
    no = Number(no);
    if (!no || no < 1) throw new Error('採番の答えが読めません: ' + JSON.stringify(r).slice(0, 80));
    if (!_tankaVer) _tankaVer = {};
    _tankaVer[String(no)] = 1;   // 以後の編集は tanka_set_item(版1)で通る
    return no;
  }

  // ---- 書き: 請求書台帳(2026-09-25・v1.4.1083・migration053と対) --------------------
  //   請求書ページ(invoice.html)は別ページで、**ログインの更新(index.htmlの60秒ごと)が動いていない**。
  //   開いたまま1時間たつと期限切れで書けなくなるので、書く直前に自分で更新する。
  //   ⚠(1084で訂正)「同じ窓でページを移るので同時に更新は走らない」は**誤り**。Shift/Ctrl/中ボタンで invoice.html は
  //     別窓で開ける(main.js setWindowOpenHandler が許可)。ただしどちらも更新の直前に localStorage を読み直すので、
  //     先に片方が更新すれば他方は新しい期限を見て何もしない。真に同時でも Supabase の更新トークン再利用猶予(既定10秒)で失効しない。
  async function ensureFresh() {
    var s = session();
    if (!s || !s.refresh_token) return !!token();
    if ((Number(s.expires_at) || 0) - Date.now() > 2 * 60 * 1000) return true;
    try {
      var r = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      var j = await r.json();
      if (r.ok && j && j.access_token) {
        localStorage.setItem('bc_sb_session', JSON.stringify({
          access_token: j.access_token, refresh_token: j.refresh_token,
          expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
          email: (j.user && j.user.email) || s.email || '',
          role: (j.user && j.user.app_metadata && j.user.app_metadata.bc_role) || s.role || '' }));
      }
    } catch (e) {}
    return !!token();
  }
  //   docs = 請求書の行(アプリの形のまま)。サーバが _mergeInvoiceLedger と同じ規則で合流する。
  //   戻り: {ok:true, status:'applied'|'already_processed', ...件数} / {ok:false, code}
  //   ⚠通信が落ちた時は throw(=呼び出し側は同じ中身なら同じ op_id で再送する)
  async function saveInvoices(docs, opid) {
    await ensureFresh();
    if (!token()) return { ok: false, code: 'nologin' };
    if (_dbName === null) await fetchDbName();
    await flag();
    if (!canWriteSync()) return { ok: false, code: 'off' };
    var r = await rest('rpc/invoice_merge_many', {
      method: 'POST', body: JSON.stringify({ p_op_id: opid, p_docs: docs || [] }),
    });
    if (r && (r.status === 'applied' || r.status === 'already_processed')) return Object.assign({ ok: true }, r);
    return { ok: false, code: 'unknown:' + JSON.stringify(r).slice(0, 80) };
  }

  // ---- 読み: 請求書台帳(v1.4.1088・読み切替) --------------------------------------
  //   スイッチ = shared_config db_direct の invoiceRead(名前の一覧)/allInvoiceRead(全員)。**既定OFF**。
  //   戻り: 行の doc の配列 / **null = 呼び出し側は従来の塊(GAS)を読む**(OFF・未ログイン・通信失敗・0件)
  //   ⚠0件は信用しない(DBが空=まだ流し込んでいない/読めていない、のどちらでも塊に倒す)
  async function loadInvoices() {
    try {
      await ensureFresh();
      if (!token()) return null;
      if (_dbName === null) await fetchDbName();
      await flag();
      if (!allowed(_flag, 'invoiceRead')) return null;
      var rows = await rest('invoices?select=doc&order=legacy_key.asc&limit=5000');
      if (!Array.isArray(rows) || !rows.length) return null;
      return rows.map(function (r) { return r.doc; }).filter(function (d) { return d && d._key; });
    } catch (e) { try { console.warn('[db直読み] 請求書台帳が読めず→塊(GAS)へ:', e.message); } catch (e2) {} return null; }
  }

  // ---- 書き: 共有設定(v1.4.1088・migration057 mitsu_save_shared_config と対) ---------------
  //   GASの save-shared-config を通さずDBへ直接書く。スイッチ = db_direct の scWrite(名前)/allScWrite(全員)。**既定OFF**。
  //   戻り: {ok:true, via:'db', result} / **null = 呼び出し側は従来のGASへ**(OFF・許可リスト外・未ログイン・失敗)
  //   ⚠失敗(応答落ちを含む)は null → GASが同じ値を書く。共有設定は後勝ち(同じ値の二度書きは害なし)なので安全側。
  var _SC_KEYS = ['yamaichi_invoice_archive', 'kitchen_defaults', 'mitsumori_editing_presence', 'taikyo_tachiai_schedule',
    'taikyo_shiryo_ready', 'jizen_schedule', 'hatchusho_data', 'naiso_hinban_thumbs', 'koji_history_recent', 'shoudakuPositions',
    'material_order_pending', 'order_pending', 'naisoHinban', 'staffMaster', 'keiyaku_status_index', 'ai_assign_rules'];
  function scKeyAllowed(k) { k = String(k || ''); return _SC_KEYS.indexOf(k) >= 0 || /^yamaichi_archive_rows_[A-Za-z0-9_.:-]{1,90}$/.test(k); }
  async function saveSharedConfig(key, value) {
    try {
      if (!scKeyAllowed(key)) return null;
      await ensureFresh();
      if (!token()) return null;
      if (_dbName === null) await fetchDbName();
      await flag();
      if (!allowed(_flag, 'scWrite')) return null;
      var r = await rest('rpc/mitsu_save_shared_config', { method: 'POST',
        body: JSON.stringify({ p_op_id: opId(), p_key: String(key), p_value: (value == null ? '' : String(value)) }) });
      var code = (typeof r === 'string') ? r : String(r || '');
      if (code === 'applied' || code === 'already_processed') return { ok: true, via: 'db', result: code };
      return null;
    } catch (e) { try { console.warn('[db直書き] 共有設定が書けず→GASへ:', key, e.message); } catch (e2) {} return null; }
  }

  // ---- 写真: Supabase Storage の非公開置き場 photos(v1.4.1093・migration 060・カレンダーと共通) ----------------
  //   なぜ: 写真は GAS upload-image で Drive へ上げ「リンクを知っていれば誰でも見られる」共有になっていた
  //        (物件マスタの間取図616枚・品番46枚)。山田裁定(9/27)=ログインした社員だけが見られる置き場へ。
  //   保存する値= 'sb:photos/mitsumori/<kind>/<YYYY-MM>/<uuid>.<ext>'。これを今まで Drive の番号を入れていた欄(driveId)に入れる
  //   (呼び出し元は gasUploadImage / gasDownloadImage の2つだけを通るので、そこで切り替える)。
  //   スイッチ = db_direct の photoStorage(名前)/allPhotoStorage(全員)。**既定OFF**。失敗したら従来の GAS→Drive へ。
  var PHOTO_BUCKET = 'photos', PHOTO_PREFIX = 'sb:photos/';
  var PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function canPhotoSync() { return !!token() && allowed(_flag, 'photoStorage'); }
  function isPhotoRef(v) { return typeof v === 'string' && v.indexOf(PHOTO_PREFIX) === 0; }
  function _uuid() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  // 戻り: 'sb:photos/…' / null(=使わない・上げられなかった → 呼び手は従来のDriveへ)
  async function uploadPhoto(kind, dataUrl) {
    if (!canPhotoSync()) return null;
    var t = token(); if (!t) return null;
    var blob;
    try { blob = await (await fetch(dataUrl)).blob(); } catch (e) { return null; }
    var ext = PHOTO_TYPES[blob && blob.type]; if (!ext) return null;          // HEIC 等はバケットが受けない=Driveへ
    var d = new Date();
    var ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var path = 'mitsumori/' + String(kind || 'image').replace(/[^a-z0-9_-]/gi, '') + '/' + ym + '/' + _uuid() + '.' + ext;
    try {
      var r = await fetch(SB_URL + '/storage/v1/object/' + PHOTO_BUCKET + '/' + path, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + t, 'Content-Type': blob.type, 'x-upsert': 'false', 'cache-control': '3600' },
        body: blob,
      });
      if (!r.ok) { try { console.warn('[写真] 非公開の置き場へ上げられない→Driveへ', r.status, (await r.text()).slice(0, 120)); } catch (e) {} return null; }
      return PHOTO_PREFIX + path;
    } catch (e) { console.warn('[写真] 通信失敗→Driveへ', e && e.message); return null; }
  }
  // 'sb:photos/…' → dataURL(ログインした社員の鍵で直接読む。署名URLは使わない=PDFにもそのまま入る)
  async function downloadPhoto(ref) {
    if (!isPhotoRef(ref)) throw new Error('写真の参照ではありません');
    var t = token(); if (!t) throw new Error('ログインしていないため写真を読めません');
    var path = ref.slice(PHOTO_PREFIX.length);
    var r = await fetch(SB_URL + '/storage/v1/object/authenticated/' + PHOTO_BUCKET + '/' + path, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + t },
    });
    if (!r.ok) throw new Error('写真を読めません HTTP ' + r.status);
    var blob = await r.blob();
    return await new Promise(function (res, rej) {
      var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error('写真の変換に失敗')); };
      fr.readAsDataURL(blob);
    });
  }

  global.bcDbDirect = {
    refresh: refresh, canRead: canReadSync, canWrite: canWriteSync,
    loadMonths: loadMonths, loadMonthIds: loadMonthIds, loadMotoukeByIds: loadMotoukeByIds, loadBukken: loadBukken, loadMonthAll: loadMonthAll, loadMonthDocs: loadMonthDocs, loadOneByFileId: loadOneByFileId, loadOneById: loadOneById, saveLedger: saveLedger,
    status: status,
    saveInvoices: saveInvoices, newOpId: function () { return opId(); },   // v1.4.1083
    loadInvoices: loadInvoices,   // v1.4.1088
    saveSharedConfig: saveSharedConfig,   // v1.4.1088
    // v1.4.1076: **GAS経路からも同じ物差しを使えるように公開する**。
    //   1075では中身チェックをDB直結の経路にしか入れておらず、
    //   **直結が落ちてGASへ落ちた瞬間だけ無防備**だった(2026-09-19 16:10に実際にすり抜けた)。
    loadFeedbackMeta: loadFeedbackMeta, loadFeedbackContent: loadFeedbackContent,   // v1.4.1077
    saveBukken: saveBukken,                                                          // v1.4.1078
    saveBukkenOne: saveBukkenOne, deleteBukkenOne: deleteBukkenOne,                  // v1.4.1103
    tachiaiLoad: tachiaiLoad, tachiaiPut: tachiaiPut, tachiaiConfirm: tachiaiConfirm,  // v1.4.1107(069)
    canPhoto: canPhotoSync, isPhotoRef: isPhotoRef, uploadPhoto: uploadPhoto, downloadPhoto: downloadPhoto,   // v1.4.1093
    // v1.4.1081(段2): 単価マスタ。⚠**loadMaster と saveMasterRow は必ずセットで使う**
    //   (読みだけDBに向けると、アプリでの編集がシートへ行き、次の取込で自分の編集が消える)
    loadMaster: loadMaster, saveMasterRow: saveMasterRow, masterVersionOf: masterVersionOf, addMasterRow: addMasterRow,
    lostIfOverwrite: lostIfOverwrite,
    // v1.4.1119: 端末に覚えた「本来はON」も見る(ログアウトしたまま起動し直しても忘れない)
    wasOn: function () { if (_everOn) return true; try { return localStorage.getItem('bc_dbdirect_wason') === '1'; } catch (e) { return false; } },
    loggedIn: function () { return !!token(); },    // v1.4.1119
    pushChanges: pushChanges,                       // v1.4.1119
    degraded: function () { return _flagDegraded; }, // いま名簿が読めていないか
    _flag: function () { return _flag; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
