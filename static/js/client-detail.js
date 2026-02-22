// Client detail page JS
let clientData = null;
let clientMonth = new Date();
let clientPostsData = [];

function pageInit() {
    loadClientDetail();
}

async function loadClientDetail() {
    clientData = await fetch(API_URL + '/clients/' + clientId).then(r => r.json());
    if (!clientData || clientData.error) { document.getElementById('client-title').textContent = 'Client Not Found'; return; }

    document.getElementById('client-title').innerHTML = `<i class="fa-solid fa-user text-indigo-600 mr-2"></i>${esc(clientData.name)}`;
    document.getElementById('cd-name').textContent = clientData.name || '-';
    document.getElementById('cd-company').textContent = clientData.company || '-';
    document.getElementById('cd-email').textContent = clientData.email || '-';
    document.getElementById('cd-accounts').textContent = (clientData.accounts || []).length;

    loadClientPipeline();
    loadClientAccounts();
    loadClientRules();
}

function showClientTab(tab) {
    ['pipeline', 'calendar', 'accounts', 'rules'].forEach(t => {
        document.getElementById('client-tab-' + t)?.classList.toggle('active', t === tab);
        document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
    });
    if (tab === 'calendar') loadClientCalendar();
    if (tab === 'pipeline') loadClientPipeline();
}

async function loadClientPipeline() {
    const board = await fetch(API_URL + '/pipeline?client_id=' + clientId).then(r => r.json());
    const container = document.getElementById('client-pipeline-board');
    const statuses = ['draft', 'in_design', 'design_review', 'approved', 'scheduled'];
    container.innerHTML = statuses.map(status => {
        const posts = board[status] || [];
        return `<div class="kanban-column">
            <div class="kanban-column-header"><span>${status.replace('_', ' ')}</span><span class="text-xs bg-gray-200 px-2 py-1 rounded-full">${posts.length}</span></div>
            <div class="kanban-cards">${posts.map(p => `
                <div class="kanban-card priority-${p.priority || 'normal'}">
                    <p class="font-semibold text-sm">${esc(p.topic || 'Untitled')}</p>
                    <div class="text-xs text-gray-400 mt-1">${getPlatformIcon(p.platforms)} ${esc(p.platforms || '')}</div>
                </div>
            `).join('') || '<p class="text-gray-400 text-xs text-center py-4">Empty</p>'}</div>
        </div>`;
    }).join('');
}

async function loadClientCalendar() {
    clientPostsData = await fetch(API_URL + '/all-posts?client_id=' + clientId).then(r => r.json());
    renderClientCalendar();
}

function renderClientCalendar() {
    const year = clientMonth.getFullYear();
    const month = clientMonth.getMonth();
    document.getElementById('client-calendar-month').textContent = clientMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="bg-gray-50 rounded p-1 min-h-[60px]"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const posts = clientPostsData.filter(p => p.scheduled_at?.startsWith(dateStr) || p.created_at?.startsWith(dateStr));
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        html += `<div class="bg-white border rounded p-1 min-h-[60px] ${isToday ? 'ring-2 ring-indigo-500' : ''}">
            <div class="font-semibold text-xs ${isToday ? 'text-indigo-600' : ''}">${day}</div>
            ${posts.slice(0, 2).map(p => `<div class="text-[10px] mt-0.5 px-1 py-0.5 rounded ${getPlatformBgClass(p.platforms)} truncate">${getPlatformIcon(p.platforms)}</div>`).join('')}
            ${posts.length > 2 ? `<div class="text-[10px] text-indigo-600 font-semibold text-center">+${posts.length - 2}</div>` : ''}
        </div>`;
    }
    document.getElementById('client-calendar-grid').innerHTML = html;
}

function changeClientMonth(delta) { clientMonth.setMonth(clientMonth.getMonth() + delta); renderClientCalendar(); }

