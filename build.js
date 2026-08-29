/* Збирає index.html (для хостингу) з app.html (джерело артефакту).
   Запуск:  node build.js                                            */
const fs = require('fs');

const src = fs.readFileSync('app.html', 'utf8');
const cut = src.indexOf('<style>');
const head = src.slice(0, cut).trim();          // <title> + шрифти
const rest = src.slice(cut);
const styleEnd = rest.indexOf('</style>') + 8;
const css = rest.slice(0, styleEnd);
const body = rest.slice(styleEnd).trim();

const DESC = 'Курс польської мови для українців: два рівні, 20 уроків, живі фрази з транскрипцією кирилицею та діалоги з реального життя.';

const out = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#FAF2E4">
<meta property="og:type" content="website">
<meta property="og:locale" content="uk_UA">
<meta property="og:site_name" content="Polska Easy">
<meta property="og:title" content="Polska Easy 🇵🇱 — курс польської для українців">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Polska Easy 🇵🇱">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="preview.jpg">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>🇵🇱</text></svg>">
${head}
${css}
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync('index.html', out, 'utf8');
console.log('index.html зібрано —', (out.length / 1024).toFixed(0), 'KB');
