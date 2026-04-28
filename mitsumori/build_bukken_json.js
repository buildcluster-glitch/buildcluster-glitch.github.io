// bukken_info.json (日本語キー) → bukken.js (アプリ用、英語キー) に変換
// 実行: node build_bukken_json.js

const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\山田 裕貴\\Desktop\\bukken_info.json';
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const MAP = {
  'no': 'no',
  '担当': 'motouke',
  '物件名': 'name',
  '住所': 'address',
  '水道検針': 'waterCheck',
  '注意事項': 'notes',
  '市': 'city',
  '地名': 'area',
  '区分': 'type',
  '駐車場': 'parking',
  '確認日': 'checkDate',
  '電気申込': 'denkiApply',
  '水道申込': 'waterApply',
  'キーボックス': 'keyBox',
  'オートロック': 'autoLock',
  'デジキー': 'digiKey',
  'ロフト': 'loft',
  '間取り': 'madori',
  'アクセント': 'accent',
  'CF': 'cf',
  '施工月': 'lastWork',
  '備考': 'memo',
};

const items = src.map(r => {
  const out = {};
  Object.entries(r).forEach(([k, v]) => {
    const key = MAP[k] || k;
    out[key] = (v != null ? String(v).trim() : '');
  });
  // 物件名無しはスキップ
  if (!out.name) return null;
  return out;
}).filter(Boolean);

const js = `// 自動生成 - build_bukken_json.js
window.BUKKEN_LIST = ${JSON.stringify(items, null, 1)};
`;
fs.writeFileSync(path.join(__dirname, 'bukken.js'), js, 'utf8');
console.log(`bukken.js 生成完了: ${items.length}件`);
// 元請け別件数
const byMoto = {};
items.forEach(b => { const k = b.motouke || '?'; byMoto[k] = (byMoto[k]||0)+1; });
console.log('  元請け別:', byMoto);
