// Accounts (clients) page JS
function pageInit() {
    loadClients();
    // Add default requirement row
    addContentReqRow();
}

async function loadClients() {
    try {
        let clientsUrl = API_URL + '/clients';
        if (currentUser) clientsUrl += `?user_id=${currentUser.id}&role=${currentUser.role || ''}`;
        const clients = await fetch(clientsUrl).then(r => r.json());
        // Cards view
        const cardsEl = document.getElementById('client-cards');
        if (cardsEl) {
            cardsEl.innerHTML = clients.map(c => {
                const reqs = parseContentReqs(c.content_requirements);
                const reqSummary = reqs.length > 0
                    ? reqs.map(r => { const p = r.platforms || (r.platform ? [r.platform] : []); return `${r.count} ${r.type}/${p.join('+')}`; }).join(', ')
                    : 'No requirements set';
                return `<div class="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition cursor-pointer" onclick="window.location='/clients/${c.slug || c.id}'">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">${esc(c.name?.charAt(0) || '?')}</div>
                        <div>
                            <h3 class="font-semibold">${esc(c.name)}</h3>
                            <p class="text-xs text-gray-500">${esc(c.company) || 'No company'}</p>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mb-2 line-clamp-2">${c.brief_text ? esc(c.brief_text.substring(0, 100)) + (c.brief_text.length > 100 ? '...' : '') : (c.brief_file_url || c.brief_url) ? '<span class="italic text-gray-400"><i class="fa-solid fa-paperclip mr-1"></i>Brief attached</span>' : '<span class="italic">No brief</span>'}</p>
                    ${(c.brief_url || c.brief_file_url) ? `<div class="flex gap-2 mb-1">${c.brief_url ? '<span class="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded"><i class="fa-solid fa-link mr-0.5"></i>Link</span>' : ''}${c.brief_file_url ? '<span class="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded"><i class="fa-solid fa-file-pdf mr-0.5"></i>File</span>' : ''}</div>` : ''}
                    <p class="text-[11px] text-indigo-600">${esc(reqSummary)}</p>
                </div>`;
            }).join('') || '<div class="col-span-full text-center py-8 text-gray-500">No accounts yet. Click "Add Account" to get started.</div>';
        }
        // Table view
        document.getElementById('clients-table').innerHTML = clients.map(c => `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-4 sm:px-6 py-4 font-semibold"><a href="/clients/${c.slug || c.id}" class="text-indigo-600 hover:underline">${esc(c.name)}</a></td>
                <td class="px-4 sm:px-6 py-4">${esc(c.company) || '-'}</td>
                <td class="px-4 sm:px-6 py-4 hidden sm:table-cell text-sm text-gray-500">${c.brief_text ? esc(c.brief_text.substring(0, 60)) + (c.brief_text.length > 60 ? '...' : '') : (c.brief_file_url || c.brief_url) ? '<span class="italic text-gray-400"><i class="fa-solid fa-paperclip mr-1"></i>Attached</span>' : '-'}${c.brief_url ? ' <i class="fa-solid fa-link text-indigo-400 text-xs" title="Has link"></i>' : ''}${c.brief_file_url ? ' <i class="fa-solid fa-file-pdf text-indigo-400 text-xs" title="Has file"></i>' : ''}</td>
                <td class="px-4 sm:px-6 py-4">
                    <a href="/clients/${c.slug || c.id}" class="text-indigo-600 mr-2" title="View"><i class="fa-solid fa-eye"></i></a>
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

function showAddClientModal() {
    document.getElementById('add-client-modal').classList.remove('hidden');
    document.querySelectorAll('#content-req-rows .content-req-row').forEach(r => initReqPlatformToggles(r));
}
function hideAddClientModal() {
    document.getElementById('add-client-modal').classList.add('hidden');
    // Reset form
    document.getElementById('client-name').value = '';
    document.getElementById('client-company').value = '';
    document.getElementById('client-email').value = '';
    document.getElementById('client-brief').value = '';
    document.getElementById('client-brief-url').value = '';
    document.getElementById('client-brief-file').value = '';
    document.getElementById('client-brief-file-url').value = '';
    document.getElementById('client-brief-file-name').textContent = '';
    document.getElementById('content-req-rows').innerHTML = '';
    addContentReqRow();
}

function buildReqPlatformToggles(selected) {
    const list = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    const platforms = [
        { val: 'instagram', icon: 'fa-brands fa-instagram', label: 'IG' },
        { val: 'facebook', icon: 'fa-brands fa-facebook', label: 'FB' },
        { val: 'linkedin', icon: 'fa-brands fa-linkedin', label: 'LI' },
        { val: 'tiktok', icon: 'fa-brands fa-tiktok', label: 'TT' },
        { val: 'x', icon: 'fa-brands fa-x-twitter', label: 'X' },
    ];
    return platforms.map(p =>
        `<label class="cr-plat-toggle cursor-pointer select-none">
            <input type="checkbox" value="${p.val}" class="hidden cr-plat-cb" ${list.includes(p.val) ? 'checked' : ''}>
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition
                ${list.includes(p.val) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-500 border-gray-200'}">
                <i class="${p.icon}"></i>${p.label}
            </span>
        </label>`
    ).join('');
}

function initReqPlatformToggles(container) {
    container.querySelectorAll('.cr-plat-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            const span = this.nextElementSibling;
            if (this.checked) {
                span.className = span.className.replace('bg-gray-50 text-gray-500 border-gray-200', 'bg-indigo-600 text-white border-indigo-600');
            } else {
                span.className = span.className.replace('bg-indigo-600 text-white border-indigo-600', 'bg-gray-50 text-gray-500 border-gray-200');
            }
        });
    });
}

function buildReqRowHtml(selected, type, count) {
    return `
        <div class="flex flex-wrap gap-1 mb-1 cr-platforms">${buildReqPlatformToggles(selected)}</div>
        <div class="flex items-center gap-2">
            <select class="cr-type border rounded-lg px-2 py-1 text-sm">
                <option value="post" ${type==='post'?'selected':''}>Post</option>
                <option value="story" ${type==='story'?'selected':''}>Story</option>
                <option value="reel" ${type==='reel'?'selected':''}>Reel</option>
                <option value="video" ${type==='video'?'selected':''}>Video</option>
                <option value="carousel" ${type==='carousel'?'selected':''}>Carousel</option>
            </select>
            <input type="number" class="cr-count border rounded-lg px-2 py-1 text-sm w-16" min="1" value="${count||1}" placeholder="#">
            <span class="text-xs text-gray-400">/ month</span>
            <button onclick="this.closest('.content-req-row').remove()" class="text-red-400 hover:text-red-600 text-sm"><i class="fa-solid fa-times"></i></button>
        </div>
    `;
}

function getDefaultReqRow() {
    return `<div class="content-req-row border rounded-lg p-2 mb-2">${buildReqRowHtml([], '', 1)}</div>`;
}

function addContentReqRow() {
    const container = document.getElementById('content-req-rows');
    const div = document.createElement('div');
    div.className = 'content-req-row border rounded-lg p-2 mb-2';
    div.innerHTML = buildReqRowHtml([], '', 1);
    container.appendChild(div);
    initReqPlatformToggles(div);
}

function collectContentRequirements() {
    const rows = document.querySelectorAll('.content-req-row');
    const reqs = [];
    rows.forEach(row => {
        const platforms = Array.from(row.querySelectorAll('.cr-plat-cb:checked')).map(cb => cb.value);
        const type = row.querySelector('.cr-type')?.value;
        const count = parseInt(row.querySelector('.cr-count')?.value) || 0;
        if (platforms.length > 0 && type && count > 0) {
            reqs.push({ platforms, type, count });
        }
    });
    return JSON.stringify(reqs);
}

async function onBriefFileSelected(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    document.getElementById('client-brief-file-name').textContent = 'Uploading...';
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(API_URL + '/upload-brief-file', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.url) {
            document.getElementById('client-brief-file-url').value = data.url;
            document.getElementById('client-brief-file-name').textContent = data.filename || file.name;
        } else {
            document.getElementById('client-brief-file-name').textContent = 'Upload failed';
        }
    } catch (e) {
        document.getElementById('client-brief-file-name').textContent = 'Upload failed';
    }
}

async function addClient() {
    const data = {
        name: document.getElementById('client-name').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        company: document.getElementById('client-company').value.trim(),
        brief_text: document.getElementById('client-brief').value.trim(),
        brief_url: document.getElementById('client-brief-url').value.trim(),
        brief_file_url: document.getElementById('client-brief-file-url').value.trim(),
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
