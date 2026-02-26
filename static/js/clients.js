// Accounts (clients) page JS
function pageInit() { loadClients(); }

async function loadClients() {
    try {
        const clients = await fetch(API_URL + '/clients').then(r => r.json());
        // Cards view
        const cardsEl = document.getElementById('client-cards');
        if (cardsEl) {
            cardsEl.innerHTML = clients.map(c => {
                const reqs = parseContentReqs(c.content_requirements);
                const reqSummary = reqs.length > 0
                    ? reqs.map(r => `${r.count} ${r.type}/${r.platform}`).join(', ')
                    : 'No requirements set';
                return `<div class="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition cursor-pointer" onclick="window.location='/clients/${c.id}'">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">${esc(c.name?.charAt(0) || '?')}</div>
                        <div>
                            <h3 class="font-semibold">${esc(c.name)}</h3>
                            <p class="text-xs text-gray-500">${esc(c.company) || 'No company'}</p>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mb-2 line-clamp-2">${c.brief_text ? esc(c.brief_text.substring(0, 100)) + (c.brief_text.length > 100 ? '...' : '') : '<span class="italic">No brief</span>'}</p>
                    <p class="text-[11px] text-indigo-600">${esc(reqSummary)}</p>
                </div>`;
            }).join('') || '<div class="col-span-full text-center py-8 text-gray-500">No accounts yet. Click "Add Account" to get started.</div>';
        }
        // Table view
        document.getElementById('clients-table').innerHTML = clients.map(c => `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-4 sm:px-6 py-4 font-semibold"><a href="/clients/${c.id}" class="text-indigo-600 hover:underline">${esc(c.name)}</a></td>
                <td class="px-4 sm:px-6 py-4">${esc(c.company) || '-'}</td>
                <td class="px-4 sm:px-6 py-4 hidden sm:table-cell text-sm text-gray-500">${c.brief_text ? esc(c.brief_text.substring(0, 60)) + (c.brief_text.length > 60 ? '...' : '') : '-'}</td>
                <td class="px-4 sm:px-6 py-4">
                    <a href="/clients/${c.id}" class="text-indigo-600 mr-2" title="View"><i class="fa-solid fa-eye"></i></a>
                    ${canDo('manageClients') ? `<button onclick="event.preventDefault(); deleteClient(${c.id})" class="text-red-600" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="text-center py-8 text-gray-500">No accounts yet</td></tr>';
    } catch (e) { console.error('Error loading accounts:', e); }
}

function parseContentReqs(json) {
    if (!json) return [];
    try { return JSON.parse(json); } catch (e) { return []; }
}

function showAddClientModal() { document.getElementById('add-client-modal').classList.remove('hidden'); }
function hideAddClientModal() {
    document.getElementById('add-client-modal').classList.add('hidden');
    // Reset form
    document.getElementById('client-name').value = '';
    document.getElementById('client-company').value = '';
    document.getElementById('client-email').value = '';
    document.getElementById('client-brief').value = '';
    document.getElementById('content-req-rows').innerHTML = getDefaultReqRow();
}

function getDefaultReqRow() {
    return `<div class="flex items-center gap-2 flex-wrap content-req-row">
        <select class="cr-platform border rounded-lg px-2 py-1 text-sm">
            <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="tiktok">TikTok</option><option value="x">X</option>
        </select>
        <select class="cr-type border rounded-lg px-2 py-1 text-sm">
            <option value="post">Post</option><option value="story">Story</option><option value="reel">Reel</option><option value="video">Video</option>
        </select>
        <input type="number" class="cr-count border rounded-lg px-2 py-1 text-sm w-16" min="1" value="1" placeholder="#">
        <span class="text-xs text-gray-400">/ month</span>
        <button onclick="this.closest('.content-req-row').remove()" class="text-red-400 hover:text-red-600 text-sm"><i class="fa-solid fa-times"></i></button>
    </div>`;
}

function addContentReqRow() {
    const container = document.getElementById('content-req-rows');
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 flex-wrap content-req-row';
    div.innerHTML = `
        <select class="cr-platform border rounded-lg px-2 py-1 text-sm">
            <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="tiktok">TikTok</option><option value="x">X</option>
        </select>
        <select class="cr-type border rounded-lg px-2 py-1 text-sm">
            <option value="post">Post</option><option value="story">Story</option><option value="reel">Reel</option><option value="video">Video</option>
        </select>
        <input type="number" class="cr-count border rounded-lg px-2 py-1 text-sm w-16" min="1" value="1" placeholder="#">
        <span class="text-xs text-gray-400">/ month</span>
        <button onclick="this.closest('.content-req-row').remove()" class="text-red-400 hover:text-red-600 text-sm"><i class="fa-solid fa-times"></i></button>
    `;
    container.appendChild(div);
}

function collectContentRequirements() {
    const rows = document.querySelectorAll('.content-req-row');
    const reqs = [];
    rows.forEach(row => {
        const platform = row.querySelector('.cr-platform')?.value;
        const type = row.querySelector('.cr-type')?.value;
        const count = parseInt(row.querySelector('.cr-count')?.value) || 0;
        if (platform && type && count > 0) {
            reqs.push({ platform, type, count });
        }
    });
    return JSON.stringify(reqs);
}

async function addClient() {
    const data = {
        name: document.getElementById('client-name').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        company: document.getElementById('client-company').value.trim(),
        brief_text: document.getElementById('client-brief').value.trim(),
        content_requirements: collectContentRequirements()
    };
    if (!data.name) { alert('Enter account name'); return; }
    try {
        const res = await fetch(API_URL + '/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) { hideAddClientModal(); loadClients(); showToast('Account added', 'success'); } else { alert('Could not add account'); }
    } catch (e) { alert('Connection error'); }
}

async function deleteClient(id) {
    if (confirm('Delete this account and all associated data?')) {
        await fetch(API_URL + '/clients/' + id, { method: 'DELETE' });
        loadClients();
        showToast('Account deleted', 'success');
    }
}

function filterClientsTable() {
    const q = (document.getElementById('client-search')?.value || '').toLowerCase();
    document.querySelectorAll('#clients-table tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    // Also filter cards
    document.querySelectorAll('#client-cards > div').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
