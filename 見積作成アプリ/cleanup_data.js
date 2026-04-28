// data.js を診断してクリーンアップする
// 実行: node cleanup_data.js  → レポートを出しつつ data.js を修正
// 実行: node cleanup_data.js --dry   → 診断のみ(修正しない)

const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry');
const dataJsPath = path.join(__dirname, 'data.js');
const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');
const m = dataJsContent.match(/window\.INITIAL_DATA\s*=\s*(\[[\s\S]*?\]);/);
if (!m) throw new Error('data.js 解析失敗');
const rows = JSON.parse(m[1]);

// 正しい産廃品目名の一覧(これが室名列に来てたらズレてる)
const WASTE_NAMES = new Set(['混合廃棄物','廃プラスチック類','廃プラ','がれき類','金属くず','木くず','紙くず']);
// 室名として妥当な文字列(ヒントとしてのみ使用)
const ROOM_NAMES = new Set(['全室','各室','玄関','台所','洋室','和室','トイレ','洗面所','浴室','ロフト','クローゼット','押入','バルコニー','玄関土間','台所~洋室','台所～洋室','各部屋']);

const fixes = [];

// ===== 強い補正: 施工業者ヒント位置に謎の値があれば右シフト =====
// 元TSVの空タブ不足で「OMsONE以降」に「材料費・室名・数量・粗利・備考・産廃品目・産廃数量」がズレ込んでる行を検出してシフト戻し
const HATCHU_COLS_ORDERED = ['思綺美装','こころ','ハルノデザイン','ムラカベ','OMsONE','FKKMOTORS','はやでん','ヒラヤマ設備','クマガイハウス工業'];
const WASTE_NAMES_ALL = new Set(['混合廃棄物','廃プラスチック類','廃プラ','がれき類','金属くず','木くず','紙くず']);
const ROOM_NAMES_ALL = new Set(['全室','各室','玄関','台所','洋室','和室','トイレ','洗面所','浴室','ロフト','クローゼット','押入','バルコニー','玄関土間','台所~洋室','台所～洋室','各部屋','バックヤード','納戸','書斎','DK','LDK','階段']);

let shiftCount = 0;
rows.forEach(r => {
  // シフト判定: 材料費列が「産廃品目名」(文字列)か null で、OMsONE/FKK/はやでん/ヒラヤマのどれかが意味を持つ値を持っている
  const materialIsWaste = r.材料費 != null && isNaN(Number(r.材料費)) && WASTE_NAMES_ALL.has(String(r.材料費));
  const materialNull = r.材料費 == null;
  const omsNumeric = r.OMsONE != null && !isNaN(Number(r.OMsONE)) && Number(r.OMsONE) >= 50;
  const fkkRoom = ROOM_NAMES_ALL.has(r.FKKMOTORS);
  const hayDenNum1To20 = r.はやでん != null && !isNaN(Number(r.はやでん)) && Number(r.はやでん) > 0 && Number(r.はやでん) <= 20;

  // シフトパターン: OMsONEに材料費相当、FKKに室名、はやでんに数量、ヒラヤマに粗利、クマガイに備考、材料費に産廃品目、室名に産廃数量
  const needsShift = (materialIsWaste || materialNull) && (omsNumeric || fkkRoom || hayDenNum1To20);
  if (needsShift) {
    const issues = [];
    const origMaterial = r.材料費;
    const newMaterial = (r.OMsONE != null && !isNaN(Number(r.OMsONE))) ? Number(r.OMsONE) : r.OMsONE;
    const newRoom = r.FKKMOTORS != null ? r.FKKMOTORS : '';
    const newQty = r.はやでん != null ? r.はやでん : 1;
    const newProfit = r.ヒラヤマ設備 != null ? r.ヒラヤマ設備 : null;
    const newNote = r.クマガイハウス工業 != null ? r.クマガイハウス工業 : '';
    const newWasteName = materialIsWaste ? String(origMaterial) : (r.室名 && WASTE_NAMES_ALL.has(r.室名) ? r.室名 : '');
    // 産廃数量: 現 室名(数値) or 現 産廃品目(数値)
    let newWasteQty = null;
    if (r.室名 != null && !isNaN(Number(r.室名)) && Number(r.室名) > 0) newWasteQty = Number(r.室名);

    // 適用
    r.材料費 = newMaterial;
    r.室名 = newRoom;
    r.数量 = newQty;
    r.粗利 = newProfit;
    r.備考 = newNote;
    if (newWasteName) r.産廃品目 = newWasteName;
    if (newWasteQty != null) r.産廃数量 = newWasteQty;
    // 施工業者ヒント列をクリア
    r.OMsONE = null;
    r.FKKMOTORS = null;
    r.はやでん = null;
    r.ヒラヤマ設備 = null;
    r.クマガイハウス工業 = null;

    issues.push(`列シフト補正: 室名="${newRoom}", 数量=${newQty}, 材料費=${newMaterial}, 産廃品目="${r.産廃品目||''}", 産廃数量=${r.産廃数量||''}`);
    fixes.push({ id:r.項目番号, cat:r.カテゴリー, item:r.項目, issues });
    shiftCount++;
  }
});
console.log(`シフト補正: ${shiftCount}件`);

