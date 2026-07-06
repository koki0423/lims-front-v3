# フロントエンド設計仕様書

- 作成日: 2026-06-20
- 対象リポジトリ: `lims-front-v3`
- 対象範囲: `index.html`, `js/`, `modules/`, `css/`, `assets/templates/`

## 1. 目的

本書は、本リポジトリに実装されている備品管理システムのフロントエンド設計を整理したものである。  
現行実装を基準に、画面構成、ルーティング、状態管理、API連携、NFC読取、ラベル印刷、運用上の制約を定義する。

## 2. システム概要

本システムのフロントエンドは、HTMLテンプレートを `#app-container` に差し替えて動作する軽量SPAである。  
業務機能は以下で構成される。

- 新規登録
- まとめて登録
- 廃棄登録・廃棄履歴
- 備品参照・編集・ラベル印刷
- 貸出・返却
- 備品検索
- 管理者ログイン・ジャンル管理

利用者視点の特徴は以下のとおり。

- 日本語UI
- `/api/v2/*` への同一オリジンAPI呼び出し
- WebUSBを用いたNFC学生証読取
- TEPRAラベル印刷
- 単一CSSによる共通レイアウトとモバイル幅対応

## 3. 技術構成

### 3.1 実行方式

- エントリページ: `index.html`
- 起動スクリプト: `js/app.js`
- ルーター: `js/router.js`
- 配信方式: 静的ファイル配信
- ビルド工程: なし
- `Dockerfile` は `python -m http.server 8000` による簡易配信を前提とする

### 3.2 採用技術

- HTMLテンプレート分割
- Vanilla JavaScript + ES Modules
- 共通スタイル: `css/style.css`
- HTTPクライアント: `axios` を jsDelivr ESM から読込
- NFC通信: `js/NFCPortLib.js`
- 学籍番号文字列変換: `encoding-japanese` を実行時に動的読込
- ラベル印刷: `js/tepraprint.js`

### 3.3 起動シーケンス

1. `DOMContentLoaded` 発火
2. `AppState.initMasterData()` でジャンルマスタを先行読込
3. `Router.to('main-menu')` でメインメニュー表示
4. 以降はルートキー単位でテンプレート差し替えと画面初期化を実行

## 4. アーキテクチャ設計

### 4.1 SPA構造

本システムはブラウザ履歴連動型のSPAではなく、独自Routerによる画面切替方式を採用する。

- 画面遷移単位: `routeKey`
- テンプレート読込: `fetch(path)`
- テンプレートキャッシュ: `Router._templateCache`
- 競合防止: `Router._navigationSeq`
- 認証必須画面: `requiresAuth`
- HTML上の `onclick` から利用できるよう `window.Router` を公開

### 4.2 Routerの責務

- ルート定義の保持
- 認証要否判定
- テンプレート取得・キャッシュ
- `#app-container` へのHTML注入
- 画面フェードイン
- モジュール遅延読込
- 初期化関数の実行
- スクロール位置リセット

### 4.3 戻る操作

`Router.back()` は履歴スタックを持たず、常に `main-menu` へ戻る簡易実装である。  
そのため「直前画面へ戻る」保証はない。

## 5. ディレクトリ責務

| パス | 責務 |
| --- | --- |
| `index.html` | 共通ヘッダー、`#app-container` を持つアプリケーション外枠 |
| `css/style.css` | 共通レイアウト、フォーム、テーブル、履歴画面、登録画面、モーダル、ページネーション |
| `js/app.js` | 起動処理 |
| `js/router.js` | 画面遷移制御 |
| `js/api.js` | APIクライアント |
| `js/app_state.js` | ジャンルマスタの共有キャッシュ |
| `js/token.js` | 管理者トークン管理 |
| `js/dom_utils.js` | HTMLエスケープ、日付変換 |
| `js/pagination_utils.js` | APIレスポンスのページング正規化 |
| `js/nfcReader.js` | NFC読取とリトライ制御 |
| `modules/*/logic.js` | 機能別コントローラとローカル状態 |
| `modules/*/*.html` | 画面テンプレート |
| `assets/templates/*` | まとめて登録用テンプレート |

## 6. 共通設計

### 6.1 レイアウト

