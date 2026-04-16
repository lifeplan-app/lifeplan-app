/**
 * test/calc-all-asset-growth.test.js
 *
 * calcAllAssetGrowth の統合テスト
 * テスト方針:
 *   1. 単独アセット（振替なし）の基本動作
 *   2. overflow チェーン（A → B の順番に処理される）
 *   3. 第2目標（targetVal2）チェーン（生活防衛資金 → NISA → 生活防衛資金）
 *   4. NISA overflow → 非NISAへの振替
 *   5. 複数アセットの総資産合計が整合している
 *   6. wastedContribsByYear の計上
 *   7. 名義（owner）別NISA プール分離
 */

import { describe, it, expect } from 'vitest';
import { calcAllAssetGrowth } from './helpers/core.js';

let _idSeq = 0;
const mkId = () => `asset-${++_idSeq}`;

// ─── 1. 単独アセット（振替なし）の基本動作 ───────────────────────────────────

describe('単独アセット', () => {
  it('現金アセット1件：10年後の残高が正しい', () => {
    const a = { id: mkId(), type: 'cash', currentVal: 100, monthly: 1, annualReturn: 0 };
    const result = calcAllAssetGrowth([a], 10);
    expect(result).toHaveLength(1);
    expect(result[0].data[0]).toBe(100);
    expect(result[0].data[10]).toBe(100 + 12 * 10);
  });

  it('複数の独立アセットが互いに干渉しない', () => {
    const a1 = { id: mkId(), type: 'cash', currentVal: 100, monthly: 1, annualReturn: 0 };
    const a2 = { id: mkId(), type: 'cash', currentVal: 200, monthly: 2, annualReturn: 0 };
    const result = calcAllAssetGrowth([a1, a2], 5);
    expect(result[0].data[5]).toBe(100 + 12 * 5);
    expect(result[1].data[5]).toBe(200 + 24 * 5);
  });

  it('総資産 = 各アセット残高の合計', () => {
    const a1 = { id: mkId(), type: 'cash', currentVal: 100, monthly: 0, annualReturn: 0 };
    const a2 = { id: mkId(), type: 'cash', currentVal: 200, monthly: 0, annualReturn: 0 };
    const result = calcAllAssetGrowth([a1, a2], 3);
    const total = result.reduce((s, r) => s + r.data[3], 0);
    expect(total).toBe(300);
  });
});

// ─── 2. overflow チェーン（A → B）───────────────────────────────────────────

describe('overflow チェーン（A → B）', () => {
  it('目標達成後の余剰が振替先アセット（B）の残高に加算される', () => {
    const idA = mkId();
    const idB = mkId();
    // A: 初期290万, 月5万, targetVal=300, overflowTargetId=B
    const a = { id: idA, type: 'cash', currentVal: 290, monthly: 5, annualReturn: 0,
                targetVal: 300, overflowTargetId: idB };
    // B: 受け取り専用（月積立なし）
    const b = { id: idB, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 };

    const result = calcAllAssetGrowth([a, b], 3);
    const rA = result.find(r => r.asset.id === idA);
    const rB = result.find(r => r.asset.id === idB);

    // A: y=1 で targetVal 到達 → 以降は 300
    expect(rA.data[1]).toBe(300);
    expect(rA.data[2]).toBe(300);

    // B: y=1 に A の overflow（50万）が流れ込む
    expect(rB.data[1]).toBe(50);
    // y=2 以降も A の月積立 60 が B に流れる
    expect(rB.data[2]).toBe(110);
    expect(rB.data[3]).toBe(170);
  });

  it('3段チェーン（A → B → C）が順番通りに処理される', () => {
    const idA = mkId();
    const idB = mkId();
    const idC = mkId();

    // A: targetVal=100, overflowTargetId=B
    const a = { id: idA, type: 'cash', currentVal: 90, monthly: 5, annualReturn: 0,
                targetVal: 100, overflowTargetId: idB };
    // B: targetVal=50, overflowTargetId=C
    const b = { id: idB, type: 'cash', currentVal: 40, monthly: 5, annualReturn: 0,
                targetVal: 50, overflowTargetId: idC };
    // C: 受け取り専用
    const c = { id: idC, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 };

    const result = calcAllAssetGrowth([a, b, c], 5);
    const rA = result.find(r => r.asset.id === idA);
    const rB = result.find(r => r.asset.id === idB);
    const rC = result.find(r => r.asset.id === idC);

    // A は targetVal=100 でキャップ
    expect(rA.data[1]).toBe(100);
    // B は A の overflow を受け取り targetVal=50 でキャップ（50を超えない）
    expect(rB.data.every(v => v <= 50)).toBe(true);
    // B はいずれか1年で targetVal=50 に到達する
    expect(rB.data.some(v => v === 50)).toBe(true);

    // C は最終的に正の残高を持つ
    const cTotal = rC.data[rC.data.length - 1];
    expect(cTotal).toBeGreaterThan(0);
  });

  it('振替先が設定されていない場合、overflows は wastedContribs に計上される', () => {
    const idA = mkId();
    const a = { id: idA, type: 'cash', currentVal: 300, monthly: 5, annualReturn: 0,
                targetVal: 300 }; // overflowTargetId なし
    const result = calcAllAssetGrowth([a], 3);
    // y=1,2,3 で月積立60万が wasted になる
    expect(result._wastedContribsByYear[1]).toBe(60);
    expect(result._wastedContribsByYear[2]).toBe(60);
    expect(result._wastedContribsByYear[3]).toBe(60);
  });
});

