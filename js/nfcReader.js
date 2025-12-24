import { NFCPortLib, Configuration, DetectionOption } from "./NFCPortLib.js";

// encoding-japanese は HTML 側で <script> から読み込み済み前提
const Encoding = window.Encoding;
if (!Encoding) {
    throw new Error(
        "Encoding (encoding-japanese) が見つかりません。HTML に encoding.min.js を読み込んでください。"
    );
}

// ヘルパー
function _array_copy(dest, dest_offset, src, src_offset, length) {
    for (let idx = 0; idx < length; idx++) {
        dest[dest_offset + idx] = src[src_offset + idx];
    }
}

/**
 * NFC を 1 回だけ読んで学籍番号を返す
 * 失敗したら Error を投げる
 */
async function scanStudentIdOnce() {
    let lib = null;

    try {
        lib = new NFCPortLib();

        // タイムアウトなどは元コードに合わせて調整
        const config = new Configuration(500, 500, true, true);
        await lib.init(config);
        await lib.open();

        // FeliCa 学生証検出用 (元の DetectionOption と同じ)
        const detectOption = new DetectionOption(
            new Uint8Array([0x82, 0x77]),
            0,
            true,
            false,
            null
        );

        const card = await lib.detectCard("iso18092", detectOption);

        // 学籍番号読み出しコマンド（元コードからコピー）
        const readStudentIdCommand = new Uint8Array([
            16, 0x06, 0, 0, 0, 0, 0, 0, 0, 0,
            1, 0x0b, 0x01, 1, 0x80, 0x00
        ]);

        _array_copy(
            readStudentIdCommand,
            2,
            card.idm,
            0,
            card.idm.length
        );

        const response = await lib.communicateThru(
            readStudentIdCommand,
            100,
            detectOption
        );

        if (!response || response.length <= 13) {
            throw new Error("カードから有効なデータが取得できませんでした。");
        }

        const blockData = response.slice(13);

        const decodedString = Encoding.convert(blockData, {
            to: "UNICODE",
            from: "SJIS",
            type: "string"
        });

        // 元の実装に合わせて 3〜10 桁目を学籍番号として抜き出し
        const studentId = decodedString.substring(3, 10);

        if (!studentId || studentId.length === 0) {
            throw new Error("学籍番号が読み取れませんでした。");
        }

        return studentId;
    } finally {
        if (lib) {
            try {
                await lib.close();
            } catch (_) {
                // close 失敗は握りつぶす
            }
        }
    }
}

/**
 * リトライ付きの学籍番号読み取り
 *
 * @param {number} maxRetry 最大リトライ回数
 * @param {number} retryIntervalMs リトライ間隔(ms)
 * @returns {Promise<{ok: true, studentId: string} | {ok: false, error: string}>}
 */
export async function scanStudentIdWithRetry(
    maxRetry = 9,
    retryIntervalMs = 2000
) {
    let lastError = null;

    // 0 回目 + リトライ maxRetry 回、合計 maxRetry+1 トライ
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        try {
            const id = await scanStudentIdOnce();
            return {
                ok: true,
                studentId: id
            };
        } catch (err) {
            lastError = err;
            if (attempt === maxRetry) {
                break;
            }

            // 次の試行まで待つ
            await new Promise((resolve) => {
                setTimeout(resolve, retryIntervalMs);
            });
        }
    }

    return {
        ok: false,
        error:
            lastError instanceof Error
                ? lastError.message
                : String(lastError)
    };
}
