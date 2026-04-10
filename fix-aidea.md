- 高 / セキュリティ API や入力値を innerHTML に直接差し込んでいる箇所が広くあり、資産名・ジャンル名・廃棄理由などから
    DOM XSS が成立します。lend_return では escapeHtml() を持っているので、その方針に統一したほうがいいです。/C:/Users/
    koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/item_list/logic.js:367, /C:/Users/koki/Desktop/
    lims/lims-develop-env/frontend/lims-front-v3/modules/search/logic.js:376, /C:/Users/koki/Desktop/lims/lims-develop-
    env/frontend/lims-front-v3/modules/disposal/logic.js:171, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/
    lims-front-v3/modules/disposal/logic.js:243, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/
    modules/admin/logic.js:116, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/
    registration/logic.js:567, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/lend_return/
    logic.js:34
- 高 / セキュリティ 管理者トークンを localStorage に保存しているため、上記 XSS が 1 箇所でも通ると認証トークンを即時に
    奪われます。可能なら HttpOnly Cookie に寄せるべきで、最低でも CSP と保存先の見直しが必要です。/C:/Users/koki/
    Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/token.js:3, /C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/js/token.js:7
- 中高 / 機能不整合 返却検索が複数ヒット時でも list[0] をそのまま返却対象にしており、貸出先 ID で検索した場合に別の貸
    出レコードを返却してしまいます。検索 UI が「管理番号 または 貸出先」と明示しているので、候補一覧を挟まないのは危険で
    す。/C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/lend_return/logic.js:190, /C:/Users/
    koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/lend_return/logic.js:219, /C:/Users/koki/Desktop/
    lims/lims-develop-env/frontend/lims-front-v3/modules/lend_return/return_search.html:6
- 中高 / 画面遷移 認証ガードで routeKey を admin-login に差し替えた後も、init は差し替え前の route を実行しています。
    未ログインで admin-genres に入ると、ログイン画面を表示しつつジャンル初期化を走らせる形になります。加えて遷移の世代管
    理がないので、連打時に古い fetch() の結果が新しい画面を上書きできます。/C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/js/router.js:121, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/
    router.js:124, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/router.js:131, /C:/Users/koki/
    Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/router.js:136, /C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/js/router.js:147
- 中 / 初期表示性能・可用性 初回表示前にジャンルマスタ取得を await しているうえ、router.js が全機能モジュールを先読み
    し、その過程で NFC ライブラリ 依存まで初期ロードされます。さらに encoding-japanese が CDN から取れないと
    nfcReader.js が throw して、NFC を使わない画面でも起動不能になります。/C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/js/app.js:5, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/
    app.js:6, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/router.js:1, /C:/Users/koki/
    Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/router.js:7, /C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/js/nfcReader.js:1, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/
    nfcReader.js:3, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/index.html:12
- 中 / 日付バグ new Date().toISOString().split('T')[0] は UTC 基準なので、日本時間では 00:00-08:59 の間に前日の日付が
    入ります。例えば JST の 2026-04-11 08:00 に開くと 2026-04-10 が初期値になります。返却日・廃棄日のデフォルトはローカ
    ル日付で組むべきです。購入日も date-only を UTC ISO に変換して送っており、日付型の扱いが不安定です。/C:/Users/koki/
    Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/disposal/logic.js:161, /C:/Users/koki/Desktop/lims/
    lims-develop-env/frontend/lims-front-v3/modules/lend_return/logic.js:523, /C:/Users/koki/Desktop/lims/lims-develop-
    env/frontend/lims-front-v3/modules/registration/logic.js:90
- 中 / パフォーマンス・データ欠落 一覧系がサーバ側ページングを使わずにクライアント側で抱え込んでいます。備品一覧は全件
    取得してから絞り込み・ページングし、貸出/返却履歴は limit: 100 の 100 件だけ取ってローカルページングしているので、件
    数増加で重くなるうえ 101 件目以降が UI から消えます。/C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-
    front-v3/js/api.js:72, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/modules/item_list/
    logic.js:318, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/api.js:105, /C:/Users/koki/
    Desktop/lims/lims-develop-env/frontend/lims-front-v3/js/api.js:107, /C:/Users/koki/Desktop/lims/lims-develop-env/
    frontend/lims-front-v3/modules/lend_return/logic.js:307, /C:/Users/koki/Desktop/lims/lims-develop-env/frontend/lims-
    front-v3/modules/lend_return/logic.js:327
- 中 / フォールバック不全 ensureGenresLoaded() が Axios 生レスポンス前提で res.data を見ていますが、このコードベースで
    はレスポンスインターセプタで既に res.data を返しています。そのためフォールバック時に AppState.genres が空配列にな
    り、ジャンル表示やラベル印刷の補完が壊れます。/C:/Users/koki/Desktop/lims/lims-front-v3/modules/item_list/
    logic.js:285, /C:/Users/koki/Desktop/lims/lims-front-v3/modules/item_list/logic.js:291, /C:/Users/koki/Desktop/lims/
    lims-develop-env/frontend/lims-front-v3/js/api.js:29