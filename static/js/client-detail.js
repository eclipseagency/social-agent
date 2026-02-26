// Client detail page JS
let clientData = null;
let clientMonth = new Date();
let clientPostsData = [];
let clientCalByDate = {};
let clientDetailPost = null;
let clientDraggedPostId = null;
let clientStatusFilter = '';
let presMonth = new Date();
let presPosts = [];
let presCurrentIndex = 0;
let presIsFullscreen = false;

function pageInit() {
    loadClientDetail();
    loadClientAssignmentDropdowns();
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

// ========== CLIENT ASSIGNMENTS ==========

async function loadClientAssignmentDropdowns() {
    const users = await apiFetch(API_URL + '/users') || [];
    const managers = users.filter(u => ['manager', 'admin'].includes(u.role));
    const writers = users.filter(u => ['copywriter', 'admin'].includes(u.role));
    const designers = users.filter(u => ['designer', 'admin'].includes(u.role));
    const sms = users.filter(u => ['sm_specialist', 'admin'].includes(u.role));
    const motions = users.filter(u => ['motion_editor', 'admin'].includes(u.role));

    function fillSel(id, list) {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- None --</option>' + list.map(u =>
            `<option value="${u.id}">${esc(u.username)}</option>`
        ).join('');
    }
    fillSel('ca-manager', managers);
    fillSel('ca-writer', writers);
    fillSel('ca-designer', designers);
    fillSel('ca-sm', sms);
    fillSel('ca-motion', motions);

    // Wait for clientData to be loaded, then set values
    await waitForClientData();
    if (clientData) {
        if (document.getElementById('ca-manager')) document.getElementById('ca-manager').value = clientData.assigned_manager_id || '';
        document.getElementById('ca-writer').value = clientData.assigned_writer_id || '';
        document.getElementById('ca-designer').value = clientData.assigned_designer_id || '';
        document.getElementById('ca-sm').value = clientData.assigned_sm_id || '';
        document.getElementById('ca-motion').value = clientData.assigned_motion_id || '';
    }
}

