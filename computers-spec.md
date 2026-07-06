# 計算機管理モジュール仕様書

## 1. 文書概要

- 対象モジュール: `internal/asset_mgmt/computers`
- 対象システム: `LIMS-back` バックエンド API
- 対象コード基準日: 2026-06-27
- 関連文書:
  - [backend-design-spec.md](./backend-design-spec.md)
  - [api-detailed-spec.md](./api-detailed-spec.md)

本書は、計算機管理モジュールの API、入出力データ、業務ルール、フロントエンド実装時の注意点を整理した専用仕様書である。

## 2. モジュール概要

本モジュールは以下 5 系統の機能を提供する。

1. 計算機詳細管理
2. 計算機部品管理
3. 計算機構成履歴管理
4. 部品種別マスタ参照
5. 部品使用状態マスタ参照

計算機管理は `assets_master` と連携して動作する。  
このモジュール単体では備品マスタを作成しないため、先に `assets` モジュールで対象の備品を登録しておく必要がある。

## 3. レイヤ構成

```text
Gin Router
  -> Handler
    -> Service
      -> Store
        -> MySQL
```

### 3.1 ファイル責務

| ファイル | 役割 |
| --- | --- |
| `dto.go` | リクエスト・レスポンス DTO |
| `model.go` | 更新用内部パッチ構造、解決済み構成情報 |
| `error.go` | モジュール専用エラーコードと HTTP ステータス変換 |
| `handler.go` | ルーティング、JSON bind、HTTP レスポンス |
| `service.go` | 入力検証、存在確認、競合判定、正規化 |
| `store.go` | SQL 実装 |
| `service_test.go` | サービス層の主要業務ルール確認 |

## 4. 依存データ

### 4.1 参照テーブル

| テーブル | 用途 |
| --- | --- |
| `assets_master` | 計算機本体・部品の親備品マスタ |
| `computer_details` | 計算機詳細の 1:1 レコード |
| `computer_parts` | 計算機部品の 1:1 レコード |
| `computer_configurations` | 計算機と部品の構成履歴 |
| `part_types` | 部品種別マスタ |
| `usage_status` | 部品使用状態マスタ |

### 4.2 関連

```text
assets_master 1 --- 1 computer_details
assets_master 1 --- 1 computer_parts
assets_master 1 --- n computer_configurations (computer_asset_master_id)
assets_master 1 --- n computer_configurations (part_asset_master_id)
part_types   1 --- n computer_configurations
usage_status 1 --- n computer_parts
```

## 5. API 一覧

ベースパスは `/api/v2`。

| Method | Path | 説明 |
| --- | --- | --- |
| `POST` | `/computer-details` | 計算機詳細登録 |
| `GET` | `/computer-details/{asset_master_id}` | 計算機詳細取得 |
| `PUT` | `/computer-details/{asset_master_id}` | 計算機詳細更新 |
| `POST` | `/computer-parts` | 計算機部品登録 |
| `GET` | `/computer-parts/{asset_master_id}` | 計算機部品取得 |
| `PUT` | `/computer-parts/{asset_master_id}` | 計算機部品更新 |
| `POST` | `/computer-configurations` | 計算機構成履歴登録 |
| `GET` | `/computers/{computer_asset_master_id}/configurations` | 計算機構成履歴一覧取得 |
| `PUT` | `/computer-configurations/{computer_configuration_id}` | 計算機構成履歴更新 |
| `GET` | `/part-types` | 部品種別マスタ一覧 |
| `GET` | `/usage-statuses` | 部品使用状態マスタ一覧 |

## 6. 共通仕様

### 6.1 認証

現行実装では本モジュールの API は未認証で呼び出し可能。

### 6.2 リクエスト型の重要事項

- `asset_master_id`
- `computer_asset_master_id`
- `part_asset_master_id`
- `computer_configuration_id`
- `part_type_id`
- `usage_status_id`

これらはすべて文字列ではなく数値で送る必要がある。

正:

```json
{
  "asset_master_id": 1
}
```

誤:

```json
{
  "asset_master_id": "1"
}
```

### 6.3 日付形式

| 項目 | 形式 | 備考 |
| --- | --- | --- |
| `installed_at` | `YYYY-MM-DD` | 構成履歴 |
| `removed_at` | `YYYY-MM-DD` | 構成履歴 |

`computer-details` と `computer-parts` では日付入力はない。

