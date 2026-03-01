let currentMonth = '';
let billingData = null;

function pageInit() {
    // Default to current month
    const now = new Date();
    currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    loadBilling();
}

function formatMonthDisplay(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function changeMonth(delta) {
    const [year, month] = currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    currentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadBilling();
}

async function loadBilling() {
    document.getElementById('month-display').textContent = formatMonthDisplay(currentMonth);

    const data = await apiFetch(API_URL + '/billing?month=' + currentMonth);
    if (!data) return;

    billingData = data;
    const s = data.summary;

    document.getElementById('sum-revenue').textContent = '$' + (s.total_revenue || 0).toLocaleString();
    document.getElementById('sum-paid').textContent = '$' + (s.total_paid || 0).toLocaleString();
    document.getElementById('sum-unpaid').textContent = '$' + (s.total_unpaid || 0).toLocaleString();
    document.getElementById('sum-sent').textContent = (s.total_sent || 0) + ' / ' + (s.total_clients || 0);

    renderTable(data.clients);
}

function renderTable(clients) {
    const tbody = document.getElementById('billing-table');
    if (!clients || clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">No clients found</td></tr>';
        return;
    }

    tbody.innerHTML = clients.map(c => {
        const inv = c.invoice;
        const hasInvoice = !!inv;
        const isSent = hasInvoice && inv.invoice_sent;
        const isPaid = hasInvoice && inv.paid;
        const paidAt = (hasInvoice && inv.paid_at) ? inv.paid_at.substring(0, 10) : '';
        const notes = hasInvoice ? (inv.notes || '') : '';
        const logoHtml = c.logo_url
            ? `<img src="${esc(c.logo_url)}" class="w-8 h-8 rounded-full object-cover" alt="">`
            : `<div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">${esc((c.client_name || '?')[0])}</div>`;

        return `<tr class="border-t hover:bg-gray-50" data-client-id="${c.client_id}">
            <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                    ${logoHtml}
                    <span class="font-medium text-sm">${esc(c.client_name)}</span>
                </div>
            </td>
            <td class="px-4 py-3">
                <input type="number" step="0.01" min="0" value="${c.monthly_value || 0}"
                       class="border rounded px-2 py-1 w-28 text-sm billing-value-input"
                       data-client-id="${c.client_id}"
                       onchange="updateClientBilling(${c.client_id})">
            </td>
            <td class="px-4 py-3">
                <input type="date" value="${c.billing_start_date || ''}"
                       class="border rounded px-2 py-1 text-sm billing-start-input"
                       data-client-id="${c.client_id}"
                       onchange="updateClientBilling(${c.client_id})">
            </td>
            <td class="px-4 py-3 text-center">
                ${hasInvoice
                    ? `<button onclick="toggleSent(${inv.id}, ${isSent ? 0 : 1})" class="px-3 py-1 rounded-full text-xs font-semibold transition ${isSent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-blue-50'}">
                        <i class="fa-solid ${isSent ? 'fa-check' : 'fa-minus'} mr-1"></i>${isSent ? 'Sent' : 'Not Sent'}
                       </button>`
                    : `<span class="text-xs text-gray-300">-</span>`
                }
            </td>
            <td class="px-4 py-3 text-center">
                ${hasInvoice
                    ? `<button onclick="togglePaid(${inv.id}, ${isPaid ? 0 : 1})" class="px-3 py-1 rounded-full text-xs font-semibold transition ${isPaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-green-50'}">
                        <i class="fa-solid ${isPaid ? 'fa-check-double' : 'fa-minus'} mr-1"></i>${isPaid ? 'Paid' : 'Unpaid'}
                       </button>`
                    : `<span class="text-xs text-gray-300">-</span>`
                }
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${paidAt ? esc(paidAt) : '-'}</td>
            <td class="px-4 py-3">
                ${hasInvoice
                    ? `<div class="flex items-center gap-1">
                        <input type="text" value="${esc(notes)}" placeholder="Add note..."
                               class="border rounded px-2 py-1 text-sm w-32 billing-notes-input"
                               data-invoice-id="${inv.id}"
                               onchange="updateNotes(${inv.id}, this.value)">
                       </div>`
                    : `<span class="text-xs text-gray-300">-</span>`
                }
            </td>
        </tr>`;
    }).join('');
}

async function generateInvoices() {
    const res = await apiFetch(API_URL + '/billing/generate', {
        method: 'POST',
        body: { month: currentMonth }
    });
    if (res && res.success) {
        showToast(`Generated ${res.created} invoices (${res.skipped} skipped)`, 'success');
        loadBilling();
    }
}

async function toggleSent(invoiceId, value) {
    const res = await apiFetch(API_URL + '/billing/invoice/' + invoiceId, {
        method: 'PUT',
        body: { invoice_sent: value }
    });
    if (res && res.success) loadBilling();
}

async function togglePaid(invoiceId, value) {
    const res = await apiFetch(API_URL + '/billing/invoice/' + invoiceId, {
        method: 'PUT',
        body: { paid: value }
    });
    if (res && res.success) loadBilling();
}

async function updateClientBilling(clientId) {
    const row = document.querySelector(`tr[data-client-id="${clientId}"]`);
    if (!row) return;
    const valueInput = row.querySelector('.billing-value-input');
    const startInput = row.querySelector('.billing-start-input');

    const res = await apiFetch(API_URL + '/billing/client/' + clientId, {
        method: 'PUT',
        body: {
            monthly_value: parseFloat(valueInput.value) || 0,
            billing_start_date: startInput.value || ''
        }
    });
    if (res && res.success) {
        showToast('Client billing updated', 'success');
    }
}

async function updateNotes(invoiceId, notes) {
    const res = await apiFetch(API_URL + '/billing/invoice/' + invoiceId, {
        method: 'PUT',
        body: { notes: notes }
    });
    if (res && res.success) {
        showToast('Note saved', 'success');
    }
}
