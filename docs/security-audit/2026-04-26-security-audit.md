# セキュリティ監査レポート（Phase 5a）

**実施日**: 2026-04-26
**対象**: ライフプランアプリ全体
**監査タイプ**: 静的解析・コードレビュー

---

## 1. 脅威モデル

### 守るもの
- ユーザー個人の金融情報（年収、資産、家族構成、ライフプラン）
- localStorage に保存されたデータ
- エクスポートされた `.lifeplan` ファイル

### 攻撃面
- ✅ バックエンドなし → サーバ攻撃面ゼロ
- ✅ 認証なし → 認証バイパス系リスクなし
- ✅ CSP `connect-src 'none'` → 外部送信ブロック済み
- ⚠️ クライアントサイド攻撃面のみ
- ⚠️ ファイル流出経路あり（`.lifeplan` エクスポート、PDF）

---

## 2. 既存のセキュリティ対策（強み）

### ✅ CSP（Content Security Policy）

`netlify.toml` / `_headers` で:
- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`
- `connect-src 'none'`（XHR/fetch ブロック）
- `frame-ancestors 'none'`（クリックジャッキング防止）

### ✅ 追加 HTTP ヘッダー
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### ✅ HTTPS 強制リダイレクト
`netlify.toml` で http → https リダイレクト設定済み。

### ✅ CDN SRI（Subresource Integrity）
Chart.js に `integrity` / `crossorigin` / `referrerpolicy` 全て設定済み。

### ✅ XSS 用 escape ヘルパ
`escHtml()` 関数定義済み（`index.html:11387`）。

### ✅ 危険 API 不使用
- 動的コード評価関数: 0 箇所
- 文書直書き API: 0 箇所
- `Function()` コンストラクタ: なし

### ✅ AES-GCM 暗号化（実装は正しい）
Web Crypto API + AES-256-GCM + 12-byte IV。アルゴリズム自体は標準準拠。

---

## 3. 検出されたリスク

### 🔴 R1: 暗号化キーがハードコード（重要）

**場所**: `index.html:6375-6380`

`_LP_KEY_RAW` という固定 32 バイト配列がソースコードに直書き。ASCII デコードすると `LifePlanAppKey2026_xK9mP2nQrT5vW`。

**影響**:
- 全ユーザーが同一鍵で `.lifeplan` を暗号化
- index.html ソース閲覧で誰でも鍵取得可能
- ファイル流出時、第三者が即座に復号可能
- 「暗号化されているから安全」という誤解の余地

**重要度**: 🔴 Critical（実質「難読化」レベルなのに「暗号化」と謳われている）

**修正方針**:
- (A) パスワード由来の鍵に変更（PBKDF2）
- (B) UI に「これは難読化（簡易保護）です」と正直に明記
- (C) エクスポート時に「機密情報として扱ってください」警告表示

### 🔴 R2: target="_blank" すべて noopener なし

**場所**: index.html 内 5 箇所（すべて `legal.html` への内部リンク）

**影響**:
- 内部リンクなので reverse tabnabbing リスクは低
- ただし `legal.html` 改竄/置換時にリスク
- 将来アフィリエイトリンク追加時にも同じパターンで漏れる可能性

**重要度**: 🟡 Medium

**修正方針**: 全 5 箇所に `rel="noopener noreferrer"` 追加

### 🟡 R3: HTML 直書き API 多用 + escape ヘルパ適用率 16%

**統計**:
- 該当 API 使用: 186 + 4 = 190 箇所
- escHtml() 呼び出し: 30 箇所
- 適用率: 約 16%

**影響**:
- 残り 84% にユーザー入力（profile.name, asset.name, memo 等）が混入していれば XSS 経路
- インポート経由で `.lifeplan` から攻撃 payload が流入する可能性

**重要度**: 🟡 Medium-High

**修正方針**:
- 該当 API 全使用箇所を grep
- ユーザー入力を含むものを抽出
- escHtml 適用 or createElement+textContent に置換
- リグレッションに XSS payload 注入テスト追加

### 🟡 R4: インポート時の構造検証が緩い

**場所**: `_applyImportedData` (index.html:6595-6642)

- `JSON.parse` 結果をそのまま spread で state に流す
- ファイルサイズ・スキーマ検証なし
- prototype pollution リスク（現代 JSON.parse は safe だが古いブラウザで懸念）
- 100MB JSON で DoS

**重要度**: 🟡 Medium

**修正方針**:
- ファイルサイズ上限（5MB）
- スキーマ最小検証
- `__proto__` / `constructor` 除去
- 型不一致 sanitize

### 🟢 R5: CSP unsafe-inline（受容）

inline event handler 304 箇所 + inline style 2,344 箇所。除去は大規模リファクタ。R3 対応で実効防御可能なので受容。

### 🟢 R6: localStorage 容量・iOS ITP

5-10MB 制限、iOS Safari 7 日 ITP リスク。可用性問題、別フェーズで。

### 🟢 R7: PDF 経由漏洩

OS 側問題、アプリで対策困難。ユーザー教育で対応。

---

## 4. 優先度マトリクス

| ID | リスク | 重要度 | 修正規模 | 計算ロジック影響 | 推奨 |
|---|---|---|---|---|---|
| R1 | 暗号化キーハードコード | 🔴 Critical | 中 | なし | **要対応** |
| R2 | target=_blank noopener漏れ | 🟡 Medium | 極小 | なし | **要対応** |
| R3 | HTML 直書き API + escape 漏れ | 🟡 Medium-High | 中〜大 | なし | **要対応** |
| R4 | インポート検証不足 | 🟡 Medium | 小〜中 | なし | **要対応** |
| R5 | CSP unsafe-inline | 🟢 Low | 大 | なし | 受容 |
| R6 | localStorage 容量・ITP | 🟢 Low | 中 | なし | 別フェーズ |
| R7 | PDF 経由漏洩 | 🟢 Low | 不可 | なし | ユーザー教育 |

---

## 5. 推奨対応プラン

### Phase 5b: Quick Win（リスク低・効果大）

**所要時間**: 1〜2 時間
**影響**: 計算ロジック影響なし、メンテ性影響なし

1. **R2 修正**: 全 `_blank` に `rel="noopener noreferrer"`
2. **R4 修正**: ファイルサイズ上限 + スキーマ検証 + 危険 key 除去
3. **R1 (B 案)**: UI 表記の正直化（暗号化 → 難読化）

### Phase 5c: XSS 監査・修正（中規模）

**所要時間**: 3〜5 時間
**影響**: 計算ロジック影響なし

1. 該当 API 使用 190 箇所を grep
2. ユーザー入力フィールドを含む箇所を抽出
3. escape 適用 or DOM API 化
4. XSS payload 注入のリグレッションテスト追加

### Phase 5d: 暗号化強化（選択制）

**所要時間**: 2〜3 時間
**影響**: エクスポート/インポート UX 変化

PBKDF2 でパスワード由来鍵に変更。Phase 5b の B 案で済ませるなら不要。

### Phase 5e: 残課題（任意）

- R5 CSP 強化
- R6 IndexedDB 移行

---

## 6. 監査の所感

### 良い点
- サーバ・通信レイヤーは既に高水準（CSP / SRI / HTTPS / 各種ヘッダー）
- 危険 API 不使用
- escape ヘルパ存在
- AES-GCM 実装は正しい

### 改善余地
- 鍵管理（ハードコード問題）
- XSS 防御徹底（escape 適用率）
- インポート検証

---

## 7. ヘルススコア（追加カテゴリ）

| 状態 | スコア | 根拠 |
|---|---|---|
| 現状 | **B** | 基盤強いが鍵管理・XSS 防御に課題 |
| 5b 完了後 | **B+** | 正直化・noopener・インポート防御 |
| 5c 完了後 | **A-** | XSS 防御徹底 |
| 5d 完了後 | **A** | 鍵管理改善 |

---

## 8. 次のステップ

- **Phase 5b（Quick Win）から進める** → 推奨
- **Phase 5c（XSS 監査）も併せて** → セキュリティ大幅 UP
- **Phase 5d（暗号化強化）の判断は 5b 完了後**