### 6.4 エラーレスポンス

形式は以下で統一される。

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "invalid json"
  }
}
```

主なエラーコード:

| コード | 意味 |
| --- | --- |
| `INVALID_ARGUMENT` | 入力不正、型不一致、存在しない参照 ID |
| `NOT_FOUND` | 対象レコードなし |
| `CONFLICT` | 一意制約違反、アクティブ構成競合 |
| `INTERNAL` | 内部エラー |

## 7. データ仕様

### 7.1 CreateComputerDetailRequest

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `asset_master_id` | integer | 必須 | 計算機本体の備品マスタ ID |
| `hostname` | string | 任意 | ホスト名 |
| `ip_address` | string | 任意 | IP アドレス |
| `mac_address` | string | 任意 | MAC アドレス |
| `os` | string | 任意 | OS 名 |
| `purpose` | string | 任意 | 利用目的 |
| `login_user` | string | 任意 | ログインユーザ |
| `note` | string | 任意 | 備考 |

### 7.2 UpdateComputerDetailRequest

全項目任意。  
送られたフィールドのみ更新する。

### 7.3 ComputerDetailResponse

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `computer_detail_id` | integer | 計算機詳細 ID |
| `asset_master_id` | integer | 親備品マスタ ID |
| `management_number` | string | 親備品の管理番号 |
| `asset_name` | string | 親備品名 |
| `hostname` | string/null | ホスト名 |
| `ip_address` | string/null | IP アドレス |
| `mac_address` | string/null | MAC アドレス |
| `os` | string/null | OS 名 |
| `purpose` | string/null | 利用目的 |
| `login_user` | string/null | ログインユーザ |
| `note` | string/null | 備考 |
| `created_at` | string | 作成日時 |
| `updated_at` | string | 更新日時 |

### 7.4 CreateComputerPartRequest

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `asset_master_id` | integer | 必須 | 部品側の備品マスタ ID |
| `usage_status_id` | integer | 必須 | 使用状態マスタ ID |
| `spec` | string | 任意 | 部品仕様 |
| `note` | string | 任意 | 備考 |

### 7.5 UpdateComputerPartRequest

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `usage_status_id` | integer | 任意 | 使用状態 ID |
| `spec` | string | 任意 | 部品仕様 |
| `note` | string | 任意 | 備考 |

### 7.6 ComputerPartResponse

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `computer_part_id` | integer | 計算機部品 ID |
| `asset_master_id` | integer | 親備品マスタ ID |
| `management_number` | string | 親備品の管理番号 |
| `asset_name` | string | 親備品名 |
| `usage_status_id` | integer | 使用状態 ID |
| `usage_status_name` | string | 使用状態の内部名 |
| `usage_status_display_name` | string | 使用状態の表示名 |
| `spec` | string/null | 部品仕様 |
| `note` | string/null | 備考 |
| `created_at` | string | 作成日時 |
| `updated_at` | string | 更新日時 |

### 7.7 CreateComputerConfigurationRequest

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `computer_asset_master_id` | integer | 必須 | 計算機本体の備品マスタ ID |
| `part_asset_master_id` | integer | 必須 | 部品の備品マスタ ID |
| `part_type_id` | integer | 必須 | 部品種別 ID |
| `installed_at` | string | 任意 | `YYYY-MM-DD` |
| `removed_at` | string | 任意 | `YYYY-MM-DD` |
| `note` | string | 任意 | 備考 |

### 7.8 UpdateComputerConfigurationRequest

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `part_asset_master_id` | integer | 任意 | 部品マスタ差し替え |
| `part_type_id` | integer | 任意 | 部品種別差し替え |
| `installed_at` | string | 任意 | `YYYY-MM-DD`、空文字でクリア |
| `removed_at` | string | 任意 | `YYYY-MM-DD`、空文字でクリア |
| `note` | string | 任意 | 空文字でクリア |

### 7.9 ComputerConfigurationResponse

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `computer_configuration_id` | integer | 構成履歴 ID |
| `computer_asset_master_id` | integer | 計算機本体の備品マスタ ID |
| `computer_management_number` | string | 計算機本体の管理番号 |
| `computer_name` | string | 計算機本体名 |
| `part_asset_master_id` | integer | 部品の備品マスタ ID |
| `part_management_number` | string | 部品の管理番号 |
| `part_name` | string | 部品名 |
| `part_type_id` | integer | 部品種別 ID |
| `part_type_name` | string | 部品種別の内部名 |
| `part_type_display_name` | string | 部品種別の表示名 |
| `installed_at` | string/null | 装着日 |
| `removed_at` | string/null | 取り外し日 |
| `note` | string/null | 備考 |
| `created_at` | string | 作成日時 |
| `updated_at` | string | 更新日時 |

### 7.10 PartTypeResponse

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `part_type_id` | integer | 部品種別 ID |
| `name` | string | 内部名 |
| `display_name` | string | 表示名 |
| `note` | string/null | 備考 |

### 7.11 UsageStatusResponse

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `usage_status_id` | integer | 使用状態 ID |
| `name` | string | 内部名 |
| `display_name` | string | 表示名 |
| `note` | string/null | 備考 |

## 8. API 詳細

### 8.1 `GET /part-types`

部品種別マスタ一覧を取得する。

レスポンス例:

```json
[
  {
    "part_type_id": 1,
    "name": "gpu",
    "display_name": "GPU",
    "note": null
  }
]
```

### 8.2 `GET /usage-statuses`

部品使用状態マスタ一覧を取得する。

レスポンス例:

```json
[
  {
    "usage_status_id": 1,
    "name": "in_use",
    "display_name": "使用中",
    "note": null
  }
]
```

### 8.3 `POST /computer-details`

計算機詳細を登録する。

リクエスト例:

```json
{
  "asset_master_id": 1,
  "hostname": "pc-a",
  "ip_address": "192.168.10.101",
  "mac_address": "AA:BB:CC:DD:EE:01",
  "os": "Windows 11 Pro",
  "purpose": "student workstation",
  "login_user": "lab-user",
  "note": "first setup"
}
```

成功時:

- `201 Created`
- `Location: /computer-details/{asset_master_id}`

### 8.4 `GET /computer-details/{asset_master_id}`

計算機詳細を取得する。

パスパラメータ:

| 名前 | 型 | 説明 |
| --- | --- | --- |
| `asset_master_id` | integer | 計算機本体の備品マスタ ID |

### 8.5 `PUT /computer-details/{asset_master_id}`

計算機詳細を更新する。

リクエスト例:

```json
{
  "hostname": "pc-a-renamed",
  "ip_address": "",
  "note": "ip cleared"
}
```

補足:

- 項目未送信: 更新しない
- 空文字送信: `NULL` へクリア

### 8.6 `POST /computer-parts`

計算機部品を登録する。

リクエスト例:

```json
{
  "asset_master_id": 2,
  "usage_status_id": 1,
  "spec": "8GB GDDR6",
  "note": "gpu inventory"
}
```

成功時:

- `201 Created`
- `Location: /computer-parts/{asset_master_id}`

### 8.7 `GET /computer-parts/{asset_master_id}`

計算機部品を取得する。

### 8.8 `PUT /computer-parts/{asset_master_id}`

計算機部品を更新する。

リクエスト例:

```json
{
  "usage_status_id": 2,
  "spec": "8GB GDDR6 updated",
  "note": ""
}
```

補足:

- `note: ""` は `NULL` クリア

### 8.9 `POST /computer-configurations`

計算機構成履歴を登録する。

リクエスト例:

```json
{
  "computer_asset_master_id": 1,
  "part_asset_master_id": 2,
  "part_type_id": 1,
  "installed_at": "2026-06-27",
  "note": "initial install"
}
```

成功時:

- `201 Created`
- `Location: /computers/{computer_asset_master_id}/configurations`

### 8.10 `GET /computers/{computer_asset_master_id}/configurations`

指定計算機の構成履歴一覧を取得する。

レスポンスは配列。

補足:

- `removed_at IS NULL` のアクティブ構成が先に返る
- 並び順は `removed_at IS NULL DESC, part_type_id ASC, computer_configuration_id DESC`

### 8.11 `PUT /computer-configurations/{computer_configuration_id}`

構成履歴を更新する。

リクエスト例:

```json
{
  "removed_at": "2026-07-01",
  "note": "removed for maintenance"
}
```

再アクティブ化例:

```json
{
  "removed_at": "",
  "note": "re-activated"
}
```

## 9. 業務ルール

### 9.1 計算機詳細

- `asset_master_id` は存在必須
- 同一 `asset_master_id` で複数の `computer_details` は作れない
- 作成時は前後空白を除去し、空文字は `NULL` 保存
- 更新時は空文字で `NULL` クリア

### 9.2 計算機部品

- `asset_master_id` は存在必須
- `usage_status_id` は存在必須
- 同一 `asset_master_id` で複数の `computer_parts` は作れない
- `spec` と `note` は詳細管理と同じく正規化される

### 9.3 計算機構成履歴

- `computer_asset_master_id`、`part_asset_master_id`、`part_type_id` は存在必須
- `removed_at < installed_at` は不可
- `removed_at IS NULL` をアクティブ構成とみなす
- 同一 `part_asset_master_id` は複数のアクティブ構成へ同時に割り当て不可
- 同一 `computer_asset_master_id` に同一 `part_type_id` のアクティブ構成を複数持てない
- 削除 API はない
- 取り外しは `removed_at` 更新で表現する

### 9.4 現行実装上の制約

- `management_number` を直接受ける API はない
- すべて `asset_master_id` ベースで扱う
- `slot_name` は未実装
- 計算機構成の競合制御は `part_type_id` 単位

## 10. フロントエンド実装ガイド

### 10.1 推奨画面フロー

1. `GET /part-types`
2. `GET /usage-statuses`
3. `POST /assets/pair` で計算機本体の備品作成
4. `POST /computer-details`
5. `POST /assets/pair` で部品備品作成
6. `POST /computer-parts`
7. `POST /computer-configurations`
8. `GET /computers/{computer_asset_master_id}/configurations`

### 10.2 フロント側で保持すべき ID

| 名称 | 取得元 | 用途 |
| --- | --- | --- |
| `asset_master_id` | `POST /assets/pair` の `master.asset_master_id` | 詳細・部品の主キー参照 |
| `management_number` | `POST /assets/pair` の `master.management_number` | 表示用 |
| `part_type_id` | `GET /part-types` | 構成履歴登録 |
| `usage_status_id` | `GET /usage-statuses` | 部品登録 |
| `computer_configuration_id` | `POST /computer-configurations` または一覧取得 | 構成履歴更新 |

### 10.3 フォーム実装上の注意

- ID は文字列入力欄で保持しても、送信時は数値へ変換する
- 更新 API で「未変更」と「クリア」を区別する
- 文字列項目:
  - 未送信: 変更なし
  - `""`: `NULL` クリア
- 日付項目:
  - 未送信: 変更なし
  - `""`: `NULL` クリア
  - `"2026-06-27"`: 値更新
- `installed_at` / `removed_at` に RFC3339 を送らない

### 10.4 代表的な入力エラー

| 条件 | 例 | 想定結果 |
| --- | --- | --- |
| ID を文字列送信 | `"asset_master_id": "1"` | `400 INVALID_ARGUMENT` |
| 存在しない `asset_master_id` | `999999` | `400 INVALID_ARGUMENT` |
| 存在しない `part_type_id` | `999999` | `400 INVALID_ARGUMENT` |
| 存在しない `usage_status_id` | `999999` | `400 INVALID_ARGUMENT` |
| 日付逆転 | `removed_at < installed_at` | `400 INVALID_ARGUMENT` |
| 部品重複アクティブ割当 | 同じ `part_asset_master_id` を再登録 | `409 CONFLICT` |
| 同一種別の重複アクティブ割当 | 同じ PC に同じ `part_type_id` を再登録 | `409 CONFLICT` |

## 11. テスト観点

最低限確認したい観点:

1. `asset_master_id` などの数値項目が文字列だと bind エラーになること
2. 計算機詳細の空文字更新で `NULL` クリアされること
3. `usage_status_id` 不正時に 400 になること
4. `part_type_id` 不正時に 400 になること
5. `removed_at < installed_at` が 400 になること
6. 同一部品のアクティブ重複が 409 になること
7. 同一 PC / 同一 `part_type_id` のアクティブ重複が 409 になること

## 12. 参考ソース

- `internal/asset_mgmt/computers/dto.go`
- `internal/asset_mgmt/computers/model.go`
- `internal/asset_mgmt/computers/error.go`
- `internal/asset_mgmt/computers/handler.go`
- `internal/asset_mgmt/computers/service.go`
- `internal/asset_mgmt/computers/store.go`
- `internal/asset_mgmt/computers/service_test.go`
