// 拾い出しシートの欄 → 単価表の項目番号(紙の順番どおり)。欄を足すならここに1行足す(見積アプリのビルドは不要)。
// 🔑 金額はここに書かない(このファイルは公開される)。単価はログインした人だけが DB から読む。
// check: 'パカ' など「要確認」は sheet_review:true を付け、対応表(シート欄と単価表の対応.md)で確認してもらう。
(function (root) {
  const O = (l, no, x) => Object.assign({ l, no }, x || {});
  const B = (t) => ({ band: t });
  const G = (id, t, opts, x) => Object.assign({ id, t, opts }, x || {});   // c:1 = 台数を増減できる
  const T = (id, t, vals) => ({ id, t, vals, tag: 1 });                    // 行にならないメモ(間取図や段取り用)

  const SIDE = [
    B('表の横'),
    G('dosma', '玄関土間CF', [O('貼替', 347, { room: '玄関' }), O('施工', 348, { room: '玄関' })]),
    G('tatami', '畳(帖)', [O('表替', 354), O('カラー畳', 355), O('縁無し', 357), O('新規', 358)], { c: 1 }),
    G('fusuma', '襖(面)', [O('大', 359), O('小', 360), O('本襖 大', 361), O('本襖 小', 362), O('板襖 大', 364, { review: 1 }), O('板襖 小', 366, { review: 1 })], { c: 1 }),
    G('shoji', '障子(面)', [O('大', 367), O('小', 368), O('幅広 大', 408), O('幅広 小', 409)], { c: 1 }),
  ];

  const MARU = [
    B('鏡磨き・エアコン洗浄'),
    G('kagami', '鏡磨き', [O('普通', 257), O('縦長', 259), O('ワイド', 258)]),
    G('acw', 'エアコン洗浄', [O('普通', 246), O('ロボット', 247)], { c: 1 }),
    B('ワックス剥離・処分品'),
    G('wax', 'ワックス剥離', [O('要', 'wax'), O('㎡で', 377, { qtyIn: '㎡' })], { c: 0 }),   // qtyIn = 押したら数字を打つ(打つまで行にならない)
    G('shobun', '処分品', [O('物干', 248), O('風呂フタ', 251), O('ガス台', 249), O('ガスストーブ', 250)]),
    B('消耗品交換'),
    G('pakkin', 'パッキン', [O('台所', 80, { room: '台所' }), O('洗濯', 80, { room: '洗面所', specs: '洗濯' }), O('化粧台', 80, { room: '洗面所', specs: '化粧台' }), O('浴室', 80, { room: '浴室' })], { c: 1 }),
    G('denchi', '電池', [O('AC', 86), O('照明', 85), O('ガス', 87), O('チャイム', 88)], { c: 1 }),
    G('kiku', 'キク', [O('小', 93), O('大', 94)], { c: 1 }),
    G('kago', 'カゴ', [O('小', 96), O('大', 97)], { c: 1 }),
    G('chokkan', '直管', [O('10W', 109), O('15W', 110), O('20W', 111), O('40W', 112)], { c: 1 }),
    G('led', 'LED', [O('クリプトン', 104), O('40W', 103)], { c: 1 }),
    B('火災警報器交換'),
    G('kasai', '火災警報器', [O('交換', 78), O('新設', 79)], { c: 1 }),
    B('水回り補修工事'),
    G('dseal', '台所シール', [O('普通', 53), O('幅広', 53, { name: '流し台目地シーリングやりかえ（幅広）', askPrice: 1, review: 1 }), O('ステン脱着', 412)]),
    G('bseal', '浴室シール', [O('腰下', 54), O('全面', 57), O('腰下+洗面ボール', 56), O('腰下+リモコン', 55), O('腰下+洗面ボール+物置台', 422), O('床コの字', 416)]),
    T('bseal2', '浴室の形', ['トイレ一体']),
    G('kseal', '化粧台シール', [O('やりかえ', 58), O('新規', 59)]),
    G('nozzle', '洗濯水栓ノズル', [O('有', 71)]),
    G('shower', 'シャワーホース', [O('有', 69)]),
    G('ball', 'ボールタップ', [O('丸', 68), O('パカ', 415, { review: 1 })], { c: 1 }),
    G('kagami2', '鏡交換', [O('大', 50), O('普通', 48), O('縦長', 51), O('新設', 49)]),
    B('交換・補修工事'),
    G('hos', 'ホスクリーン', [O('普通', 14), O('コンクリ', 15)]),
    G('plate', 'コンセントプレート', [O('普通', 23), O('W', 24), O('神保', 399)], { c: 1 }),
    G('prop', 'プロペラ換気扇', [O('20', 8), O('25', 9)], { c: 1 }),
    G('amido', '網戸', [O('普通', 4), O('上下分割', 5), O('幅広', 6)], { c: 1 }),
    G('touch', 'タッチアップ', [O('有', null, { name: 'タッチアップ補修', unit: '式', askPrice: 1 })]),
    G('cross2', 'クロス補修', [O('洗浄', 260), O('クラック', 375), O('入隅', null, { name: 'クロス入隅補修', unit: '式', askPrice: 1 }), O('補修', null, { name: 'クロス補修', unit: '式', askPrice: 1 })]),
    B('塗装工事'),
    G('shikii', '敷居', [O('普通', 141), O('ワイド', 142), O('台所〜洋室', 140)]),
    G('mado3', '窓枠3方', [O('掃き出し', 128), O('腰窓', 134)], { c: 1 }),
    G('mado4', '窓枠4方', [O('掃き出し', 125), O('腰窓', 131)], { c: 1 }),
    G('agari', '上がり框', [O('有', 137)]),
    B('大工工事'),
    G('daiku', '大工', [O('床鳴り', 154), O('床沈み込み', 155), O('扉カット', 166)], { c: 1 }),
    B('リノッタ'),
    G('renota1', 'カラーズ', [O('6畳以下', 271), O('7畳', 272), O('8畳', 273), O('10畳以下', 274), O('12畳以下', 275)]),
    G('renota2', 'シック', [O('6畳以下', 276), O('7畳', 277), O('8畳', 278), O('10畳以下', 279), O('12畳以下', 280)]),
    T('rt1', '天井 木造', ['クロス', 'ジプトン']),
    T('rt2', '天井 RC', ['クロス', '凹凸']),
    T('rt3', '壁スイッチ', ['有', '無']),
  ];

  const TEIAN = [
    B('照明交換提案'),
    G('turi', 'キッチン吊元灯', [O('普通', 167), O('ワイド', 168), O('ヒモ式', 211), O('ワイド ヒモ式', 417)]),
    G('base', '台所ベースライト', [O('20W', 175), O('40W', 174)]),
    G('yled', '洋室LED', [O('シーリング6畳', 170), O('シーリング8畳', 171), O('シーリング10畳', 172), O('ペンダント', 173)], { c: 1 }),
    G('mini', 'ミニシーリング', [O('玄関', 169, { room: '玄関' }), O('廊下', 169, { room: '廊下' }), O('トイレ', 169, { room: 'トイレ' }), O('洗面', 169, { room: '洗面所' })]),
    B('水回り設備交換提案'),
    G('dsuisen', '台所水栓', [O('壁付', 178), O('台付', 180), O('シングルレバー', 179), O('台付+開口', 181)]),
    G('bsuisen', '浴室水栓', [O('壁付', 182), O('台付', 183)]),
    B('化粧台交換提案'),
    G('kesho', '化粧台', [O('500', 223), O('600', 224), O('750', 225), O('三面鏡750', 226), O('三面鏡900', 227)]),
    B('電気工事提案'),
    G('bkan', '浴室換気扇', [O('単室', 200), O('単室 要開口', 201), O('親子', 202), O('親子 要開口', 203), O('強弱切替', 205)]),
    G('tkan', 'トイレ換気扇', [O('プラグコード', 29, { specs: 'プラグコード' }), O('直結', 29, { specs: '直結' })]),
    G('tenkan', '台所天井付換気扇', [O('有', 204)]),
    G('door', 'TVドアホン', [O('チャイムから', 196), O('インターホンから', 197), O('給電工事あり', 198)]),
    G('acplug', 'エアコン専用コンセント', [O('要', 199)]),
    G('hood', 'レンジフード', [O('600', 207), O('750', 208)]),
    T('hood2', 'レンジフードの高さ', ['普通', '低い', '高い']),
    B('フローリング工事'),
    G('floor', 'フローリング', [O('1F6畳', 228), O('2F6畳', 229), O('1F8畳', 232), O('2F8畳', 233), O('1F6畳+板間', 230), O('2F6畳+板間', 231), O('1F8畳+板間', 234), O('2F8畳+板間', 235), O('置き床6畳', 236)]),
    B('便座交換提案'),
    G('benza', '便座', [O('普通', 217, { review: 1 }), O('普通+コンセント', 220, { review: 1 }), O('温', 218), O('洗浄', 219), O('カス', 222)]),
    B('シート施工提案'),
    G('sheet', 'シート', [O('流し台の面', 239), O('取手', 240), O('浴室 壁4面', 244), O('浴室 床', 245), O('玄関 内', null, { name: '玄関扉内面シート施工', unit: '式', askPrice: 1 }), O('玄関 外', null, { name: '玄関扉外面シート施工', unit: '式', askPrice: 1 })], { c: 1 }),
    B('エアコン交換提案'),
    G('acx', 'エアコン交換', [O('2.2k', 212), O('2.5k', 213), O('2.8k(100V)', 214), O('2.8k(200V)', 215), O('古いので提案', 401)]),
    T('acx2', '室外機の場所', ['壁天', '地']),
    T('acx3', '手配', ['設備業者']),
  ];

  // シートに欄はないが、原状回復の見積で多い行(2026年4月以降・件数の多い順)
  const FREQ = [36, 31, 44, 120, 37, 67, 398, 62, 425, 413, 89, 122, 72, 90, 11, 186, 188];

  const HC = { '1K': 304, '1R': 307, '1DK': 312, '1LDK': 309, '2K': 314, '2DK': 316, '2LDK': 317, '3K': 320, '3DK': 321, '3LDK': 322, '4K': 324, '4DK': 325, '4LDK': 326 };
  const HC_LOFT = { '1K': 306, '1R': 308, '1DK': 313, '1LDK': 310, '2K': 315, '2LDK': 318 };
  const HC_STAIR = { '1LDK': 311, '2DK': 311, '2LDK': 319, '3DK': 319, '3LDK': 323, '4DK': 323 };
  const WAX = { '1K': 252, '1R': 252, '1DK': 253, '1LDK': 254, '2K': 255, '2LDK': 256 };
  // 全面の㎡の「よくある値」(過去の見積の中央値・ばらつきが小さいものだけ。押さない限り入らない)
  const ROOM_HINT = {"2K":{"トイレ":{"wall":9.0,"ceil":2.0}},"1K":{"トイレ":{"wall":9.0,"ceil":2.0},"洋室":{"ceil":12.0},"台所":{"ceil":6.0}},"1LDK":{"トイレ":{"wall":9.0},"玄関":{"wall":14.0,"ceil":3.0}},"2LDK":{"トイレ":{"wall":9.0},"洗面所":{"wall":9.0}},"1DK":{"洋室":{"ceil":10.0}},"2DK":{"トイレ":{"wall":9.0}}};

  const baseMadori = (m) => { const x = String(m || '').normalize('NFKC').toUpperCase().match(/^\d[RKDLS]+/); return x ? x[0].replace('S', '') : ''; };
  const hcItem = (madori, loft, stair) => { const m = baseMadori(madori); if (!m) return null; if (stair && HC_STAIR[m]) return HC_STAIR[m]; if (loft && HC_LOFT[m]) return HC_LOFT[m]; return HC[m] || null; };
  const waxItem = (madori) => WAX[baseMadori(madori)] || null;

  function defaultRooms(madori) {
    const m = baseMadori(madori);
    const n = parseInt(m, 10) || 1;
    const main = /LDK/.test(m) ? 'LDK' : /DK/.test(m) ? 'DK' : /K/.test(m) ? '台所' : '';
    const out = ['玄関'];
    if (main) out.push(main);
    out.push('トイレ', '洗面所');
    if (!m) { out.splice(1, 0, '台所'); out.push('LDK', '洋室', '和室'); }
    else for (let i = 0; i < n; i++) out.push(i === 0 ? '洋室' : '洋室' + (i + 1));
    out.push('CL');
    return out;
  }
  const blankRoom = (name) => ({ name, wall: '', ceil: '', acc: '', ceilType: 'クロス', faces: ['全'], reasons: ['経年変色'], floor: '', floorQty: '', haba: '', miki: '' });
  const faceText = (faces) => (faces.includes('全') || !faces.length) ? '壁全面' : '壁' + faces.join('・') + '面';
  const NUM = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  const ALL_GROUPS = [...SIDE, ...MARU, ...TEIAN].filter((g) => g.opts);
  const OPT = {};
  ALL_GROUPS.forEach((g) => g.opts.forEach((o) => { OPT[g.id + ':' + o.l] = Object.assign({ group: g.t, count: !!g.c }, o); }));

  // doc(押した内容)→ 見積の行。金額は by(項目番号→{name,unit,room,price})から。画面にもDBにもこの形で残す
  function buildLines(doc, by) {
    const out = [];
    const mk = (key, no, o) => {
      const c = (no != null && by[no]) || {};
      const l = Object.assign({ key, no: no == null ? null : no, name: c.name || '', unit: c.unit || '式', price: c.price == null ? 0 : c.price, noPrice: no != null && c.price == null, room: c.room || '', part: '', reason: '', material: '', specs: '', qty: 1, burden: '家主', src: 'tap', cat: c.cat || '' }, o);
      if (!l.room && c.room) l.room = c.room;
      return l;
    };
    const hc = hcItem(doc.madori, doc.loft, doc.stair);
    if (hc) out.push(mk('auto:hc', hc, { src: 'auto', room: '全室' }));
    out.push(mk('auto:334', 334, { src: 'auto', room: '全室' }));
    (doc.rooms || []).forEach((r) => {
      const k = 'r:' + r.name + ':';
      const reason = (r.reasons || []).join('・');
      const kashitsu = (r.reasons || []).some((x) => /過失/.test(x));
      const cross = (suffix, no, qty, part, material) => out.push(mk(k + suffix, no, { src: 'num', room: r.name, qty, part, reason, material, specs: [part, reason, material].filter(Boolean).join(' '), burden: kashitsu ? '入居者' : '家主' }));
      if (NUM(r.wall)) cross('w', 335, NUM(r.wall), faceText(r.faces || []), '無地量産クロス');
      if (NUM(r.ceil)) cross('c', r.ceilType === 'ジプトン' ? 336 : 335, NUM(r.ceil), '天井全面', '無地量産クロス');
      if (NUM(r.acc)) cross('a', 340, NUM(r.acc), '', 'アクセントクロス');
      const floorSpec = { part: '床全面', specs: '床全面' };
      if (r.floor === 'CF') {
        if (r.name === 'トイレ') out.push(mk(k + 'f', 349, Object.assign({ src: 'tap', room: r.name }, floorSpec)));
        else if (r.name === '洗面所') out.push(mk(k + 'f', 350, Object.assign({ src: 'tap', room: r.name }, floorSpec)));
        else if (NUM(r.floorQty)) out.push(mk(k + 'f', 345, Object.assign({ src: 'num', room: r.name, qty: NUM(r.floorQty) }, floorSpec)));
      } else if (r.floor === 'CF重ね' && NUM(r.floorQty)) out.push(mk(k + 'f', 346, Object.assign({ src: 'num', room: r.name, qty: NUM(r.floorQty) }, floorSpec)));
      else if (r.floor === 'FT' && NUM(r.floorQty)) out.push(mk(k + 'f', 369, Object.assign({ src: 'num', room: r.name, qty: NUM(r.floorQty) }, floorSpec)));
      if (NUM(r.haba)) out.push(mk(k + 'h', 371, Object.assign({ src: 'num', room: r.name, qty: NUM(r.haba) }, floorSpec)));
      if (r.miki) out.push(mk(k + 'm', 151, { src: 'tap', room: r.name, qty: r.miki === '2方' ? 2 : 1 }));
    });
    const sel = doc.sel || {};
    ALL_GROUPS.forEach((g) => g.opts.forEach((o) => {
      const key = g.id + ':' + o.l; const v = sel[key]; if (!v) return;
      let no = o.no, src = 'tap', qty = v.qty || 1;
      if (o.qtyIn) { if (!NUM(v.qty)) return; qty = NUM(v.qty); src = 'num'; }
      if (no === 'wax') {
        no = waxItem(doc.madori);
        if (!no) { out.push(mk(key, null, { name: 'ポリッシャー掛け剥離清掃提案', unit: '式', src, qty, askPrice: true })); return; }
      }
      if (no === null && !o.name) return;
      const extra = { src, qty };
      if (o.room) extra.room = o.room;
      if (o.specs) extra.specs = o.specs;
      if (o.name) extra.name = o.name;
      if (o.unit) extra.unit = o.unit;
      if (o.askPrice) extra.askPrice = true;
      out.push(mk(key, no, extra));
    }));
    Object.keys(sel).forEach((key) => { if (key.startsWith('t:')) { const v = sel[key]; out.push(mk(key, Number(key.slice(2)), { src: 'search', qty: v.qty || 1 })); } });
    (doc.free || []).forEach((f) => out.push({ key: f.id, no: null, name: f.name, unit: f.unit || '式', price: NUM(f.price), room: f.room || '', part: '', reason: '', material: '', specs: f.specs || '', qty: NUM(f.qty) || 1, burden: f.burden || '家主', src: 'free', cat: '', askPrice: !NUM(f.price) }));
    const over = doc.over || {}, del = doc.del || {};
    return out.filter((l) => !del[l.key]).map((l) => {
      const o = over[l.key];
      if (!o) return l;
      const c = Object.assign({}, l, o);
      if (o.price !== undefined && o.price !== '') { c.price = Number(o.price) || 0; c.priceEdited = true; c.noPrice = false; c.askPrice = false; }
      if (o.qty !== undefined && o.qty !== '') c.qty = Number(o.qty) || 0;
      return c;
    });
  }
  // 押したのに数字が空で、見積の行にならないもの(床のCF・CF重ね・FTの㎡、ワックスの㎡など)。buildLines と同じ条件
  function waiting(doc) {
    const out = [];
    (doc.rooms || []).forEach((r, i) => {
      if (!r.floor || NUM(r.floorQty)) return;
      if (r.floor === 'CF' && (r.name === 'トイレ' || r.name === '洗面所')) return;
      out.push({ room: r.name, i, what: r.floor, unit: '㎡' });
    });
    const sel = doc.sel || {};
    ALL_GROUPS.forEach((g) => g.opts.forEach((o) => {
      const key = g.id + ':' + o.l; const v = sel[key];
      if (v && o.qtyIn && !NUM(v.qty)) out.push({ key, what: g.t + ' ' + o.l, unit: o.qtyIn });
    }));
    return out;
  }
  const totalOf = (lines) => Math.round(lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));

  // 提案の行を数える(シートの提案の欄+単価表から探して足した提案の項目)。消耗品の「〜交換提案」は数えない
  const TEIAN_IDS = new Set(TEIAN.filter((g) => g.opts).map((g) => g.id));
  const TEIAN_CATS = new Set(['照明交換提案', '水回り設備交換提案', '化粧台交換提案', '電気工事提案', 'フローリング工事', '便座交換提案', 'シート施工提案', '浴室シート施工提案', 'エアコン交換提案', 'スイッチ・コンセント交換提案']);
  const teianCount = (lines) => lines.filter((l) => TEIAN_IDS.has(String(l.key).split(':')[0]) || TEIAN_CATS.has(l.cat)).length;

  const API = { SIDE, MARU, TEIAN, FREQ, OPT, ALL_GROUPS, ROOM_HINT, TEIAN_CATS, baseMadori, hcItem, waxItem, defaultRooms, blankRoom, buildLines, waiting, totalOf, faceText, teianCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.HD = API;
})(typeof window !== 'undefined' ? window : globalThis);
