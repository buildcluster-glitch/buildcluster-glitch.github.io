// 水道申込PDFテンプレートを base64 で JS ファイルに埋込
// 実行: node build_suido.js

const fs = require('fs');
const path = require('path');

const TEMPLATES = [
  { key: 'sendai',       file: 'suido_sendai.pdf',       label: '仙台市水道局 開始・廃止 FAX用紙' },
  { key: 'tomiya_start', file: 'suido_tomiya_start.pdf', label: '富谷市 給水使用開始申込書' },
  { key: 'tomiya_stop',  file: 'suido_tomiya_stop.pdf',  label: '富谷市 給水使用中止届' },
  { key: 'taiwa',        file: 'suido_taiwa.pdf',        label: '大和町 水道使用 開始・中止 申込書' },
];

let js = '// 自動生成 - build_suido.js\n';
js += 'window.SUIDO_PDF_TEMPLATES = {};\n';

let totalOrigKB = 0, totalB64KB = 0;
TEMPLATES.forEach(t => {
  const p = path.join(__dirname, t.file);
  if (!fs.existsSync(p)) {
    console.error(`⚠ ${t.file} が見つかりません`);
    return;
  }
  const buf = fs.readFileSync(p);
  const b64 = buf.toString('base64');
  totalOrigKB += Math.round(buf.length / 1024);
  totalB64KB += Math.round(b64.length / 1024);
  js += `window.SUIDO_PDF_TEMPLATES['${t.key}'] = { label: ${JSON.stringify(t.label)}, pdfBase64: "${b64}" };\n`;
  console.log(`  ${t.key}: ${Math.round(buf.length/1024)}KB → ${Math.round(b64.length/1024)}KB`);
});

fs.writeFileSync(path.join(__dirname, 'suido_templates.js'), js, 'utf8');
console.log(`suido_templates.js 生成完了: 合計 ${totalOrigKB}KB → ${totalB64KB}KB`);