function waitForClientData() {
    return new Promise(resolve => {
        if (clientData) return resolve();
        const check = setInterval(() => { if (clientData) { clearInterval(check); resolve(); } }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });
}

async function saveClientAssignments() {
    const data = {
        assigned_manager_id: document.getElementById('ca-manager')?.value || null,
        assigned_writer_id: document.getElementById('ca-writer')?.value || null,
        assigned_designer_id: document.getElementById('ca-designer')?.value || null,
        assigned_sm_id: document.getElementById('ca-sm')?.value || null,
        assigned_motion_id: document.getElementById('ca-motion')?.value || null,
    };
    const res = await apiFetch(API_URL + '/clients/' + clientId, { method: 'PUT', body: data });
    if (res && res.success) {
        showToast('Team assignments saved', 'success');
        // Update local clientData
        Object.assign(clientData, data);
    } else {
        showToast('Failed to save assignments', 'error');
    }
}

function showClientTab(tab) {
    ['pipeline', 'calendar', 'accounts', 'rules', 'presentation'].forEach(t => {
        document.getElementById('client-tab-' + t)?.classList.toggle('active', t === tab);
        document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
    });
    if (tab === 'calendar') loadClientCalendar();
    if (tab === 'pipeline') loadClientPipeline();
    if (tab === 'presentation') loadPresentation();
}

const PIPELINE_LABELS = {
    'draft': { label: 'Draft', icon: 'fa-file-pen', color: 'text-gray-400', badge: 'bg-gray-200' },
    'in_design': { label: 'In Design', icon: 'fa-paintbrush', color: 'text-pink-500', badge: 'bg-pink-200' },
    'design_review': { label: 'Design Review', icon: 'fa-magnifying-glass', color: 'text-purple-500', badge: 'bg-purple-200' },
    'approved': { label: 'Approved', icon: 'fa-circle-check', color: 'text-green-500', badge: 'bg-green-200' },
    'scheduled': { label: 'Scheduled', icon: 'fa-clock', color: 'text-blue-500', badge: 'bg-blue-200' },
};

async function loadClientPipeline() {
    const board = await fetch(API_URL + '/pipeline?client_id=' + clientId).then(r => r.json());
    const container = document.getElementById('client-pipeline-board');
    const statuses = ['draft', 'in_design', 'design_review', 'approved', 'scheduled'];
    container.innerHTML = statuses.map(status => {
        const posts = board[status] || [];
        const lbl = PIPELINE_LABELS[status] || { label: status, icon: 'fa-circle', color: '', badge: 'bg-gray-200' };
        return `<div class="kanban-column">
            <div class="kanban-column-header">
                <span><i class="fa-solid ${lbl.icon} ${lbl.color} mr-1"></i>${lbl.label}</span>
                <span class="text-xs ${lbl.badge} px-2 py-1 rounded-full">${posts.length}</span>
            </div>
            <div class="kanban-cards">${posts.map(p => `
                <div class="kanban-card priority-${p.priority || 'normal'}" onclick="openClientPostDetail(${p.id})">
                    <p class="font-semibold text-sm">${esc(p.topic || 'Untitled')}</p>
                    <div class="text-xs text-gray-400 mt-1">${getPlatformIcon(p.platforms)} ${esc(p.platforms || '')}</div>
                </div>
            `).join('') || '<p class="text-gray-400 text-xs text-center py-4">Empty</p>'}</div>
        </div>`;
    }).join('');
}

// ========== CLIENT CALENDAR (RICH) ==========

async function loadClientCalendar() {
    const year = clientMonth.getFullYear();
    const month = clientMonth.getMonth() + 1;
    const data = await apiFetch(`${API_URL}/posts/calendar?year=${year}&month=${month}&client_id=${clientId}&include_unscheduled=1`);
    if (!data) return;
    clientPostsData = data.posts || [];
    clientCalByDate = data.by_date || {};
    renderClientCalendar();
}

function getClientDayPosts(dateStr) {
    if (clientCalByDate[dateStr]) return clientCalByDate[dateStr];
    return clientPostsData.filter(p => {
        const sa = (p.scheduled_at || '').substring(0, 10);
        const ca = (p.created_at || '').substring(0, 10);
        return sa === dateStr || (!sa && ca === dateStr);
    });
}

function filterClientByStatus(posts) {
    if (!clientStatusFilter) return posts;
    return posts.filter(p => getPostStatus(p) === clientStatusFilter);
}

function applyClientStatusFilter() {
    clientStatusFilter = document.getElementById('client-cal-status-filter')?.value || '';
    renderClientCalendar();
}

function renderClientCalendar() {
    const year = clientMonth.getFullYear();
    const month = clientMonth.getMonth();
    document.getElementById('client-calendar-month').textContent = clientMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="bg-gray-50 rounded p-1 min-h-[80px]"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayPosts = getClientDayPosts(dateStr);
        const filtered = filterClientByStatus(dayPosts);
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

        html += `<div class="bg-white border rounded-lg p-1 cal-day-cell ${isToday ? 'ring-2 ring-indigo-500' : ''}"
                      data-date="${dateStr}"
                      ondragover="onClientDayDragOver(event)" ondragleave="onClientDayDragLeave(event)" ondrop="onClientDayDrop(event, '${dateStr}')">
            <div class="flex justify-between items-center mb-1">
                <span class="font-semibold text-xs ${isToday ? 'text-indigo-600' : ''}">${day}</span>
                ${dayPosts.length > 0 ? `<span class="text-[10px] text-gray-400">${dayPosts.length}</span>` : ''}
            </div>
            ${filtered.slice(0, 3).map(p => renderCalendarMiniCard(p)).join('')}
            ${filtered.length > 3 ? `<div class="text-[10px] text-indigo-600 font-semibold text-center cursor-pointer" onclick="showClientDayPosts('${dateStr}', ${day})">+${filtered.length - 3} more</div>` : ''}
        </div>`;
    }
    document.getElementById('client-calendar-grid').innerHTML = html;
}

function changeClientMonth(delta) {
    clientMonth.setMonth(clientMonth.getMonth() + delta);
    loadClientCalendar();
}

// ========== CLIENT CALENDAR DRAG & DROP ==========

function onClientDayDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = clientDraggedPostId ? 'move' : 'copy';
    e.currentTarget.classList.add('drag-over');
}

function onClientDayDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function onClientDayDrop(e, dateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleClientFileDrop(e.dataTransfer.files, dateStr);
        return;
    }

    if (clientDraggedPostId) {
        const postId = clientDraggedPostId;
        clientDraggedPostId = null;
        const res = await apiFetch(`${API_URL}/posts/${postId}/reschedule`, {
            method: 'PUT',
            body: { scheduled_at: dateStr + 'T12:00:00' }
        });
        if (res && res.success) {
            showToast('Post rescheduled', 'success');
            loadClientCalendar();
        }
    }
}

async function handleClientFileDrop(files, dateStr) {
    const dayPosts = getClientDayPosts(dateStr);
    const designPosts = dayPosts.filter(p => (p.workflow_status || '') === 'in_design');
    if (designPosts.length === 0) {
        showToast('No posts in "In Design" status on this day', 'error');
        return;
    }
    await uploadClientDesignFiles(designPosts[0].id, files);
}

