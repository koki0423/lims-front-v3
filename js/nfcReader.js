import { NFCPortLib, Configuration, DetectionOption } from "./NFCPortLib.js";

let encodingLoaderPromise = null;

const NFC_STAGE_LABELS = {
    encoding: '文字コード変換ライブラリ',
    init: 'NFCライブラリ初期化',
    open: 'NFCリーダ接続',
    detectCard: '学生証検出',
    readBlock: '学生証データ読取',
    decodeStudentId: '学籍番号解析'
};

class NfcStageError extends Error {
    constructor(stage, message, cause = null) {
        super(message);
        this.name = 'NfcStageError';
        this.stage = stage;
        this.stageLabel = NFC_STAGE_LABELS[stage] || stage;
        this.cause = cause;
        this.details = getErrorDetails(cause);
    }
}

function getErrorDetails(error) {
    if (!error) {
        return '';
    }

    const details = [];
    const message = error instanceof Error ? error.message : String(error);

    if (message) {
        details.push(message);
    }
    if (error.name && error.name !== 'Error') {
        details.push(`name=${error.name}`);
    }
    if (typeof error.errorType !== 'undefined') {
        details.push(`errorType=${error.errorType}`);
    }
    if (typeof error.communicationStatus !== 'undefined' && error.communicationStatus !== 0) {
        details.push(`communicationStatus=${error.communicationStatus}`);
    }
    if (error.fileName) {
        details.push(`file=${error.fileName}${error.lineNumber ? ':' + error.lineNumber : ''}`);
    }

    return details.join(' / ');
}

function collectErrorMessages(error, messages = []) {
    if (!error) {
        return messages;
    }

    if (error instanceof Error && error.message) {
        messages.push(error.message);
    } else {
        messages.push(String(error));
    }

    if (error.details) {
        messages.push(error.details);
    }
    if (error.cause && error.cause !== error) {
        collectErrorMessages(error.cause, messages);
    }

    return messages;
}

function formatScanError(error) {
    if (error instanceof NfcStageError) {
        const details = error.details ? `（詳細: ${error.details}）` : '';
        return `${error.stageLabel}に失敗しました: ${error.message}${details}`;
    }

    return error instanceof Error ? error.message : String(error);
}

function getScanErrorStage(error) {
    if (error instanceof NfcStageError) {
        return {
            stage: error.stage,
            stageLabel: error.stageLabel,
            details: error.details
        };
    }

    return {
        stage: 'unknown',
        stageLabel: '不明',
        details: getErrorDetails(error)
    };
}

async function runNfcStage(stage, message, action) {
    try {
        return await action();
    } catch (error) {
        if (error instanceof NfcStageError) {
            throw error;
        }

        throw new NfcStageError(stage, message, error);
    }
}

async function ensureEncodingLoaded() {
    if (window.Encoding) {
        return window.Encoding;
    }

    if (!encodingLoaderPromise) {
        encodingLoaderPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-encoding-japanese="1"]');

            if (existingScript) {
                existingScript.addEventListener('load', () => {
                    if (window.Encoding) {
                        resolve(window.Encoding);
                        return;
                    }

                    reject(new Error('encoding-japanese の読み込みに失敗しました。'));
                }, { once: true });

                existingScript.addEventListener('error', () => {
                    reject(new Error('encoding-japanese の取得に失敗しました。'));
                }, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/encoding-japanese@1.0.30/encoding.min.js';
            script.async = true;
            script.dataset.encodingJapanese = '1';
            script.addEventListener('load', () => {
                if (window.Encoding) {
                    resolve(window.Encoding);
                    return;
                }

                reject(new Error('encoding-japanese の読み込みに失敗しました。'));
            }, { once: true });
            script.addEventListener('error', () => {
                reject(new Error('encoding-japanese の取得に失敗しました。'));
            }, { once: true });
            document.head.appendChild(script);
        }).catch((error) => {
            encodingLoaderPromise = null;
            throw error;
        });
    }

    return encodingLoaderPromise;
}