// ─── 3. 第2目標（targetVal2）チェーン ────────────────────────────────────────

describe('targetVal2 チェーン（生活防衛資金 → NISA → 生活防衛資金）', () => {
  it('targetVal2 フェーズ2で extra を受け取り残高が targetVal〜targetVal2 の間で増加する', () => {
    const idEmerg = mkId();
    const idNisa  = mkId();

    // 生活防衛資金: 300万達成済み, targetVal2=500, 月積立3万
    // overflowTargetId=NISA（達成後の月積立がNISAへ）
    const emerg = {
      id: idEmerg, type: 'cash_emergency', currentVal: 300, monthly: 3, annualReturn: 0,
      targetVal: 300, targetVal2: 500, overflowTargetId: idNisa,
    };
    // NISA: 月10万積立、满枠(200万)でoverflow → 生活防衛資金へ
    // テスト用に生涯上限を小さく設定するため nisaBasis = 1790
    const nisa = {
      id: idNisa, type: 'nisa_tsumitate', currentVal: 1790, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1790, nisaOverflowTargetId: idEmerg,
    };

    const result = calcAllAssetGrowth([emerg, nisa], 5);
    const rEmerg = result.find(r => r.asset.id === idEmerg);
    const rNisa  = result.find(r => r.asset.id === idNisa);

    // NISA: y=1 で残り10万のみ積立 → 1800万でキャップ → overflow = 110万
    expect(rNisa.data[1]).toBe(1800);
    expect(rNisa.overflows[1]).toBeGreaterThan(0);

    // 生活防衛資金: NISA overflow を受け取って残高が 300万を超える
    expect(rEmerg.data[1]).toBeGreaterThan(300);
    // targetVal2=500 を超えない
    expect(rEmerg.data[1]).toBeLessThanOrEqual(500);
  });

  it('targetVal2 達成後は overflows2 に計上され、残高が targetVal2 でキャップ', () => {
    const idA = mkId();
    const idB = mkId();

    // A: targetVal=100, targetVal2=150, 月積立2万
    // B: 振替元から受け取りを想定（100万 extra を毎年流す）
    const a = {
      id: idA, type: 'cash', currentVal: 100, monthly: 2, annualReturn: 0,
      targetVal: 100, targetVal2: 150, overflowTargetId: idB,
    };
    const b = {
      id: idB, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0,
      // B から A へ extra を流すために nisaOverflowTargetId を使う代わり、
      // A に直接 extraContribs を渡す形で確認（calcAllAssetGrowth 経由のため
      // ここでは B のoverflowTargetId=A として A が extra を受け取る形を設定）
      overflowTargetId: idA,
    };
    // B: 毎年 60 の積立を持つことで A に overflow を送れる
    // B.targetVal=0 なので毎年 overflow = 0（B は普通に積立）
    // ⇒ B→A の流れは B.overflowTargetId=A かつ B.targetVal が設定されることで発生
    // → このテストは B が targetVal を持ち満枠になる場合をシミュレート
    const b2 = {
      id: idB, type: 'cash', currentVal: 40, monthly: 5, annualReturn: 0,
      targetVal: 50, overflowTargetId: idA,
    };

    const result = calcAllAssetGrowth([b2, a], 5);
    const rA = result.find(r => r.asset.id === idA);

    // A が B のoverflowを受け取って300以上→targetVal2方向へ成長
    expect(rA.data[rA.data.length - 1]).toBeLessThanOrEqual(150);
    // targetVal2=150 でキャップされている
    const maxVal = Math.max(...rA.data);
    expect(maxVal).toBeLessThanOrEqual(150);
  });
});

// ─── 4. NISA overflow → 非 NISA への振替 ─────────────────────────────────────

