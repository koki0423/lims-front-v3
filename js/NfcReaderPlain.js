// nfcReaderPlain.js
import { NFCPortLib, Configuration, DetectionOption } from "./NFCPortLib.js";

// Uint8Arrayの一部コピー（元コードの _array_copy と同等 :contentReference[oaicite:1]{index=1}）
function arrayCopy(dest, destOffset, src, srcOffset, length) {
  for (let idx = 0; idx < length; idx++) {
    dest[destOffset + idx] = src[srcOffset + idx];
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * 1回カードを読んで学籍番号(っぽいもの)を返す
 * - 成功: { ok: true, studentId, decodedString, rawResponse }
 * - 失敗: { ok: false, error }
 */
export async function scanStudentIdOnce() {
  let lib = null;

  try {
    lib = new NFCPortLib();
    await lib.init(new Configuration(500, 500, true, true)); // :contentReference[oaicite:2]{index=2}
    await lib.open();                                       // :contentReference[oaicite:3]{index=3}

    // 検出オプション（元コードと同じ :contentReference[oaicite:4]{index=4}）
    const detectOption = new DetectionOption(
      new Uint8Array([0x82, 0x77]),
      0,
      true,
      false,
      null
    );

    // FeliCa/ISO18092 でカード検出 :contentReference[oaicite:5]{index=5}
    const card = await lib.detectCard("iso18092", detectOption);

    // 読み取りコマンド（元コードと同じ :contentReference[oaicite:6]{index=6}）
    const readStudentIdCommand = new Uint8Array([
      16, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x0b, 0x01, 1, 0x80, 0x00,
    ]);
    arrayCopy(readStudentIdCommand, 2, card.idm, 0, card.idm.length);

    const response = await lib.communicateThru(readStudentIdCommand, 100, detectOption);

    if (!response || response.length <= 13) {
      throw new Error("カードから有効なデータが取得できませんでした。");
    }

    // 13byte以降がデータ（元コードと同じ :contentReference[oaicite:7]{index=7}）
    const blockData = response.slice(13);

    // 依存ライブラリ無しでSJISをデコード（ChromeならだいたいOK）
    // もし環境でダメなら encoding-japanese を使う版に差し替え可
    const decodedString = new TextDecoder("shift_jis").decode(blockData);

    // 元コードは substring(3, 10) でIDを抜いてる :contentReference[oaicite:8]{index=8}
    const studentId = decodedString.substring(3, 10);

    console.log("[NFC] decoded:", decodedString);
    console.log("[NFC] studentId:", studentId);

    return { ok: true, studentId: studentId, decodedString: decodedString, rawResponse: response };
  } catch (err) {
    console.error("[NFC] scan failed:", err);
    return { ok: false, error: err };
  } finally {
    if (lib) {
      try {
        await lib.close(); // :contentReference[oaicite:9]{index=9}
      } catch (e) {
        // close失敗は握りつぶし
      }
    }
  }
}

/**
 * 失敗したらリトライ（元Hookは最大10回くらい :contentReference[oaicite:10]{index=10}）
 */
export async function scanStudentIdWithRetry(maxRetries, retryIntervalMs) {
  const max = typeof maxRetries === "number" ? maxRetries : 9;
  const interval = typeof retryIntervalMs === "number" ? retryIntervalMs : 2000;

  for (let attempt = 0; attempt <= max; attempt++) {
    const result = await scanStudentIdOnce();
    if (result.ok) {
      return result;
    }
    if (attempt < max) {
      await sleep(interval);
    }
  }

  return { ok: false, error: new Error("読み取りに失敗しました。") };
}
