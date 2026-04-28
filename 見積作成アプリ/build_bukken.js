// 物件マスタ生成スクリプト
// ユーザーが貼ったTSVを bukken_raw.tsv として保存 → これをパースして bukken.js を生成
// 実行: node build_bukken.js

const fs = require('fs');
const path = require('path');

const tsvPath = path.join(__dirname, 'bukken_raw.tsv');
if (!fs.existsSync(tsvPath)) {
  console.error('bukken_raw.tsv が見つかりません');
  process.exit(1);
}

const raw = fs.readFileSync(tsvPath, 'utf8');
const lines = raw.split(/\r?\n/);

// ヘッダー行を検出(No. で始まる行)
let headerIdx = lines.findIndex(l => /^No\.?\t/.test(l));
if (headerIdx < 0) {
  console.error('ヘッダー行(No.で始まる行)が見つかりません');
  process.exit(1);
}
const header = lines[headerIdx].split('\t');
const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim().length > 0);

// 列インデックスマップを作成
const idx = {};
header.forEach((h, i) => {
  const key = h.trim();
  if (key) idx[key] = i;
});

function pick(cols, name) {
  const i = idx[name];
  return (i != null && cols[i] != null) ? cols[i].trim() : '';
}

const bukkens = [];
dataLines.forEach(line => {
  const cols = line.split('\t');
  const no = pick(cols, 'No.') || pick(cols, 'No');
  const name = pick(cols, '物件名');
  // No も 物件名 も無ければスキップ
  if (!no && !name) return;
  if (!name) return; // 物件名無しの行はスキップ
  bukkens.push({
    no: no,
    moto: pick(cols, '') || cols[1]?.trim() || '', // 2列目の「元請け」は見出しが空のことがある
    motouke: cols[1]?.trim() || '',
    name: name,
    address: pick(cols, '住所'),
    waterCheck: pick(cols, '水道検針'),
    notes: pick(cols, '注意事項'),
    city: pick(cols, '市'),
    area: pick(cols, '地名'),
    type: pick(cols, '区分'),
    parking: pick(cols, '駐車場'),
    checkDate: pick(cols, '確認日'),
    denkiApply: pick(cols, '電気申込'),
    waterApply: pick(cols, '水道申込'),
    autoLock: pick(cols, 'オートロック'),
    digiKey: pick(cols, 'デジキー'),
    loft: pick(cols, 'ロフト'),
    madori: pick(cols, '間取り'),
    accent: pick(cols, 'アクセント'),
    cf: pick(cols, 'CF'),
    lastWork: pick(cols, '施工月'),
    memo: pick(cols, '備考'),
  });
});

const js = `// 自動生成 - build_bukken.js
window.BUKKEN_LIST = ${JSON.stringify(bukkens, null, 1)};
`;
fs.writeFileSync(path.join(__dirname, 'bukken.js'), js, 'utf8');
console.log(`bukken.js 生成完了: ${bukkens.length}件`);
// 元請け別の件数
const byMoto = {};
bukkens.forEach(b => { const k = b.motouke || '?'; byMoto[k] = (byMoto[k]||0)+1; });
console.log('  元請け別:', byMoto);