async function uploadClientDesignFiles(postId, files) {
    const formData = new FormData();
    for (const file of files) formData.append('images', file);
    if (currentUser) formData.append('user_id', currentUser.id);
    showToast('Uploading designs...', 'info');
    const res = await apiFetch(`${API_URL}/posts/${postId}/upload-design`, { method: 'POST', body: formData });
    if (res && res.success) {
        showToast(`${res.urls?.length || 0} design(s) uploaded`, 'success');
        loadClientCalendar();
        if (clientDetailPost && clientDetailPost.id === postId) openClientPostDetail(postId);
    }
}

// Override onCardDragStart for client page context
// The shared renderCalendarMiniCard uses onCardDragStart, so we need it defined here too
if (typeof onCardDragStart === 'undefined') {
    window.onCardDragStart = function(e, postId) {
        clientDraggedPostId = postId;
        e.dataTransfer.setData('text/plain', postId);
        e.dataTransfer.effectAllowed = 'move';
    };
}

// ========== CLIENT DAY POSTS MODAL ==========

function showClientDayPosts(dateStr, day) {
    const posts = filterClientByStatus(getClientDayPosts(dateStr));
    document.getElementById('client-day-posts-title').textContent = `Posts for ${dateStr}`;
    if (posts.length === 0) {
        document.getElementById('client-day-posts-list').innerHTML = '<p class="text-gray-500 text-center py-8">No posts</p>';
    } else {
        document.getElementById('client-day-posts-list').innerHTML = posts.map(p => {
            const status = getPostStatus(p);
            const color = getStatusColor(status);
            return `<div class="border-l-4 rounded-xl p-4 hover:shadow-md transition cursor-pointer bg-white" style="border-left-color:${color}" onclick="openClientPostDetail(${p.id}); hideClientDayPostsModal();">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        ${getPlatformIcon(p.platforms)} ${getContentTypeIcon(p.post_type)}
                        <div><p class="font-semibold text-sm">${esc(p.topic || 'Untitled')}</p></div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${status}</span>
                </div>
                <p class="text-sm text-gray-600 line-clamp-2">${esc(p.caption || 'No caption yet')}</p>
                <div class="text-xs text-gray-400 mt-2"><i class="fa-regular fa-clock mr-1"></i>${(p.scheduled_at || p.created_at || '').replace('T', ' ')}</div>
            </div>`;
        }).join('');
    }
    document.getElementById('client-day-posts-modal').classList.remove('hidden');
}

function hideClientDayPostsModal() { document.getElementById('client-day-posts-modal').classList.add('hidden'); }

// ========== CLIENT POST DETAIL MODAL ==========

