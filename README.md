# lifeplan-app

人生 100 年時代の資産・支出管理エコシステム。**ライフプランアプリ** と **支出管理アプリ** の 2 つで構成されます。

## 🌐 公式サイト

- **ライフプランアプリ**: <https://app.lifeplan-app.net/>
- **支出管理アプリ**: <https://app.lifeplan-app.net/spending/>
- **ブログ**: <https://lifeplan-app.net/blog/>

## 📱 アプリ概要

```
[支出管理アプリ]  →  [ライフプランアプリ]
 spending/             index.html
 短期・現状把握          長期シミュレーション
```

### ライフプランアプリ (`index.html`)

長期 (60〜100 年) の資産シミュレーション。退職計画、住宅ローン、年金、税制、iDeCo、配偶者控除、4% ルール等の実務基準に準拠した計算エンジン。

### 支出管理アプリ (`spending/index.html`)

短期 (月次・年次) の家計支出管理。Money Forward / Zaim CSV のインポート、カテゴリ別予算、改善提案、ライフプランアプリへの連携機能。

## 🛠 技術スタック

- 単一 HTML ファイル + Vanilla JS (フロントエンド完結、サーバなし)
- ES Modules (`calc/*.js`, `spending/calc/*.js`)
- Chart.js 4.4.1 (CDN)
- Vitest 2.x + Playwright (テスト)
- Cloudflare デプロイ
- localStorage によるデータ永続化 (外部送信なし)

## 🔬 検証・品質

- **計算精度**: A (Phase 2 監査検出 Critical/Important 全解消)
- **セキュリティ**: A- (R1〜R10 対応、R8 のみ構造的受容)
- **テストカバレッジ**: 310/310 グリーン (Phase SP-1〜5e-d 時点)

詳細は `docs/` 配下のドキュメントを参照。

## 📜 ライセンス

**Source Available License** (本リポジトリ内 [`LICENSE`](./LICENSE) 参照)

```
✅ 個人での閲覧・学習・動作確認は OK
✅ セキュリティ上の問題報告 (responsible disclosure) は歓迎
❌ 商用利用・フォーク・再配布・改変版の公開は禁止
❌ AI モデル学習データとしての利用は禁止
❌ 競合サービス構築のための転用は禁止
```

商用ライセンスについては <contact@lifeplan-app.net> までご連絡ください。

## 🐛 セキュリティ問題の報告

セキュリティ上の脆弱性を発見された場合は、公開 Issue にせず、下記まで非公開でご連絡ください:

- 連絡先: <contact@lifeplan-app.net>
- 件名: `[Security]` から始めてください
- 内容: 再現手順、影響範囲、可能であれば修正案

責任ある開示 (responsible disclosure) にご協力をお願いします。

## 📂 リポジトリ構成

```
.
├── index.html                  # ライフプランアプリ本体
├── spending/                   # 支出管理アプリ
│   ├── index.html
│   └── calc/                   # ES Modules
├── calc/                       # ライフプラン計算ロジック (ES Modules)
├── test/                       # Vitest テスト
│   └── spending/               # 支出管理アプリのテスト
├── docs/                       # 設計書・監査レポート・実装計画
│   ├── superpowers/            # spec / plan
│   ├── security-audit/         # セキュリティ監査
│   ├── phase2-audits/          # 計算ロジック監査
│   ├── spending-audits/        # 支出管理監査
│   └── spending-fixes/         # 修正完了レポート
├── DESIGN_GUIDELINES.md        # ビジュアル・実装規範
├── netlify.toml / _headers     # Cloudflare/Netlify デプロイ設定
└── LICENSE                     # ライセンス条項
```

## 🚧 開発状況

個人プロジェクトとして開発中。**有料プラン (Premium) は現在準備中** で、正式リリース時にあらためて告知します。

## 🤝 コントリビューション

外部からのコード貢献は現時点で受け付けていませんが、以下は歓迎します:

- バグ報告 (動作不良・計算誤差等)
- 機能リクエスト
- セキュリティ問題の責任ある開示
- ドキュメントの誤字・脱字指摘