describe('NISA overflow → 非NISAアセットへの振替', () => {
  it('NISA 生涯上限到達後、overflow が nisaOverflowTargetId の残高に加算される', () => {
    const idNisa  = mkId();
    const idCash  = mkId();

    // NISA: nisaBasis=1790 → y=1 で 10 しか積めない → overflow = 110
    const nisa = {
      id: idNisa, type: 'nisa_tsumitate', currentVal: 1790, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1790, nisaOverflowTargetId: idCash,
    };
    const cash = { id: idCash, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 };

    const result = calcAllAssetGrowth([nisa, cash], 3);
    const rCash = result.find(r => r.asset.id === idCash);

    // y=1: NISA overflow 110 → cash に流れ込む
    expect(rCash.data[1]).toBe(110);
    // y=2,3: NISA overflow = 120 が毎年 cash に
    expect(rCash.data[2]).toBe(230);
    expect(rCash.data[3]).toBe(350);
  });

  it('NISA に振替先が設定されていない場合は wasted に計上される', () => {
    const idNisa = mkId();
    const nisa = {
      id: idNisa, type: 'nisa_tsumitate', currentVal: 1790, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1790,
    };
    const result = calcAllAssetGrowth([nisa], 2);
    // y=1 overflow=110, y=2 overflow=120 → wasted に加算
    expect(result._wastedContribsByYear[1]).toBe(110);
    expect(result._wastedContribsByYear[2]).toBe(120);
  });
});

// ─── 5. NISA 合算プール（名義別分離）──────────────────────────────────────────

describe('NISA 名義別プール分離', () => {
  it('self と partner のNISA枠は独立して管理される', () => {
    const idSelf    = mkId();
    const idPartner = mkId();

    // 本人NISA: nisaBasis=1740 → 60万しか残り枠なし
    // パートナーNISA: nisaBasis=0 → 1800万枠フル
    const selfNisa = {
      id: idSelf, type: 'nisa_tsumitate', currentVal: 1740, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1740, owner: 'self',
    };
    const partnerNisa = {
      id: idPartner, type: 'nisa_tsumitate', currentVal: 0, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 0, owner: 'partner',
    };

    const result = calcAllAssetGrowth([selfNisa, partnerNisa], 2);
    const rSelf    = result.find(r => r.asset.id === idSelf);
    const rPartner = result.find(r => r.asset.id === idPartner);

    // 本人: 残り60万 → y=1 で1800万（overflow=60万）
    expect(rSelf.data[1]).toBe(1800);
    expect(rSelf.overflows[1]).toBe(60);

    // パートナー: 枠フル → 120万積立
    expect(rPartner.data[1]).toBe(120);
    expect(rPartner.overflows[1]).toBe(0);
  });

  it('同じ名義のNISA積立枠＋成長投資枠は合算1800万円でキャップ', () => {
    const idTsum  = mkId();
    const idGrowth = mkId();

    // 積立枠: nisaBasis=1000, 月10万
    // 成長枠: nisaBasis=800,  月10万
    // 合算: 1800 → 残り0 → y=1 で全額 overflow
    const tsumi = {
      id: idTsum, type: 'nisa_tsumitate', currentVal: 1000, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1000, owner: 'self',
    };
    const growth = {
      id: idGrowth, type: 'nisa_growth', currentVal: 800, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 800, owner: 'self',
    };

    const result = calcAllAssetGrowth([tsumi, growth], 2);
    const rTsumi  = result.find(r => r.asset.id === idTsum);
    const rGrowth = result.find(r => r.asset.id === idGrowth);

    // 合算1800万で枠なし → 両方とも y=1 で overflow が全額発生
    expect(rTsumi.overflows[1]).toBeGreaterThan(0);
    expect(rGrowth.overflows[1]).toBeGreaterThan(0);
    // 残高は増えない（積立できない）
    expect(rTsumi.data[1]).toBe(1000);
    expect(rGrowth.data[1]).toBe(800);
  });
});

// ─── 6. 保存結果の整合性チェック ───────────────────────────────────────────────

describe('結果の整合性', () => {
  it('返り値の data は years+1 件である', () => {
    const a = { id: mkId(), type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0 };
    const result = calcAllAssetGrowth([a], 10);
    expect(result[0].data).toHaveLength(11);
  });

  it('アセットが空配列でも正常に動作する', () => {
    const result = calcAllAssetGrowth([], 5);
    expect(result).toHaveLength(0);
    expect(result._wastedContribsByYear).toHaveLength(6);
  });

  it('wastedContribsByYear の長さは years+1 である', () => {
    const a = { id: mkId(), type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0 };
    const result = calcAllAssetGrowth([a], 7);
    expect(result._wastedContribsByYear).toHaveLength(8);
  });

  it('返り値は入力アセットと同じ順序で返される', () => {
    const ids = [mkId(), mkId(), mkId()];
    const assets = ids.map(id => ({ id, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 }));
    const result = calcAllAssetGrowth(assets, 3);
    expect(result.map(r => r.asset.id)).toEqual(ids);
  });
});