async function openClientPostDetail(postId) {
    const post = await apiFetch(`${API_URL}/posts/${postId}`);
    if (!post || post.error) return;
    clientDetailPost = post;

    const status = getPostStatus(post);
    const color = getStatusColor(status);
    const wf = post.workflow_status || 'draft';

    document.getElementById('client-detail-title').textContent = post.topic || 'Untitled Post';

    document.getElementById('client-detail-meta').innerHTML = `
        <span class="px-3 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${status}</span>
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${getPlatformBgClass(post.platforms)}">${getPlatformIcon(post.platforms)} ${esc(post.platforms || '')}</span>
        ${post.post_type ? `<span class="px-3 py-1 rounded-full text-xs bg-gray-100 font-semibold">${getContentTypeIcon(post.post_type)} ${esc(post.post_type)}</span>` : ''}
        ${post.priority && post.priority !== 'normal' ? `<span class="px-3 py-1 rounded-full text-xs font-semibold badge-${post.priority}">${esc(post.priority)}</span>` : ''}
    `;

    // Topic
    const topicSection = document.getElementById('client-detail-topic-section');
    if (post.topic) { document.getElementById('client-detail-topic').textContent = post.topic; topicSection.style.display = ''; }
    else topicSection.style.display = 'none';

    // Notes
    const notesSection = document.getElementById('client-detail-notes-section');
    if (post.brief_notes) { document.getElementById('client-detail-notes').textContent = post.brief_notes; notesSection.style.display = ''; }
    else notesSection.style.display = 'none';

    // References — larger gallery cards
    const refsSection = document.getElementById('client-detail-references-section');
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    if (refUrls.length) {
        document.getElementById('client-detail-references').innerHTML = `<div class="ref-gallery">${refUrls.map(u => {
            const url = u.trim();
            const filename = url.split('/').pop().split('?')[0];
            return `<div class="ref-gallery-item">
                <img src="${url}" alt="Reference" onclick="window.open('${url}','_blank')">
                <div class="ref-gallery-overlay"><span class="ref-gallery-name">${esc(filename.length > 20 ? filename.substring(0, 17) + '...' : filename)}</span></div>
            </div>`;
        }).join('')}</div>`;
        refsSection.style.display = '';
    } else refsSection.style.display = 'none';

    // Design outputs
    const designUrls = (post.design_output_urls || '').split(',').filter(u => u.trim());
    document.getElementById('client-detail-designs').innerHTML = designUrls.length
        ? designUrls.map(u => `<img src="${u.trim()}" alt="Design" onclick="window.open('${u.trim()}','_blank')">`).join('')
        : '<p class="text-gray-400 text-sm">No designs uploaded yet</p>';

    // Caption — editable for roles with editCaption permission
    const captionTextarea = document.getElementById('client-detail-caption');
    const captionSaveBtn = document.getElementById('client-detail-caption-save-btn');
    const canEditCap = canDo('editCaption') && !['approved', 'scheduled', 'posted'].includes(wf);
    captionTextarea.value = post.caption || '';
    captionTextarea.readOnly = !canEditCap;
    captionTextarea.style.opacity = canEditCap ? '1' : '0.7';
    if (captionSaveBtn) captionSaveBtn.style.display = canEditCap ? '' : 'none';

    // Tone of Voice
    const tovSection = document.getElementById('client-detail-tov-section');
    if (post.tov) { document.getElementById('client-detail-tov').textContent = post.tov; tovSection.style.display = ''; }
    else tovSection.style.display = 'none';

    // Assignments (read-only, inherited from client)
    const assignments = [];
    if (post.assigned_manager_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-user-tie text-green-500 mr-1"></i> Manager: <strong>${esc(post.assigned_manager_name)}</strong></span>`);
    if (post.assigned_writer_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-pen-nib text-yellow-500 mr-1"></i> Copywriter: <strong>${esc(post.assigned_writer_name)}</strong></span>`);
    if (post.assigned_designer_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-paintbrush text-purple-500 mr-1"></i> Designer: <strong>${esc(post.assigned_designer_name)}</strong></span>`);
    if (post.assigned_sm_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-bullhorn text-blue-500 mr-1"></i> SM Specialist: <strong>${esc(post.assigned_sm_name)}</strong></span>`);
    if (post.assigned_motion_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-film text-red-500 mr-1"></i> Motion Editor: <strong>${esc(post.assigned_motion_name)}</strong></span>`);
    const assignSection = document.getElementById('client-detail-assignments-section');
    if (assignments.length) { document.getElementById('client-detail-assignments').innerHTML = assignments.join(''); assignSection.style.display = ''; }
    else assignSection.style.display = 'none';

    // Actions — role-based
    const actions = [];
    if (wf === 'draft' && (canDo('createPost') || canDo('editCaption'))) {
        actions.push(`<button onclick="clientTransitionPost(${post.id}, 'in_design')" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fa-solid fa-paper-plane mr-1"></i> Send to Designer</button>`);
    }
    if (wf === 'in_design' && canDo('uploadDesign')) {
        actions.push(`<button onclick="document.getElementById('client-detail-design-input').click()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700"><i class="fa-solid fa-upload mr-1"></i> Upload Design</button>`);
        actions.push(`<button onclick="clientTransitionPost(${post.id}, 'design_review')" class="bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-700"><i class="fa-solid fa-eye mr-1"></i> Submit for Review</button>`);
    }
    if (wf === 'design_review' && canDo('approve')) {
        actions.push(`<button onclick="clientTransitionPost(${post.id}, 'approved')" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"><i class="fa-solid fa-check mr-1"></i> Approve</button>`);
        actions.push(`<button onclick="clientReturnToDesign(${post.id})" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fa-solid fa-rotate-left mr-1"></i> Return to Designer</button>`);
        actions.push(`<button onclick="clientReturnToCopywriter(${post.id})" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-pen-nib mr-1"></i> Return to Copywriter</button>`);
    }
    if (wf === 'approved' && canDo('schedule')) {
        actions.push(`<button onclick="clientSchedulePost(${post.id})" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><i class="fa-solid fa-calendar-check mr-1"></i> Schedule Post</button>`);
    }
    document.getElementById('client-detail-actions').innerHTML = actions.join('');

    document.getElementById('client-post-detail-modal').classList.remove('hidden');
}

function closeClientPostDetail() {
    document.getElementById('client-post-detail-modal').classList.add('hidden');
    clientDetailPost = null;
    // If presentation tab is active, refresh data while preserving slide index
    if (document.getElementById('client-tab-presentation')?.classList.contains('active')) {
        const savedIndex = presCurrentIndex;
        loadPresentation().then(() => {
            presCurrentIndex = Math.min(savedIndex, presPosts.length - 1);
            if (presPosts.length > 0) renderPresSlide();
        });
    }
}

// ========== CLIENT CAPTION SAVE ==========

async function saveClientCaption() {
    if (!clientDetailPost) return;
    const caption = document.getElementById('client-detail-caption').value;
    const res = await apiFetch(`${API_URL}/posts/${clientDetailPost.id}`, { method: 'PUT', body: { caption } });
    if (res && res.success) {
        showToast('Caption saved', 'success');
        clientDetailPost.caption = caption;
        loadClientCalendar();
    }
}

// ========== CLIENT DESIGN UPLOAD FROM DETAIL ==========

function handleClientDetailDesignDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    if (clientDetailPost && e.dataTransfer.files.length > 0) {
        uploadClientDesignFiles(clientDetailPost.id, e.dataTransfer.files);
    }
}

function uploadClientDetailDesign(files) {
    if (clientDetailPost && files.length > 0) {
        uploadClientDesignFiles(clientDetailPost.id, files);
    }
}

// ========== CLIENT WORKFLOW TRANSITIONS ==========

async function clientTransitionPost(postId, newStatus) {
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: newStatus, user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast(`Status changed to ${newStatus.replace('_', ' ')}`, 'success');
        loadClientCalendar();
        openClientPostDetail(postId);
    }
}

async function clientReturnToDesign(postId) {
    const comment = prompt('Feedback for designer (required):');
    if (!comment) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'in_design', user_id: currentUser?.id || 1, comment }
    });
    if (res && res.success) {
        showToast('Returned to designer', 'success');
        loadClientCalendar();
        openClientPostDetail(postId);
    }
}

