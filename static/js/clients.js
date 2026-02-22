// Clients page JS
function pageInit() { loadClients(); }

async function loadClients() {
    try {
        const clients = await fetch(API_URL + '/clients').then(r => r.json());
        document.getElementById('clients-table').innerHTML = clients.map(c => `
            <tr class="border-t hover:bg-gray-50">
                <td class="px-6 py-4 font-semibold"><a href="/clients/${c.id}" class="text-indigo-600 hover:underline">${esc(c.name)}</a></td>
                <td class="px-6 py-4">${esc(c.company) || '-'}</td>
                <td class="px-6 py-4 hidden sm:table-cell">${esc(c.email) || '-'}</td>
                <td class="px-6 py-4">${c.accounts ? `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">${c.accounts.length}</span>` : '<span class="text-gray-400">0</span>'}</td>
                <td class="px-6 py-4">
                    <a href="/clients/${c.id}" class="text-indigo-600 mr-2"><i class="fa-solid fa-eye"></i></a>
                    <button onclick="deleteClient(${c.id})" class="text-red-600"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="text-center py-8 text-gray-500">No clients yet</td></tr>';
    } catch (e) { console.error('Error loading clients:', e); }
}

function showAddClientModal() { document.getElementById('add-client-modal').classList.remove('hidden'); }
function hideAddClientModal() { document.getElementById('add-client-modal').classList.add('hidden'); }

async function addClient() {
    const data = {
        name: document.getElementById('client-name').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        company: document.getElementById('client-company').value.trim()
    };
    if (!data.name) { alert('Enter client name'); return; }
    try {
        const res = await fetch(API_URL + '/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) { hideAddClientModal(); loadClients(); showToast('Client added', 'success'); } else { alert('Could not add client'); }
    } catch (e) { alert('Connection error'); }
}

async function deleteClient(id) {
    if (confirm('Delete this client and all associated data?')) {
        await fetch(API_URL + '/clients/' + id, { method: 'DELETE' });
        loadClients();
    }
}

function filterClientsTable() {
    const q = (document.getElementById('client-search')?.value || '').toLowerCase();
    document.querySelectorAll('#clients-table tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
