import { NFCPortLib, Configuration, DetectionOption } from "./NFCPortLib.js";

let encodingLoaderPromise = null;

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
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();

    if (lower.includes("cancel")) {
        return true;
    }
    if (lower.includes("aborted")) {
        return true;
    }
    if (lower.includes("notfounderror")) {
        return true;
    }
    if (lower.includes("no device")) {
        return true;
    }
    if (lower.includes("device not selected")) {
        return true;
    }
    if (lower.includes("permission denied")) {
        return true;
    }
    if (lower.includes("denied")) {
        return true;
    }

    return false;
}

async function scanStudentIdOnce() {
    let lib = null;
    const Encoding = await ensureEncodingLoaded();

    try {
        lib = new NFCPortLib();

        const config = new Configuration(500, 500, true, true);
        await lib.init(config);
        await lib.open();

        const detectOption = new DetectionOption(
            new Uint8Array([0x82, 0x77]),
            0,
            true,
            false,
            null
        );

        const card = await lib.detectCard("iso18092", detectOption);

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
                return {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                    cancelled: true
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

    return {
        ok: false,
        error: lastError instanceof Error ? lastError.message : String(lastError),
        cancelled: false
    };
}