- コンテンツ幅上限: `800px`
- 共通ヘッダー固定
- 画面本体は中央寄せ
- 画面遷移時に `fade-in` を付与
- 登録画面と履歴画面はカード型UI
- モバイル幅では入力レイアウトを1カラム寄せに調整

### 6.2 共通状態管理方針

フレームワークのグローバルストアは使用せず、各機能ごとにモジュールスコープの状態オブジェクトを持つ。

共通方針:

- 画面間の入力保持は各モジュールの状態オブジェクトで行う
- ページ遷移後もSPAセッション内では入力値を保持する
- 登録完了後は必要な状態のみクリアする

### 6.3 マスタデータ管理

`AppState` の責務:

- `genres`: 有効ジャンル一覧
- `allGenres`: 無効を含むジャンル一覧
- 多重読込防止
- ジャンルID/名称の相互参照

### 6.4 認証管理

- トークンキー: `admin_token`
- 保存先: `sessionStorage`
- 旧保存先 `localStorage` からの移行処理あり
- APIで `401` を受けた場合はトークン削除後に `admin-login` へ遷移

### 6.5 APIクライアント

- ベースURL: `''`
- タイムアウト: `15000ms`
- デフォルト `Content-Type: application/json`
- トークン保有時は `Authorization: Bearer <token>` を自動付与
- `axios` レスポンスは `res.data` を返す

## 7. 画面一覧

| 機能 | ルートキー |
| --- | --- |
| メイン | `main-menu` |
| 新規登録 | `reg-select`, `reg-input-1`, `reg-input-2`, `reg-confirm` |
| まとめて登録 | `reg-batch-select`, `reg-batch-simple`, `reg-batch-table`, `reg-batch` |
| 廃棄 | `disposal-top`, `disposal-input`, `disposal-confirm`, `disposal-history` |
| 備品参照 | `item-list` |
| 貸出 | `lend-return-top`, `lend-menu`, `lend-input`, `lend-confirm`, `lend-history` |
| 返却 | `return-menu`, `return-search`, `return-select`, `return-input`, `return-confirm`, `return-history` |
| 検索 | `search-top`, `search-list`, `search-result` |
| 共通完了 | `complete` |
| 管理者 | `admin-login`, `admin-main`, `admin-register`, `admin-genres` |

## 8. 機能別設計

### 8.1 メインメニュー

目的:

- 全機能への入口
- デバイス接続状態の可視化

表示要素:

- TEPRA状態
- NFCリーダ状態
- NFC接続確認ボタン
- 各業務メニュー
- 管理者ログイン導線

動作:

- 画面表示時に TEPRA と NFC の接続状態を確認
- WebUSB の connect/disconnect イベントを監視
- 状態は `checking` / `connected` / `disconnected` で表示

### 8.2 新規登録

#### 画面フロー

1. 管理方法選択
2. 基本情報入力
3. 追加情報・ラベル設定入力
4. 確認
5. 登録
6. 印刷
7. 完了画面

#### 管理方法

- 個別管理
- 一括管理
- まとめて登録

#### 基本情報入力項目

- JAN/ISBN検索
- 手動入力切替
- `itemName`
- `maker`
- `model`
- `serial` 個別管理時のみ
- `quantity` 一括管理時のみ
- `genre`

#### 追加情報入力項目

- `location`
- `purchaseDate`
- `registrant`
- `remarks`
- `labelCodeType`
- `labelTapeWidth`
- `labelHalfcut` 固定ON

#### 状態管理

- `regState.type`
- `regState.data`
- `regState.submitting`

#### 入力ルール

- ジャンルは画面では名称選択、送信時に `genre_id` へ変換
- 管理区分ID:
  - 個別管理 -> `1`
  - 一括管理 -> `2`
- 新規登録時の `status_id` は常に `1`
- 購入日はローカルタイムゾーン付きISO日時へ変換

#### API連携

1. `POST /api/v2/assets/masters`
2. `POST /api/v2/assets`
3. TEPRAによるラベル印刷

#### ペイロード対応

備品マスタ:

- `name` <- `itemName`
- `management_category_id` <- 管理方法
- `genre_id` <- ジャンル
- `manufacturer` <- `maker`
- `model` <- `model`