function _array_copy(dest, dest_offset, src, src_offset, length) {
    for (let idx = 0; idx < length; idx++) {
        dest[dest_offset + idx] = src[src_offset + idx];
    }
}

function isNonRetryableError(err) {
    if (err instanceof NfcStageError && ['encoding', 'init', 'open', 'decodeStudentId'].includes(err.stage)) {
        return true;
    }

    const lower = collectErrorMessages(err).join(' ').toLowerCase();

    if (lower.includes("permission denied")) {
        return true;
    }
    if (lower.includes("denied")) {
        return true;
    }
    if (lower.includes("user gesture")) {
        return true;
    }
    if (lower.includes("user activation")) {
        return true;
    }
    if (lower.includes("must be handling")) {
        return true;
    }

    return false;
}

function isUserCancelledError(err) {
    const lower = collectErrorMessages(err).join(' ').toLowerCase();

    if (lower.includes("cancel")) {
        return true;
    }
    if (lower.includes("aborted")) {
        return true;
    }
    if (lower.includes("notfounderror")) {
        return true;
    }
    if (lower.includes("no device selected")) {
        return true;
    }
    if (lower.includes("device not selected")) {
        return true;
    }

    return false;
}

async function scanStudentIdOnce() {
    let lib = null;
    const Encoding = await runNfcStage(
        'encoding',
        'encoding-japanese を読み込めませんでした',
        ensureEncodingLoaded
    );

    try {
        lib = new NFCPortLib();

        const config = new Configuration(500, 500, true, true);
        await runNfcStage(
            'init',
            'NFCライブラリの初期化に失敗しました',
            () => lib.init(config)
        );
        await runNfcStage(
            'open',
            'NFCリーダを開けませんでした',
            () => lib.open()
        );

        const detectOption = new DetectionOption(
            new Uint8Array([0x82, 0x77]),
            0,
            true,
            false,
            null
        );

        const card = await runNfcStage(
            'detectCard',
            '学生証が検出できませんでした。カードをリーダーに置いてください',
            () => lib.detectCard("iso18092", detectOption)
        );

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

        const response = await runNfcStage(
            'readBlock',
            '学生証の学籍番号データを読み取れませんでした',
            async () => {
                const result = await lib.communicateThru(
                    readStudentIdCommand,
                    100,
                    detectOption
                );

                if (!result || result.length <= 13) {
                    throw new Error("カードから有効なデータが取得できませんでした。");
                }

                return result;
            }
        );

        return await runNfcStage(
            'decodeStudentId',
            '読み取ったデータから学籍番号を解析できませんでした',
            async () => {
                const blockData = response.slice(13);
                const decodedString = Encoding.convert(blockData, {
                    to: "UNICODE",
                    from: "SJIS",
                    type: "string"
                });

                const studentId = decodedString.substring(3, 10);

                if (!studentId || studentId.length === 0) {
                    throw new Error("学籍番号が読み取れませんでした。");
                }

                return studentId;
            }
        );
    } finally {
        if (lib) {
            try {
                await lib.close();
            } catch (_) {
            }
        }
    }
}

export async function scanStudentIdWithRetry(
    maxRetry = 9,
    retryIntervalMs = 2000
) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        try {
            const id = await scanStudentIdOnce();
            return {
                ok: true,
                studentId: id
            };
        } catch (err) {
            lastError = err;

            if (isNonRetryableError(err)) {
                const errorInfo = getScanErrorStage(err);
                return {
                    ok: false,
                    error: formatScanError(err),
                    stage: errorInfo.stage,
                    stageLabel: errorInfo.stageLabel,
                    details: errorInfo.details,
                    cancelled: isUserCancelledError(err)
                };
            }

            if (attempt === maxRetry) {
                break;
            }

            await new Promise((resolve) => {
                setTimeout(resolve, retryIntervalMs);
            });
        }
    }

    const errorInfo = getScanErrorStage(lastError);
    return {
        ok: false,
        error: formatScanError(lastError),
        stage: errorInfo.stage,
        stageLabel: errorInfo.stageLabel,
        details: errorInfo.details,
        cancelled: false
    };
}