async function clientReturnToCopywriter(postId) {
    const comment = prompt('Feedback for copywriter (required):');
    if (!comment) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'draft', user_id: currentUser?.id || 1, comment }
    });
    if (res && res.success) {
        showToast('Returned to copywriter', 'success');
        loadClientCalendar();
        openClientPostDetail(postId);
    }
}

async function clientSchedulePost(postId) {
    const dt = prompt('Schedule date/time (YYYY-MM-DDTHH:MM):');
    if (!dt) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'scheduled', user_id: currentUser?.id || 1, scheduled_at: dt }
    });
    if (res && res.success) {
        showToast('Post scheduled', 'success');
        loadClientCalendar();
        openClientPostDetail(postId);
    }
}

// ========== EXISTING FUNCTIONALITY (accounts, rules, etc.) ==========

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

    const typeIcons = { post: '📷', story: '📱', video: '🎬', reel: '🎞' };
    const dayLabels = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

    function formatDayCode(d) {
        if (d.includes('_')) {
            const [base, spec] = d.split('_');
            const label = dayLabels[base] || base;
            if (spec === 'last') return label + ' (last)';
            return label + ' (' + spec + getSuffix(spec) + ')';
        }
        return dayLabels[d] || d;
    }
    function getSuffix(n) { n = parseInt(n); if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; }

    if (!rules || rules.length === 0) {
        container.innerHTML = '<p class="text-gray-500 mb-4">No posting rules configured</p>';
    } else {
        container.innerHTML = rules.map(r => `
            <div class="bg-white border rounded-lg p-4 mb-3">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold">${getPlatformIcon(r.platform)} ${esc(r.platform)}</span>
                        <span class="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100">${typeIcons[r.content_type] || '📷'} ${esc(r.content_type || 'post')}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="editPostingRule(${r.id})" class="text-indigo-500 text-sm" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deletePostingRule(${r.id})" class="text-red-500 text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="text-sm text-gray-600">
                    <p>Days: ${(r.posting_days || []).map(d => `<span class="day-badge active">${formatDayCode(d)}</span>`).join(' ')}</p>
                    <p class="mt-1">Hours: ${(r.posting_hours || []).join(', ')}</p>
                    ${r.notes ? `<p class="mt-1 text-xs text-gray-500 italic"><i class="fa-solid fa-note-sticky text-yellow-500 mr-1"></i>${esc(r.notes)}</p>` : ''}
                </div>
            </div>
        `).join('');
    }

    // Add/Edit form
    container.innerHTML += `
        <div class="bg-gray-50 rounded-lg p-4 mt-4" id="rule-form-container">
            <h4 class="font-semibold text-sm mb-3" id="rule-form-title">Add Posting Rule</h4>
            <input type="hidden" id="rule-edit-id" value="">
            <div class="grid grid-cols-3 gap-3 mb-3">
                <select id="rule-platform" class="border rounded-lg px-3 py-2 text-sm"><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="x">X (Twitter)</option></select>
                <select id="rule-content-type" class="border rounded-lg px-3 py-2 text-sm"><option value="post">📷 Post</option><option value="story">📱 Story</option><option value="video">🎬 Video</option><option value="reel">🎞 Reel</option></select>
                <input type="number" id="rule-posts-per-day" class="border rounded-lg px-3 py-2 text-sm" value="1" min="1" max="5" placeholder="Posts/day">
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Posting Days <span class="text-gray-400">(click for every week, or use specific week selector below)</span></label>
                <div class="flex flex-wrap gap-1" id="rule-days">
                    ${['sun','mon','tue','wed','thu','fri','sat'].map(d => `<label class="day-badge inactive cursor-pointer"><input type="checkbox" value="${d}" class="hidden" onchange="this.parentElement.className=this.checked?'day-badge active cursor-pointer':'day-badge inactive cursor-pointer'"> ${dayLabels[d]}</label>`).join('')}
                </div>
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Specific Week Rules <span class="text-gray-400">(e.g. 2nd Friday only)</span></label>
                <div id="rule-week-specific" class="space-y-1"></div>
                <button onclick="addWeekSpecificRow()" class="text-indigo-600 text-xs mt-1"><i class="fa-solid fa-plus"></i> Add week-specific day</button>
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Posting Hours</label>
                <div id="rule-hours" class="flex flex-wrap gap-2"><input type="time" class="border rounded px-2 py-1 text-sm" value="12:00"></div>
                <button onclick="addRuleHourInput()" class="text-indigo-600 text-xs mt-1"><i class="fa-solid fa-plus"></i> Add hour</button>
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium mb-1">Notes</label>
                <input type="text" id="rule-notes" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 2 videos per month on specific weeks">
            </div>
            <div class="flex gap-2">
                <button onclick="submitPostingRule()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm" id="rule-submit-btn">Save Rule</button>
                <button onclick="resetRuleForm()" class="bg-gray-200 px-4 py-2 rounded-lg text-sm hidden" id="rule-cancel-btn">Cancel</button>
            </div>
        </div>
    `;
}