function loadClientAccounts() {
    const container = document.getElementById('client-accounts-list');
    if (!clientData?.accounts?.length) { container.innerHTML = '<p class="text-gray-500">No linked accounts</p>'; return; }
    container.innerHTML = clientData.accounts.map(a => `
        <div class="flex justify-between items-center p-3 rounded-lg ${getPlatformBgClass(a.platform)}">
            <span>${getPlatformIcon(a.platform)} ${esc(a.platform)} ${a.account_name ? '- ' + esc(a.account_name) : ''}</span>
            <button onclick="deleteAccount(${a.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

async function deleteAccount(accountId) {
    if (!confirm('Unlink this account?')) return;
    await fetch(API_URL + '/accounts/' + accountId, { method: 'DELETE' });
    loadClientDetail();
}

async function loadClientRules() {
    const rules = await fetch(API_URL + '/clients/' + clientId + '/posting-rules').then(r => r.json());
    const container = document.getElementById('client-rules-content');
    if (!rules || rules.length === 0) { container.innerHTML = '<p class="text-gray-500 mb-4">No posting rules configured</p>'; }
    else {
        container.innerHTML = rules.map(r => `
            <div class="bg-white border rounded-lg p-4 mb-3">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-semibold">${getPlatformIcon(r.platform)} ${esc(r.platform)}</span>
                    <button onclick="deletePostingRule(${r.id})" class="text-red-500 text-sm"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="text-sm text-gray-600">
                    <p>Days: ${(r.posting_days || []).map(d => `<span class="day-badge active">${d}</span>`).join(' ')}</p>
                    <p class="mt-1">Hours: ${(r.posting_hours || []).join(', ')}</p>
                    <p class="mt-1">Posts/day: ${r.posts_per_day || 1}</p>
                </div>
            </div>
        `).join('');
    }
    // Add rule form
    container.innerHTML += `
        <div class="bg-gray-50 rounded-lg p-4 mt-4">
            <h4 class="font-semibold text-sm mb-3">Add Posting Rule</h4>
            <div class="grid grid-cols-2 gap-3 mb-3">
                <select id="rule-platform" class="border rounded-lg px-3 py-2 text-sm"><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option></select>
                <input type="number" id="rule-posts-per-day" class="border rounded-lg px-3 py-2 text-sm" value="1" min="1" max="5" placeholder="Posts/day">
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Posting Days</label>
                <div class="flex flex-wrap gap-1" id="rule-days">
                    ${['sun','mon','tue','wed','thu','fri','sat'].map(d => `<label class="day-badge inactive cursor-pointer"><input type="checkbox" value="${d}" class="hidden" onchange="this.parentElement.className=this.checked?'day-badge active cursor-pointer':'day-badge inactive cursor-pointer'"> ${d}</label>`).join('')}
                </div>
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Posting Hours</label>
                <div id="rule-hours" class="flex flex-wrap gap-2"><input type="time" class="border rounded px-2 py-1 text-sm" value="10:00"></div>
                <button onclick="addRuleHourInput()" class="text-indigo-600 text-xs mt-1"><i class="fa-solid fa-plus"></i> Add hour</button>
            </div>
            <button onclick="submitPostingRule()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Save Rule</button>
        </div>
    `;
}

function addRuleHourInput() {
    const container = document.getElementById('rule-hours');
    const input = document.createElement('input');
    input.type = 'time'; input.className = 'border rounded px-2 py-1 text-sm'; input.value = '14:00';
    container.appendChild(input);
}

async function submitPostingRule() {
    const platform = document.getElementById('rule-platform').value;
    const postsPerDay = parseInt(document.getElementById('rule-posts-per-day').value) || 1;
    const days = Array.from(document.querySelectorAll('#rule-days input:checked')).map(c => c.value);
    const hours = Array.from(document.querySelectorAll('#rule-hours input')).map(i => i.value).filter(Boolean);
    if (!days.length) { alert('Select at least one day'); return; }
    if (!hours.length) { alert('Add at least one hour'); return; }
    await fetch(API_URL + '/clients/' + clientId + '/posting-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, posting_days: days, posting_hours: hours, posts_per_day: postsPerDay })
    });
    loadClientRules();
    showToast('Rule added', 'success');
}

async function deletePostingRule(ruleId) {
    if (!confirm('Delete this rule?')) return;
    await fetch(API_URL + '/posting-rules/' + ruleId, { method: 'DELETE' });
    loadClientRules();
}

function showAddAccountModal() { document.getElementById('add-account-modal').classList.remove('hidden'); }
function hideAddAccountModal() { document.getElementById('add-account-modal').classList.add('hidden'); }

function updateAccountFields() {
    const p = document.getElementById('account-platform').value;
    const helpText = { instagram: 'Instagram: Access Token + Account ID from Graph API', linkedin: 'LinkedIn: Access Token only', facebook: 'Facebook: Page Access Token + Page ID' };
    document.getElementById('platform-help').textContent = helpText[p] || 'Select a platform first';
    document.getElementById('account-id-field').style.display = p === 'linkedin' ? 'none' : 'block';
}

async function saveAccount() {
    const data = { platform: document.getElementById('account-platform').value, account_name: document.getElementById('account-name').value, access_token: document.getElementById('account-token').value, account_id: document.getElementById('account-id').value };
    if (!data.platform || !data.access_token) { alert('Platform and token required'); return; }
    await fetch(API_URL + '/clients/' + clientId + '/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    hideAddAccountModal();
    loadClientDetail();
    showToast('Account linked', 'success');
}
