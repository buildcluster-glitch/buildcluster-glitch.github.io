// hiroidashi_template.pdf → hiroidashi_template.js (base64埋込) 変換
// 実行: node build_hiroidashi.js
// file:// で PDF を fetch できないため、PDFバイナリを base64 化して JS に埋め込む

const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, 'hiroidashi_template.pdf');
if (!fs.existsSync(pdfPath)) {
  console.error('hiroidashi_template.pdf が見つかりません:', pdfPath);
  process.exit(1);
}

const buf = fs.readFileSync(pdfPath);
const b64 = buf.toString('base64');
const js = `// 自動生成 - build_hiroidashi.js (元: hiroidashi_template.pdf)\nwindow.HIROIDASHI_PDF_BASE64 = "${b64}";\n`;
fs.writeFileSync(path.join(__dirname, 'hiroidashi_template.js'), js, 'utf8');

console.log(`hiroidashi_template.js 生成完了: ${Math.round(buf.length/1024)}KB → base64 ${Math.round(b64.length/1024)}KB`);