function addRuleHourInput() {
    const container = document.getElementById('rule-hours');
    const input = document.createElement('input');
    input.type = 'time'; input.className = 'border rounded px-2 py-1 text-sm'; input.value = '14:00';
    container.appendChild(input);
}

function addWeekSpecificRow(day, week) {
    const container = document.getElementById('rule-week-specific');
    const dayLabels = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = `
        <select class="border rounded px-2 py-1 text-sm ws-day">
            ${['sun','mon','tue','wed','thu','fri','sat'].map(d => `<option value="${d}" ${d===day?'selected':''}>${dayLabels[d]}</option>`).join('')}
        </select>
        <select class="border rounded px-2 py-1 text-sm ws-week">
            <option value="1" ${week==='1'?'selected':''}>1st week</option>
            <option value="2" ${week==='2'?'selected':''}>2nd week</option>
            <option value="3" ${week==='3'?'selected':''}>3rd week</option>
            <option value="4" ${week==='4'?'selected':''}>4th week</option>
            <option value="last" ${week==='last'?'selected':''}>Last week</option>
        </select>
        <button onclick="this.parentElement.remove()" class="text-red-500 text-sm"><i class="fa-solid fa-times"></i></button>
    `;
    container.appendChild(row);
}

function resetRuleForm() {
    document.getElementById('rule-edit-id').value = '';
    document.getElementById('rule-form-title').textContent = 'Add Posting Rule';
    document.getElementById('rule-platform').value = 'instagram';
    document.getElementById('rule-content-type').value = 'post';
    document.getElementById('rule-posts-per-day').value = '1';
    document.getElementById('rule-notes').value = '';
    document.querySelectorAll('#rule-days input').forEach(c => { c.checked = false; c.parentElement.className = 'day-badge inactive cursor-pointer'; });
    document.getElementById('rule-week-specific').innerHTML = '';
    document.getElementById('rule-hours').innerHTML = '<input type="time" class="border rounded px-2 py-1 text-sm" value="12:00">';
    document.getElementById('rule-cancel-btn').classList.add('hidden');
    document.getElementById('rule-submit-btn').textContent = 'Save Rule';
}