備品:

- `asset_master_id` <- マスタ登録結果
- `serial` <- 個別管理時のみ設定
- `quantity` <- 個別管理は `1`、一括管理は入力値
- `purchased_at` <- `purchaseDate`
- `status_id` <- `1`
- `owner` <- `registrant`
- `default_location` <- `location`
- `notes` <- `remarks`

#### エラー処理

- 画面遷移前に必須チェック
- 登録失敗時は `alert` 表示
- 印刷失敗時も登録完了自体は維持

### 8.3 まとめて登録

3方式を実装している。

#### A. かんたん入力

用途:

- 同種備品を複数件まとめて投入するケース

共通項目:

- `managementType`
- `manufacturer`
- `modelNumber`
- `storageLocation`
- `genre`
- `purchaseDate`

明細項目:

- `name`
- `serialNumber` 個別管理時
- `quantity` 一括管理時
- `note`

操作:

- 行追加
- シリアル連番自動設定
- プレビュー作成
- 登録確定

#### B. 表形式入力

用途:

- 混在した備品を1行ずつWeb表で入力するケース

行項目:

- `name`
- `managementType`
- `manufacturer`
- `modelNumber`
- `serialNumber`
- `quantity`
- `storageLocation`
- `genre`
- `purchaseDate`
- `note`

操作:

- 行追加
- プレビュー作成
- 登録確定

#### C. CSVファイル取込

用途:

- テンプレートCSVを使って外部入力後に一括投入するケース

利用テンプレート:

- `assets/templates/batch_register_template.csv`
- `assets/templates/batch_register_guide.xlsx`

動作:

- CSVをクライアント側で解析
- 日本語ヘッダを基準にヘッダ行を検出
- 行単位でバリデーション
- プレビュー表、件数サマリ、エラー/警告表示
- 正規化CSVをメモリ上で再生成
- 問題がなければコミットAPIへ送信

#### まとめて登録共通仕様

- プレビューはフロント側処理
- 登録確定は `POST /api/v2/assets/import?mode=commit`
- 成功行のみ印刷対象化
- 登録後に印刷確認ダイアログを表示

#### 状態管理

- `batchImportState`
- `simpleBatchState`
- `tableBatchState`

各状態で保持する情報:

- 元データ
- バリデーション結果
- 生成済み取込ファイル
- 画面ステータス文言
- ラベル設定
- 登録結果
- 多重実行防止フラグ

### 8.4 廃棄

#### 画面

- 廃棄メニュー
- 廃棄登録入力
- 廃棄確認
- 廃棄履歴

#### 入力項目

- `itemId`
- `qty`
- `registrant` NFC入力、読取専用
- `date` 自動入力、読取専用
- `reason`

#### 業務ルール

- 管理番号はNFKC正規化し、ハイフンゆれを吸収する
- 登録者は必須
- 数量は整数送信

#### API

- 登録: `POST /api/v2/assets/{management_number}/disposals`
- 履歴: `GET /api/v2/disposals`

#### 履歴画面

- 表示件数: `10`, `20`, `50`
- サマリ表示:
  - 総件数
  - 現在ページ
  - 表示範囲
- 一覧列:
  - 廃棄日時
  - 管理番号
  - 数量
  - 廃棄理由
  - 担当者

### 8.5 備品参照・編集・ラベル印刷

#### 一覧画面

- 初期表示時に備品一覧を取得
- ステータス絞込:
  - 正常
  - 故障
  - 修理中
  - 貸出中
  - 廃棄済み
  - 紛失
- 表示件数:
  - `10`
  - `20`
  - `50`
  - `100`

#### データ取得

- `GET /api/v2/assets`
- 絞込時は複数バッチ取得後にクライアント側でページングする場合がある

#### 詳細・編集モーダル

参照専用:

- 備品名
- 管理番号
- シリアル番号
- 現在の貸出先/場所

更新可能:

- 数量
- ステータス
- 標準保管場所
- 備考

制約:

- 個別管理備品は数量変更不可
- 貸出中はステータス変更不可
- 廃棄済みはステータス、数量、標準保管場所を変更不可

更新API:

- `PUT /api/v2/assets/{asset_id}`

#### ラベル印刷モーダル

