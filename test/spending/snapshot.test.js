// test/spending/snapshot.test.js
// fixture CSV → 期待 entries → snapshot 固定化
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMFCSV, parseZaimCSV } from '../../spending/calc/csv-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

// id フィールドが Date.now() ベースで生成される行は正規化（CSV に ID 列がある場合は安定）
function normalizeEntries(entries) {
  return entries.map(e => ({
    ...e,
    id: e.id.startsWith('csv_') ? '<dynamic>' : e.id,
  }));
}

describe('snapshot: MF CSV パース結果', () => {
  it('mf-normal.csv', () => {
    const text = readFixture('mf-normal.csv');
    const { entries } = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('mf-edge-quotes.csv', () => {
    const text = readFixture('mf-edge-quotes.csv');
    const { entries } = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('mf-unmapped-category.csv', () => {
    const text = readFixture('mf-unmapped-category.csv');
    const { entries } = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('cross-month.csv', () => {
    const text = readFixture('cross-month.csv');
    const { entries } = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
});

describe('snapshot: Zaim CSV パース結果', () => {
  it('zaim-normal.csv', () => {
    const text = readFixture('zaim-normal.csv');
    const { entries } = parseZaimCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
});