async function editPostingRule(ruleId) {
    // Fetch all rules and find the one to edit
    const rules = await fetch(API_URL + '/clients/' + clientId + '/posting-rules').then(r => r.json());
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    document.getElementById('rule-edit-id').value = ruleId;
    document.getElementById('rule-form-title').textContent = 'Edit Posting Rule';
    document.getElementById('rule-platform').value = rule.platform || 'instagram';
    document.getElementById('rule-content-type').value = rule.content_type || 'post';
    document.getElementById('rule-posts-per-day').value = rule.posts_per_day || 1;
    document.getElementById('rule-notes').value = rule.notes || '';
    document.getElementById('rule-cancel-btn').classList.remove('hidden');
    document.getElementById('rule-submit-btn').textContent = 'Update Rule';

    // Set days: separate regular days vs week-specific
    const days = rule.posting_days || [];
    document.querySelectorAll('#rule-days input').forEach(c => { c.checked = false; c.parentElement.className = 'day-badge inactive cursor-pointer'; });
    document.getElementById('rule-week-specific').innerHTML = '';

    days.forEach(d => {
        if (d.includes('_')) {
            const [base, spec] = d.split('_');
            addWeekSpecificRow(base, spec);
        } else {
            const cb = document.querySelector(`#rule-days input[value="${d}"]`);
            if (cb) { cb.checked = true; cb.parentElement.className = 'day-badge active cursor-pointer'; }
        }
    });

    // Set hours
    const hours = rule.posting_hours || ['12:00'];
    document.getElementById('rule-hours').innerHTML = hours.map(h => `<input type="time" class="border rounded px-2 py-1 text-sm" value="${h}">`).join('');

    // Scroll to form
    document.getElementById('rule-form-container').scrollIntoView({ behavior: 'smooth' });
}

async function submitPostingRule() {
    const editId = document.getElementById('rule-edit-id').value;
    const platform = document.getElementById('rule-platform').value;
    const contentType = document.getElementById('rule-content-type').value;
    const postsPerDay = parseInt(document.getElementById('rule-posts-per-day').value) || 1;
    const notes = document.getElementById('rule-notes').value.trim();

    // Collect regular days
    const regularDays = Array.from(document.querySelectorAll('#rule-days input:checked')).map(c => c.value);
    // Collect week-specific days
    const wsRows = document.querySelectorAll('#rule-week-specific > div');
    const weekDays = Array.from(wsRows).map(row => {
        const day = row.querySelector('.ws-day').value;
        const week = row.querySelector('.ws-week').value;
        return day + '_' + week;
    });
    const allDays = [...regularDays, ...weekDays];

    const hours = Array.from(document.querySelectorAll('#rule-hours input')).map(i => i.value).filter(Boolean);
    if (!allDays.length) { alert('Select at least one day'); return; }
    if (!hours.length) { alert('Add at least one hour'); return; }

    if (editId) {
        // Update existing rule
        await fetch(API_URL + '/posting-rules/' + editId, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ posting_days: allDays, posting_hours: hours, posts_per_day: postsPerDay, content_type: contentType, notes })
        });
        showToast('Rule updated', 'success');
    } else {
        // Create new rule
        await fetch(API_URL + '/clients/' + clientId + '/posting-rules', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, posting_days: allDays, posting_hours: hours, posts_per_day: postsPerDay, content_type: contentType, notes })
        });
        showToast('Rule added', 'success');
    }
    resetRuleForm();
    loadClientRules();
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

// ========== PRESENTATION VIEW ==========

async function loadPresentation() {
    const year = presMonth.getFullYear();
    const month = presMonth.getMonth() + 1;
    document.getElementById('pres-month-label').textContent = presMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const data = await apiFetch(`${API_URL}/posts/calendar?year=${year}&month=${month}&client_id=${clientId}&include_unscheduled=1`);
    if (!data) { presPosts = []; }
    else {
        const posts = data.posts || [];
        posts.sort((a, b) => {
            const da = a.scheduled_at || a.created_at || '';
            const db = b.scheduled_at || b.created_at || '';
            return da.localeCompare(db);
        });
        presPosts = posts;
    }

    presCurrentIndex = 0;
    if (presPosts.length > 0) {
        document.getElementById('pres-slide-content').classList.remove('hidden');
        document.getElementById('pres-empty-state').classList.add('hidden');
        renderPresSlide();
    } else {
        document.getElementById('pres-slide-content').innerHTML = '';
        document.getElementById('pres-slide-content').classList.add('hidden');
        document.getElementById('pres-empty-state').classList.remove('hidden');
        document.getElementById('pres-slide-counter').textContent = '0 / 0';
        document.getElementById('pres-dots').innerHTML = '';
        document.getElementById('pres-prev-btn').disabled = true;
        document.getElementById('pres-next-btn').disabled = true;
    }
}

function changePresMonth(delta) {
    presMonth.setMonth(presMonth.getMonth() + delta);
    loadPresentation();
}

