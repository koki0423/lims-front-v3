import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { scanStudentIdWithRetry } from "../../js/nfcReader.js";

// 廃棄機能の状態管理
const disposalState = {
    data: {},   // 入力データ
    submitting: false,
};

const historyState = {
    items: []
};

// 管理番号の正規化
function normalizeMgmtInput(s) {
    if (!s) return '';
    let t = String(s).normalize('NFKC').trim();
    t = t.replace(/[‐-‒–—―ー−]/g, '-');
    return t.toUpperCase();
}

window.DisposalController = {
    saveInput() {
        const form = document.getElementById('form-disposal');
        if (!form) return;
        const formData = new FormData(form);
        for (const pair of formData.entries()) {
            disposalState.data[pair[0]] = pair[1];
        }
        console.log('Input Data:', disposalState.data);
    },

    async NfcRead() {
        const input = document.querySelector('input[name="registrant"]');
        try {
            const result = await scanStudentIdWithRetry(9, 2000);
            if (result.ok) {
                console.log("OK:", result.studentId);
                input.value = result.studentId;
            } else {
                console.log("NG:", result.error);
                input.value = "error";
            }
        } catch (err) {
            console.error("scan error:", err);
            input.value = "error";
        }
    },

    async toConfirm() {
        const form = document.getElementById('form-disposal');
        if (!form) return;
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const rawMgmt = formData.get('itemId') || '';
        const mgmt = normalizeMgmtInput(rawMgmt);

        if (!mgmt) {
            alert('備品番号を入力してください');
            return;
        }

        // ここでキー名をセット
        disposalState.data.itemId = mgmt;
        disposalState.data.qty = formData.get('qty') || '1';
        disposalState.data.registrant = formData.get('registrant') || '';
        disposalState.data.date = formData.get('date') || '';
        disposalState.data.reason = formData.get('reason') || '';

        if (!disposalState.data.registrant) {
            alert('登録者(学生証)を入力してください（NFC読み取り）');
            return;
        }

        Router.to('disposal-confirm');
    },

    async disposalSubmit() {
        if (disposalState.submitting) return;

        const d = disposalState.data;
        const mgmt = normalizeMgmtInput(d.itemId);
        if (!mgmt) {
            alert('管理番号が不正です');
            return;
        }

        const payload = {
            reason: d.reason,
            processed_by_id: d.registrant,
            quantity: parseInt(d.qty),
        };

        console.log('Disposal Submit payload:', mgmt, payload);

        disposalState.submitting = true;
        try {
            await API.disposal.register(mgmt, payload);
            disposalState.data = {};

            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('廃棄登録が完了しました');
            } else {
                alert('廃棄登録が完了しました');
                Router.to('disposal-input');
            }
        } catch (e) {
            console.error('Disposal Submit error:', e);
            const msg = (e?.response?.data?.error) || '廃棄登録中にエラーが発生しました。';
            alert(msg);
        } finally {
            disposalState.submitting = false;
        }
    },
};

export function initDisposal(view) {
    if (view === 'input') {
        const form = document.getElementById('form-disposal');
        if (!form) return;

        if (Object.keys(disposalState.data).length > 0) {
            restoreFormData(form, disposalState.data);
        } else {
            const dateInput = form.querySelector('input[name="date"]');
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
                disposalState.data.date = today;
            }
        }

    } else if (view === 'confirm') {
        const display = document.getElementById('disp-confirm-view');
        if (display) {
            const d = disposalState.data;
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${d.itemId || ''}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${d.qty || '1'}</span></div>
                <div class="info-row"><span class="info-label">登録者</span><span>${d.registrant || ''}</span></div> 
                <div class="info-row"><span class="info-label">廃棄日</span><span>${d.date || ''}</span></div>
                <div class="info-row"><span class="info-label">廃棄理由</span><span>${d.reason || ''}</span></div>
            `;
        }

    } else if (view === 'history') {
        initDisposalHistory(); // router側で呼んでいるならコメントアウトのままでOK
    }
}

function restoreFormData(form, data) {
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const input = form.querySelector('[name="' + key + '"]');
        if (input) input.value = data[key];
    }
}

export async function initDisposalHistory() {
    const tbody = document.getElementById('disposal-history-body');
    const loader = document.getElementById('loading-spinner');

    if (tbody) tbody.innerHTML = '';
    if (loader) loader.style.display = 'block';

    try {
        const response = await API.disposal.fetchHistory();
        console.log('Disposal history response:', response);
        const data = Array.isArray(response) ? response : (response.items || []);
        historyState.items = data;

        renderTable();
    } catch (error) {
        console.error('Fetch error:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">履歴の取得に失敗しました</td></tr>`;
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderTable() {
    const tbody = document.getElementById('disposal-history-body');
    if (!tbody) return;

    if (historyState.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">廃棄履歴はありません</td></tr>';
        return;
    }

    tbody.innerHTML = historyState.items.map(item => {
        const dateObj = new Date(item.disposed_at);
        const dateStr = isNaN(dateObj.getTime())
            ? '-'
            : dateObj.toLocaleDateString('ja-JP') + ' ' + dateObj.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        const reason = item.reason || '－';
        const pic = item.processed_by_id || '不明';

        return `
            <tr>
                <td style="padding: 12px 5px;">${dateStr}</td>
                <td style="padding: 12px 5px;">${item.management_number || '-'}</td>
                <td style="padding: 12px 5px;">${item.quantity}</td>
                <td style="padding: 12px 5px;">${reason}</td>
                <td style="padding: 12px 5px;">${pic}</td>
            </tr>
        `;
    }).join('');
}