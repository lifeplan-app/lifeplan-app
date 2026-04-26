import { describe, it, expect, beforeEach } from 'vitest';
import { createSugCarousel } from '../../spending/calc/sug-carousel.js';

describe('createSugCarousel', () => {
  let c;
  beforeEach(() => { c = createSugCarousel(); });

  it('setAll 後は全件 active、idx=0 が current', () => {
    c.setAll(['a', 'b', 'c']);
    const s = c.state();
    expect(s.active).toEqual(['a', 'b', 'c']);
    expect(s.minimized).toEqual([]);
    expect(s.current).toBe('a');
    expect(s.idx).toBe(0);
  });

  it('minimize すると active から除外されチップ列に移る', () => {
    c.setAll(['a', 'b', 'c']);
    c.minimize('a');
    const s = c.state();
    expect(s.active).toEqual(['b', 'c']);
    expect(s.minimized).toEqual(['a']);
    expect(s.current).toBe('b');
  });

  it('現在表示中のカード(idx=1)を minimize するとその位置を維持（次のカード）', () => {
    c.setAll(['a', 'b', 'c']);
    c.nav(1); // current='b', idx=1
    c.minimize('b');
    const s = c.state();
    expect(s.active).toEqual(['a', 'c']);
    expect(s.idx).toBe(1);
    expect(s.current).toBe('c');
  });

  it('最後のカードを minimize するとインデックスが前のカードへ', () => {
    c.setAll(['a', 'b']);
    c.nav(1); // current='b'
    c.minimize('b');
    const s = c.state();
    expect(s.active).toEqual(['a']);
    expect(s.current).toBe('a');
  });

  it('全件 minimize すると active 空・current null', () => {
    c.setAll(['a']);
    c.minimize('a');
    const s = c.state();
    expect(s.active).toEqual([]);
    expect(s.current).toBeNull();
  });

  it('expand すると minimized から active に戻りそのカードにフォーカス', () => {
    c.setAll(['a', 'b', 'c']);
    c.minimize('a');
    c.expand('a');
    const s = c.state();
    expect(s.active).toEqual(['a', 'b', 'c']);
    expect(s.minimized).toEqual([]);
    expect(s.current).toBe('a');
  });

  it('複数 minimize 後に expand すると元の順序を保ちフォーカス', () => {
    c.setAll(['a', 'b', 'c']);
    c.minimize('a');
    c.minimize('c');
    c.expand('c'); // chips: [a], active: [b, c] → focus c (idx=1)
    const s = c.state();
    expect(s.active).toEqual(['b', 'c']);
    expect(s.current).toBe('c');
  });

  it('nav(1) で次のカードへ進む', () => {
    c.setAll(['a', 'b', 'c']);
    c.nav(1);
    expect(c.state().current).toBe('b');
    c.nav(1);
    expect(c.state().current).toBe('c');
  });

  it('nav は境界を超えない', () => {
    c.setAll(['a', 'b']);
    c.nav(-1);
    expect(c.state().idx).toBe(0);
    c.nav(10);
    expect(c.state().idx).toBe(1);
  });

  it('setAll で消えた ID は minimized からも除去される', () => {
    c.setAll(['a', 'b']);
    c.minimize('b');
    c.setAll(['a']); // 'b' は消滅
    const s = c.state();
    expect(s.minimized).toEqual([]);
    expect(s.active).toEqual(['a']);
  });

  it('setAll を再呼び出しすると既存の minimized を引き継ぐ', () => {
    c.setAll(['a', 'b', 'c']);
    c.minimize('b');
    c.setAll(['a', 'b', 'c']); // 同じリストで再初期化
    const s = c.state();
    expect(s.minimized).toEqual(['b']); // 引き継がれる
    expect(s.active).toEqual(['a', 'c']);
  });

  it('閉じ順が逆でも chips の表示順は元の順序', () => {
    c.setAll(['a', 'b', 'c']);
    c.minimize('c');
    c.minimize('a'); // c より後に minimize
    const s = c.state();
    expect(s.minimized).toEqual(['a', 'c']); // 元順序
  });
});
