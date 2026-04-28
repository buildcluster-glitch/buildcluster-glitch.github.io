// TSV → data.js 変換スクリプト
// 実行: node build.js

const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, 'data_raw.tsv'), 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

const header = lines[0].split('\t');
const rows = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t');
  // タブ数不足で列がズレる行を補正: 施工業者〜クマガイ(index 15-24)の空タブが不足
  // 列数が header と違えば、15番目(JSB直後)の位置に空を挿入して補う
  while (cols.length < header.length) {
    cols.splice(15, 0, '');
  }
  const row = {};
  header.forEach((h, idx) => {
    row[h] = (cols[idx] ?? '').trim();
  });
  // 数値化
  const numFields = ['退去者','オーナー金額','山一地所','山一Dクレ','山一VIP','みどり不動産','ワールドレジデンシャル','丸山不動産','フリューゲル','JSB','思綺美装','こころ','ハルノデザイン','ムラカベ','OMsONE','FKKMOTORS','はやでん','ヒラヤマ設備','クマガイハウス工業','材料費','数量','粗利','産廃数量'];
  numFields.forEach(f => {
    const v = row[f];
    if (v === '' || v == null) { row[f] = null; return; }
    const n = Number(String(v).replace(/,/g,''));
    row[f] = Number.isFinite(n) ? n : null;
  });
  rows.push(row);
}

const js = `// 自動生成 - build.js が data_raw.tsv から生成\nwindow.INITIAL_DATA = ${JSON.stringify(rows, null, 1)};\n`;
fs.writeFileSync(path.join(__dirname, 'data.js'), js, 'utf8');
console.log(`data.js 生成完了: ${rows.length}件`);