rows.forEach(r => {
  const id = r.項目番号;
  const cat = r.カテゴリー || '';
  const issues = [];

  // (1) 室名に産廃品目が入っている
  if (WASTE_NAMES.has(r.室名)) {
    issues.push(`室名="${r.室名}" → 空に(本来は産廃品目)`);
    if (!r.産廃品目) r.産廃品目 = r.室名;
    r.室名 = '';
  }
  // (2) 室名が数字
  if (r.室名 != null && r.室名 !== '' && !isNaN(Number(r.室名))) {
    const n = Number(r.室名);
    issues.push(`室名="${r.室名}" は数値 → 空に`);
    // 小数なら産廃数量っぽい
    if (n < 1 && n > 0 && r.産廃数量 == null) r.産廃数量 = n;
    r.室名 = '';
  }
  // (3) 産廃品目が妥当な室名
  if (ROOM_NAMES.has(r.産廃品目)) {
    issues.push(`産廃品目="${r.産廃品目}" → 室名に移動`);
    if (!r.室名) r.室名 = r.産廃品目;
    r.産廃品目 = '';
  }
  // (4) 数量が極端に小さい (0.0005 など)は本来 産廃数量
  if (r.数量 != null && r.数量 !== '' && Number(r.数量) > 0 && Number(r.数量) < 0.01) {
    issues.push(`数量=${r.数量} が極小 → 産廃数量に移動、数量=1`);
    if (r.産廃数量 == null) r.産廃数量 = Number(r.数量);
    r.数量 = 1;
  }
  // (5) 備考が産廃品目(「混合廃棄物」のみ)と同じ
  if (WASTE_NAMES.has(r.備考)) {
    issues.push(`備考="${r.備考}" → 産廃品目に移動`);
    if (!r.産廃品目) r.産廃品目 = r.備考;
    r.備考 = '';
  }

  if (issues.length) fixes.push({ id, cat, item: r.項目, issues });
});

console.log(`診断結果: ${fixes.length}件の異常を検出`);
fixes.slice(0, 40).forEach(f => {
  console.log(`  [${f.id}] ${f.cat} / ${f.item}`);
  f.issues.forEach(i => console.log(`    - ${i}`));
});
if (fixes.length > 40) console.log(`  ... 他 ${fixes.length - 40}件`);

if (dryRun) {
  console.log('\n--dry 指定: 修正は書き戻しません');
} else {
  const js = `// 自動生成 - build.js + build_naiso.js + cleanup_data.js\nwindow.INITIAL_DATA = ${JSON.stringify(rows, null, 1)};\n`;
  fs.writeFileSync(dataJsPath, js, 'utf8');
  console.log(`\ndata.js を書き戻しました`);
}
