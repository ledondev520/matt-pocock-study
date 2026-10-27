import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
function tokens(selector) {
  const block = [...css.matchAll(new RegExp(`${selector} \\{([^}]+)\\}`, 'g'))].map(match => match[1]).join('\n');
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(([, key, value]) => [key, value.toUpperCase()]));
}
function luminance(hex) {
  const linear = hex.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
const rows = [];
function check(mode, role, fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  const ratio = (a + 0.05) / (b + 0.05);
  rows.push({ mode, role, fg, bg, ratio: `${ratio.toFixed(2)}:1`, result: ratio >= 4.5 ? 'PASS' : 'FAIL' });
}
for (const [mode, selector] of [['Light', ':root'], ['Dark', '\\.dark']]) {
  const t = { ...tokens(':root'), ...tokens(selector) };
  check(mode, 'Body / page', t.foreground, t.background);
  check(mode, 'Body / card', t.foreground, t.card);
  check(mode, 'Body / corpus, reading', t.foreground, t.panel);
  check(mode, 'Muted / page', t['muted-foreground'], t.background);
  check(mode, 'Muted / card', t['muted-foreground'], t.card);
  check(mode, 'Muted / corpus', t['muted-foreground'], t.panel);
  check(mode, 'Muted / input', t['muted-foreground'], t['panel-inner']);
  check(mode, 'Muted / badges', t['muted-foreground'], t.muted);
  check(mode, 'Link / page', t.link, t.background);
  check(mode, 'Link / panel', t.link, t.panel);
  check(mode, 'Primary button', t['primary-foreground'], t.primary);
  check(mode, 'Quote text', t.foreground, mode === 'Dark' ? '#251A39' : t.muted);
  check(mode, 'Quote attribution', t['muted-foreground'], mode === 'Dark' ? '#251A39' : t.muted);
  check(mode, 'Diagram heading / panel', t.foreground, t.panel);
  check(mode, 'Diagram labels / track & slices', t.foreground, t['slice-bg']);
  check(mode, 'Diagram secondary / panel', t['muted-foreground'], t.panel);
  check(mode, 'Inline diagram labels / card', t.foreground, t.card);
  check(mode, 'Inline diagram details / card', t['muted-foreground'], t.card);
  check(mode, 'Diagram layer completion', t['layer-ink'], t['layer-fill']);
  check(mode, 'Diagram integration warning', t['risk-ink'], t['risk-bg']);
  check(mode, 'Diagram first slice / lime', t['accent-ink'], t.lime);
  check(mode, 'Figure caption / page', t['muted-foreground'], t.background);
  check(mode, 'Article quote / muted', t.foreground, t.muted);
  check(mode, 'Article quote source / muted', t['muted-foreground'], t.muted);
  check(mode, 'Article links / muted', t.link, t.muted);
  check(mode, 'Hero figure labels / nodes', t['hero-text'], t['hero-node']);
  check(mode, 'Hero figure numbers / nodes', t['hero-muted'], t['hero-node']);
  check(mode, 'Hero body / surface', t['hero-text'], t['hero-bg']);
  check(mode, 'Hero muted / surface', t['hero-muted'], t['hero-bg']);
  check(mode, 'Hero accent / surface', t['hero-accent'], t['hero-bg']);
  check(mode, 'Hero button & final node', t['hero-accent-ink'], t['hero-accent']);
  check(mode, 'Corpus entry / outlined row', t.foreground, t['panel-inner']);
  check(mode, 'Footer note & link / page', t['muted-foreground'], t.background);
  check(mode, 'Licences page text / page', t['muted-foreground'], t.background);
  check(mode, 'Licences page links / page', t.link, t.background);
  check(mode, 'Licence text / card', t['muted-foreground'], t.card);
}
for (const [role, fg] of [['Text', '#E9E4F5'], ['Keyword / operator', '#D5ADFF'], ['String', '#C6F432'], ['Function', '#FF91CB'], ['Type', '#9DDFFF'], ['Punctuation', '#C2B7D6'], ['Comment', '#B4A7C8'], ['Line number', '#A394B8']]) {
  check('Both', `Code: ${role}`, fg, '#171126');
}
check('Both', 'Code toolbar', '#C2B7D6', '#211930');
console.table(rows);
if (process.argv.includes('--write')) {
  const design = new URL('../docs/DESIGN.md', import.meta.url);
  const table = ['| Theme | Text / role | Foreground | Background | Contrast | AA |', '| --- | --- | --- | --- | --- | --- |', ...rows.map(r => `| ${r.mode} | ${r.role} | ${r.fg} | ${r.bg} | ${r.ratio} | ${r.result} |`)].join('\n');
  writeFileSync(design, readFileSync(design, 'utf8').replace(/<!-- contrast:start -->[\s\S]*?<!-- contrast:end -->/, () => `<!-- contrast:start -->\n${table}\n<!-- contrast:end -->`));
}
if (rows.some(r => r.result === 'FAIL')) process.exitCode = 1;