入力項目:

- 管理番号
- コード種別
- テープ幅
- ハーフカット 固定ON

動作:

- 管理番号からペア情報取得
- 1件分のラベルCSVを生成
- TEPRA印刷を直接実行

### 8.6 貸出・返却

#### 貸出

画面:

- 貸出メニュー
- 貸出入力
- 貸出確認
- 貸出履歴

入力項目:

- `itemId`
- `qty`
- `borrower`
- `dueDate`
- `lender`

API:

- 登録: `POST /api/v2/lends`
- 履歴: `GET /api/v2/lends`

送信項目:

- `management_number`
- `quantity`
- `borrower_id`
- `due_on`
- `lent_by_id`

履歴機能:

- 表示件数: `10`, `20`, `50`, `100`
- 状態絞込:
  - すべて
  - 貸出中
  - 返却済み
- 管理番号から備品名を補完取得

#### 返却

画面:

- 返却メニュー
- 返却対象検索
- 返却候補選択
- 返却入力
- 返却確認
- 返却履歴

検索仕様:

- まず管理番号で未返却貸出を検索
- 未検出時は貸出先IDで検索
- 1件のみなら直接返却入力へ遷移
- 複数件なら候補一覧を表示

返却入力項目:

- 貸出番号 表示のみ
- 数量 表示のみ
- 貸出先 表示のみ
- `returnDate`
- `returner`

API:

- 未返却検索: `GET /api/v2/lends`
- 貸出詳細: `GET /api/v2/lends/{lendKey}`
- 返却登録: `POST /api/v2/returns/key/{lendKey}`
- 履歴: `GET /api/v2/returns`

返却送信項目:

- `quantity`
- `processed_by_id`
- `note`

### 8.7 検索

#### 検索方式

- 管理番号検索
- 備品名部分一致検索

#### 挙動

- 1件ヒット時は詳細画面へ直接遷移
- 複数件ヒット時は一覧画面へ遷移

#### 一覧機能

- ステータス絞込
- ソート可能列:
  - 管理番号
  - 備品名
  - 状態
  - 場所/利用者

#### 詳細表示項目

- 管理番号
- 状態
- 備品名
- メーカー
- 型番
- シリアル番号
- 備品ジャンル
- 現在地/保管場所
- 購入日
- 管理者/登録者
- 備考

### 8.8 管理者機能

#### 管理者ログイン

入力項目:

- 学籍番号
- パスワード

機能:

- 学籍番号のNFC入力
- ログイントークン取得
- セッション開始

API:

- `POST /api/v2/login`

#### 管理者メニュー

- 備品ジャンル編集
- ユーザー登録
- 将来拡張用のマスタ編集プレースホルダ
- ログアウト

#### 管理者追加登録

入力項目:

- 学籍番号 NFC入力
- パスワード

API:

- `POST /api/v2/register`

補足:

- `role` は `admin` 固定
- `409` は重複IDとして扱う

#### ジャンル管理

操作:

- `name` と `code` で新規追加
- 既存ジャンルの有効化/無効化
- 無効ジャンルはグレー表示

API:

- `GET /api/v2/genres`
- `GET /api/v2/genres?all=true`
- `POST /api/v2/genres`
- `PUT /api/v2/genres/{id}`

## 9. API一覧

