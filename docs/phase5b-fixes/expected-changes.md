# Phase 5b 修正の期待方向と実測

セキュリティ Quick Win (R1-B / R2 / R4) の記録。

## 期待方向

### R2: target="_blank" noopener 追加
- index.html 内 5 箇所すべての `target="_blank"` に `rel="noopener noreferrer"` を追加

### R4: インポート検証強化
- ファイルサイズ 5MB 上限チェック
- JSON.parse 後に sanitizeImported() で `__proto__` / `constructor` / `prototype` 再帰除去
- スキーマ最小検証（profile/assets/finance などの型チェック）

### R1 (B 案): 表記の正直化
- UI 通知メッセージで「暗号化」→「簡易難読化」に変更
- エクスポート時に「機密情報として扱ってください」警告追加
- ファイルマーカー LIFEPLAN_ENCRYPTED_V1 は後方互換のため維持

snapshot 影響: なし（UI ・I/O 層の変更）

## 実測サマリー
（修正後に記入）