function renderPresSlide() {
    if (presPosts.length === 0) return;
    const post = presPosts[presCurrentIndex];
    const status = getPostStatus(post);
    const color = getStatusColor(status);
    const dateStr = post.scheduled_at || post.created_at || '';
    const dateObj = dateStr ? new Date(dateStr) : null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedDate = dateObj ? `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${dayNames[dateObj.getDay()]}` : 'Unscheduled';

    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    const designUrls = (post.design_output_urls || '').split(',').filter(u => u.trim());

    let html = `<div onclick="openClientPostDetail(${post.id})" style="cursor:pointer">`;

    // Header
    html += `<div class="pres-slide-header">`;
    html += `<span class="pres-badge text-white" style="background:${color}">${esc(status)}</span>`;
    if (post.post_type) html += `<span class="pres-badge bg-gray-100 text-gray-700">${getContentTypeIcon(post.post_type)} ${esc(post.post_type)}</span>`;
    if (post.platforms) html += `<span class="pres-badge ${getPlatformBgClass(post.platforms)}">${getPlatformIcon(post.platforms)} ${esc(post.platforms)}</span>`;
    if (post.dimensions) html += `<span class="pres-badge bg-gray-100 text-gray-600">${esc(post.dimensions)}</span>`;
    html += `<span class="pres-date">${esc(formattedDate)}</span>`;
    html += `</div>`;

    // TOV / Topic block
    if (post.topic) {
        html += `<div class="pres-tov-block">`;
        html += `<div class="pres-tov-label">Text on Design / Topic</div>`;
        html += `<div>${esc(post.topic)}</div>`;
        html += `</div>`;
    }

    // Design References
    if (refUrls.length > 0) {
        html += `<div class="pres-images-grid">`;
        html += `<div class="pres-img-label">Design References</div>`;
        refUrls.forEach(u => {
            const url = u.trim();
            html += `<img class="pres-ref-img" src="${url}" alt="Reference" onclick="event.stopPropagation(); window.open('${url}','_blank')">`;
        });
        html += `</div>`;
    }

    // Design Output
    if (designUrls.length > 0) {
        html += `<div class="pres-images-grid">`;
        html += `<div class="pres-img-label">Design Output</div>`;
        designUrls.forEach(u => {
            const url = u.trim();
            html += `<img class="pres-design-img" src="${url}" alt="Design" onclick="event.stopPropagation(); window.open('${url}','_blank')">`;
        });
        html += `</div>`;
    }

    // Caption block
    if (post.caption) {
        html += `<div class="pres-caption-block">`;
        html += `<div class="pres-caption-label">Caption</div>`;
        html += `<div>${esc(post.caption)}</div>`;
        html += `</div>`;
    }

    // Notes for Designer
    if (post.brief_notes) {
        html += `<div class="pres-notes-block">`;
        html += `<div class="pres-notes-label">Notes for Designer</div>`;
        html += `<div>${esc(post.brief_notes)}</div>`;
        html += `</div>`;
    }

    html += `</div>`;

    // Apply animation
    const container = document.getElementById('pres-slide-container');
    container.style.animation = 'none';
    container.offsetHeight; // trigger reflow
    container.style.animation = '';

    document.getElementById('pres-slide-content').innerHTML = html;
    document.getElementById('pres-slide-content').classList.remove('hidden');
    document.getElementById('pres-empty-state').classList.add('hidden');

    // Update counter
    document.getElementById('pres-slide-counter').textContent = `${presCurrentIndex + 1} / ${presPosts.length}`;

    // Update nav buttons
    document.getElementById('pres-prev-btn').disabled = presCurrentIndex === 0;
    document.getElementById('pres-next-btn').disabled = presCurrentIndex === presPosts.length - 1;

    renderPresDots();
}

function presNavigate(direction) {
    const newIndex = presCurrentIndex + direction;
    if (newIndex < 0 || newIndex >= presPosts.length) return;
    presCurrentIndex = newIndex;
    renderPresSlide();
}

function renderPresDots() {
    const container = document.getElementById('pres-dots');
    if (presPosts.length > 30) { container.innerHTML = ''; return; }
    container.innerHTML = presPosts.map((_, i) =>
        `<div class="pres-dot ${i === presCurrentIndex ? 'active' : ''}" onclick="presGoToSlide(${i})"></div>`
    ).join('');
}

function presGoToSlide(index) {
    if (index < 0 || index >= presPosts.length) return;
    presCurrentIndex = index;
    renderPresSlide();
}

function togglePresFullscreen() {
    const wrapper = document.getElementById('client-tab-presentation')?.querySelector('.bg-white');
    if (!wrapper) return;
    if (presIsFullscreen) {
        wrapper.classList.remove('pres-fullscreen');
        presIsFullscreen = false;
    } else {
        wrapper.classList.add('pres-fullscreen');
        presIsFullscreen = true;
    }
}

// Keyboard navigation for presentation
document.addEventListener('keydown', function(e) {
    // Only active when presentation tab is visible
    if (!document.getElementById('client-tab-presentation')?.classList.contains('active')) return;
    // Don't capture keys when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        presNavigate(-1); // RTL: Right = previous
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        presNavigate(1); // RTL: Left = next
    } else if (e.key === 'Escape' && presIsFullscreen) {
        e.preventDefault();
        togglePresFullscreen();
    } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        togglePresFullscreen();
    }
});