| 区分 | Method | Endpoint | 用途 |
| --- | --- | --- | --- |
| Assets | `POST` | `/api/v2/assets/masters` | 備品マスタ登録 |
| Assets | `POST` | `/api/v2/assets` | 備品登録 |
| Assets | `POST` | `/api/v2/assets/import?mode=commit` | まとめて登録 |
| Assets | `GET` | `/api/v2/assets` | 備品一覧取得 |
| Assets | `GET` | `/api/v2/assets/pair/{managementNumber}` | マスタ+備品詳細取得 |
| Assets | `PUT` | `/api/v2/assets/{id}` | 備品更新 |
| Assets | `GET` | `/api/v2/assets/search?name=...` | 備品名検索 |
| Assets | `GET` | `/api/v2/assets/lookup/{janCode}` | JAN検索 |
| Print | `GET` | `/api/v2/assets/print/templates` | 印刷テンプレート取得 |
| Lending | `POST` | `/api/v2/lends` | 貸出登録 |
| Lending | `GET` | `/api/v2/lends` | 貸出検索・履歴 |
| Lending | `GET` | `/api/v2/lends/{lendKey}` | 貸出詳細取得 |
| Return | `POST` | `/api/v2/returns/key/{lendKey}` | 返却登録 |
| Return | `GET` | `/api/v2/returns` | 返却履歴取得 |
| Disposal | `POST` | `/api/v2/assets/{management_number}/disposals` | 廃棄登録 |
| Disposal | `GET` | `/api/v2/disposals` | 廃棄履歴取得 |
| Admin | `POST` | `/api/v2/login` | 管理者ログイン |
| Admin | `POST` | `/api/v2/register` | 管理者追加登録 |
| Genre | `GET` | `/api/v2/genres` | 有効ジャンル一覧取得 |
| Genre | `GET` | `/api/v2/genres?all=true` | 全ジャンル一覧取得 |
| Genre | `POST` | `/api/v2/genres` | ジャンル追加 |
| Genre | `PUT` | `/api/v2/genres/{id}` | ジャンル更新 |

## 10. NFC連携設計

目的:

- 登録者
- 貸出先
- 貸出実行者
- 返却実行者
- 管理者ID

実装要点:

- WebUSB使用
- Sony系NFCリーダの既知Product IDを対象
- 学生証カード検出後、ブロック読取で学籍番号を抽出
- Shift-JISをUnicodeへ変換
- 非リトライ系エラー以外は複数回リトライ

エラー設計:

- ステージ別エラー分類
- 許可拒否とユーザーキャンセルを区別
- 詳細情報をメッセージへ含める

## 11. ラベル印刷設計

目的:

- 新規登録後のラベル出力
- 備品一覧からの再印刷
- まとめて登録後の一括印刷

印刷フロー:

1. バックエンドからテンプレート取得
2. ブラウザ上でCSV生成
3. TEPRAプリンタ取得
4. オンライン状態確認
5. 印刷パラメータ生成
6. 印刷実行

コード上で対応するテープ幅:

- `4`
- `6`
- `9`
- `12`
- `18`
- `24`
- `36`

UI上で選択可能なテープ幅:

- `9`
- `12`
- `18`

## 12. ページング設計

`normalizePageResponse()` は2種類のレスポンス形に対応する。

- 配列レスポンス: クライアント側ページング
- `{ items, total, next_offset }` 形式: サーバ側ページング

適用箇所:

- 備品一覧
- 貸出履歴
- 返却履歴
- 廃棄履歴

## 13. 完了画面とフィードバック設計

完了画面:

- 共通ルート: `complete`
- 表示メッセージ差替可能
- `5` 秒後に自動でメインメニューへ遷移
- 手動で戻るボタンも提供

フィードバック方式:

- 成功/失敗通知の多くは `alert()`
- まとめて登録と履歴画面はステータスバナーを使用
- 履歴画面は読込中スケルトンを表示

## 14. 非機能要件・制約

- ES Modules 対応ブラウザ前提
- NFC機能は WebUSB 対応環境必須
- 印刷機能は `window.TepraPrint` 系オブジェクト必須
- `axios` と `encoding-japanese` は外部CDN依存
- フロント側ビルド、バンドル、テスト基盤は未導入
- ルーターはブラウザ履歴と未連携

## 15. 実装上の留意点

- `Router.back()` は実履歴復元ではない
- 管理者認証は管理者画面にのみ適用
- 通知手段が `alert()` 中心のためUX拡張余地が大きい
- APIベースURLが空文字のため、デプロイ先で同一オリジン配下にAPIが必要
- スタイルが単一CSSに集中しており、今後の機能追加で衝突リスクがある
- 多くの機能が `window` 配下のグローバルコントローラに依存している

## 16. 今後の改善案

- `alert()` を共通トースト/ダイアログへ置換
- `Router.back()` を履歴スタック方式へ拡張
- `style.css` と巨大な `logic.js` を機能別に分割
- 共通エラー表示設計を導入
- ルート初期化、入力変換、APIペイロード生成の自動テストを追加
- CDN依存ライブラリをローカル同梱またはビルド管理下へ移行

