// templates_raw.tsv → templates.js 変換
// 実行: node build_templates.js

const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, 'templates_raw.tsv'), 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));

const templates = {};
lines.forEach(line => {
  const cols = line.split('\t');
  if (cols.length < 6) return;
  const [key, item, qty, unit, unitPrice, origPrice] = cols;
  if (!templates[key]) {
    const [kingen, name] = key.split('_');
    templates[key] = { key, 元請け: kingen, name, rows: [] };
  }
  templates[key].rows.push({
    item,
    qty: Number(qty) || 1,
    unit,
    unitPrice: Number(unitPrice) || 0,
    origPrice: Number(origPrice) || 0,
  });
});

// 小計を計算して付加
Object.values(templates).forEach(t => {
  t.total = t.rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
  t.cost  = t.rows.reduce((s, r) => s + r.qty * r.origPrice, 0);
});

const arr = Object.values(templates);
const js = `// 自動生成 - build_templates.js
window.TEMPLATES = ${JSON.stringify(arr, null, 1)};
`;
fs.writeFileSync(path.join(__dirname, 'templates.js'), js, 'utf8');
console.log(`templates.js 生成完了: ${arr.length}テンプレ / ${arr.reduce((s,t)=>s+t.rows.length,0)}明細行`);
