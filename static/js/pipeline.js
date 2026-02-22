// Pipeline page JS
let pipelineSortables = [];

function pageInit() {
    loadPipeline();
    loadPipelineFilterDropdowns();
}

async function loadPipelineFilterDropdowns() {
    const clients = await fetch(API_URL + '/clients').then(r => r.json());
    const users = await fetch(API_URL + '/users').then(r => r.json());
    const clientSelect = document.getElementById('pipeline-filter-client');
    const assigneeSelect = document.getElementById('pipeline-filter-assignee');
    if (clientSelect) clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">All Members</option>' + users.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
}

async function loadPipeline() {
    const clientId = document.getElementById('pipeline-filter-client')?.value || '';
    const assignee = document.getElementById('pipeline-filter-assignee')?.value || '';
    let url = API_URL + '/pipeline?';
    if (clientId) url += 'client_id=' + clientId + '&';
    if (assignee) url += 'assigned_to=' + assignee;
    const board = await fetch(url).then(r => r.json());
    renderPipelineBoard(board);
    initPipelineDragDrop();
}

function renderPipelineBoard(board) {
    const statuses = ['draft', 'needs_caption', 'in_design', 'design_review', 'approved', 'scheduled'];
    statuses.forEach(status => {
        const col = document.getElementById('pcol-' + status);
        const count = document.getElementById('pcount-' + status);
        const posts = board[status] || [];
        if (count) count.textContent = posts.length;
        if (col) col.innerHTML = posts.map(p => renderPipelineCard(p)).join('') || '<p class="text-gray-400 text-xs text-center py-4">No posts</p>';
    });
}

function renderPipelineCard(post) {
    const priorityClass = 'priority-' + (post.priority || 'normal');
    const platforms = (post.platforms || '').split(',').map(p => getPlatformIcon(p.trim())).join(' ');
    return `
        <div class="kanban-card ${priorityClass}" data-id="${post.id}" onclick="viewPostDetail(${post.id})">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-gray-500">${esc(post.client_name || '')}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold badge-${post.priority || 'normal'}">${post.priority || 'normal'}</span>
            </div>
            <p class="font-semibold text-sm mb-2">${esc(post.topic || 'Untitled')}</p>
            <div class="flex items-center justify-between text-xs text-gray-400">
                <span>${platforms}</span>
                <span>${post.assigned_designer_name ? '<i class="fa-solid fa-palette mr-1"></i>' + esc(post.assigned_designer_name) : ''}</span>
            </div>
            ${post.design_output_urls ? '<div class="mt-2"><i class="fa-solid fa-image text-green-500 text-xs"></i> <span class="text-xs text-green-600">Design attached</span></div>' : ''}
        </div>
    `;
}

function initPipelineDragDrop() {
    pipelineSortables.forEach(s => s.destroy());
    pipelineSortables = [];
    const statuses = ['draft', 'needs_caption', 'in_design', 'design_review', 'approved', 'scheduled'];
    statuses.forEach(status => {
        const col = document.getElementById('pcol-' + status);
        if (!col) return;
        const sortable = new Sortable(col, {
            group: 'pipeline',
            animation: 200,
            ghostClass: 'sortable-ghost',
            onEnd: async function(evt) {
                const postId = evt.item.dataset.id;
                const newStatus = evt.to.dataset.status;
                if (postId && newStatus) {
                    await changePostWorkflow(postId, newStatus);
                }
            }
        });
        pipelineSortables.push(sortable);
    });
}

async function changePostWorkflow(postId, newStatus) {
    const userId = currentUser?.id || 1;
    await fetch(API_URL + '/posts/' + postId + '/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, user_id: userId })
    });
    loadPipeline();
}

async function viewPostDetail(postId) {
    const post = await fetch(API_URL + '/posts/' + postId).then(r => r.json());
    if (!post || post.error) return;
    const comments = await fetch(API_URL + '/posts/' + postId + '/comments').then(r => r.json());

    document.getElementById('post-detail-title').textContent = post.topic || 'Post Details';
    const statusColors = { draft: 'bg-gray-100 text-gray-800', needs_caption: 'bg-yellow-100 text-yellow-800', in_design: 'bg-pink-100 text-pink-800', design_review: 'bg-yellow-100 text-yellow-800', approved: 'bg-green-100 text-green-800', scheduled: 'bg-blue-100 text-blue-800', posted: 'bg-green-200 text-green-900' };

    let designImagesHtml = '';
    if (post.design_output_urls) {
        const urls = post.design_output_urls.split(',').filter(u => u.trim());
        designImagesHtml = `<div class="mb-4"><h4 class="font-semibold text-sm mb-2">Design Output</h4><div class="flex gap-2 flex-wrap">${urls.map(u => `<img src="${u.trim()}" class="h-24 w-24 object-cover rounded-lg border">`).join('')}</div></div>`;
    }

    let refImagesHtml = '';
    if (post.design_reference_urls) {
        const urls = post.design_reference_urls.split(',').filter(u => u.trim());
        refImagesHtml = `<div class="mb-4"><h4 class="font-semibold text-sm mb-2">Reference Images</h4><div class="flex gap-2 flex-wrap">${urls.map(u => `<img src="${u.trim()}" class="h-20 w-20 object-cover rounded-lg border">`).join('')}</div></div>`;
    }

    document.getElementById('post-detail-content').innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Client</p><p class="font-semibold text-sm">${esc(post.client_name || '-')}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Status</p><span class="px-2 py-0.5 rounded text-xs font-semibold ${statusColors[post.workflow_status] || 'bg-gray-100'}">${post.workflow_status || 'draft'}</span></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Copywriter</p><p class="font-semibold text-sm">${esc(post.assigned_writer_name || '-')}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Designer</p><p class="font-semibold text-sm">${esc(post.assigned_designer_name || '-')}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">SM Specialist</p><p class="font-semibold text-sm">${esc(post.assigned_sm_name || '-')}</p></div>
        </div>
        ${post.caption ? `<div class="mb-4"><h4 class="font-semibold text-sm mb-1">Caption</h4><p class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">${esc(post.caption)}</p></div>` : ''}
        ${post.brief_notes ? `<div class="mb-4"><h4 class="font-semibold text-sm mb-1">Brief Notes</h4><p class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">${esc(post.brief_notes)}</p></div>` : ''}
        ${refImagesHtml}
        ${designImagesHtml}
        <!-- Workflow Actions -->
        <div class="flex flex-wrap gap-2 mb-4">
            ${post.workflow_status === 'draft' ? `
                ${post.assigned_writer_id ? `<button onclick="changePostWorkflowAndRefresh(${post.id}, 'needs_caption')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-pen-nib mr-1"></i> Send to Copywriter</button>` : ''}
                <button onclick="changePostWorkflowAndRefresh(${post.id}, 'in_design')" class="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-paper-plane mr-1"></i> Send to Design</button>
            ` : ''}
            ${post.workflow_status === 'needs_caption' ? `
                <button onclick="changePostWorkflowAndRefresh(${post.id}, 'in_design')" class="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-paper-plane mr-1"></i> Send to Design</button>
            ` : ''}
            ${post.workflow_status === 'in_design' ? `
                <label class="bg-purple-500 text-white px-4 py-2 rounded-lg text-sm cursor-pointer"><i class="fa-solid fa-upload mr-1"></i> Upload Design <input type="file" class="hidden" multiple accept="image/*" onchange="uploadDesignToPost(${post.id}, this)"></label>
                <button onclick="changePostWorkflowAndRefresh(${post.id}, 'design_review')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-eye mr-1"></i> Submit for Review</button>
            ` : ''}
            ${post.workflow_status === 'design_review' ? `
                <button onclick="changePostWorkflowAndRefresh(${post.id}, 'approved')" class="bg-green-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-check mr-1"></i> Approve</button>
                <button onclick="changePostWorkflowAndRefresh(${post.id}, 'in_design')" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-rotate-left mr-1"></i> Return to Design</button>
                ${post.assigned_writer_id ? `<button onclick="changePostWorkflowAndRefresh(${post.id}, 'needs_caption')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-pen-nib mr-1"></i> Return to Copywriter</button>` : ''}
            ` : ''}
            ${post.workflow_status === 'approved' ? `<button onclick="changePostWorkflowAndRefresh(${post.id}, 'scheduled')" class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-clock mr-1"></i> Mark Scheduled</button>` : ''}
        </div>
        <!-- Comments -->
        <div class="border-t pt-4">
            <h4 class="font-semibold text-sm mb-3">Comments (${comments.length})</h4>
            <div class="space-y-2 mb-3 max-h-48 overflow-y-auto">
                ${comments.map(c => `<div class="bg-gray-50 p-3 rounded-lg"><div class="flex justify-between text-xs text-gray-400 mb-1"><span class="font-semibold text-gray-600">${esc(c.user_name || 'User')}</span><span>${c.created_at || ''}</span></div><p class="text-sm">${esc(c.content)}</p></div>`).join('') || '<p class="text-gray-400 text-sm">No comments yet</p>'}
            </div>
            <div class="flex gap-2">
                <input type="text" id="post-comment-input" class="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="Add a comment..." onkeypress="if(event.key==='Enter') addPostComment(${post.id})">
                <button onclick="addPostComment(${post.id})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Send</button>
            </div>
        </div>
    `;
    document.getElementById('post-detail-modal').classList.remove('hidden');
}

function hidePostDetailModal() { document.getElementById('post-detail-modal').classList.add('hidden'); }

async function changePostWorkflowAndRefresh(postId, newStatus) {
    await changePostWorkflow(postId, newStatus);
    hidePostDetailModal();
    showToast('Status updated', 'success');
}

async function uploadDesignToPost(postId, input) {
    const files = input.files;
    if (!files.length) return;
    const formData = new FormData();
    for (let f of files) formData.append('images', f);
    formData.append('user_id', currentUser?.id || 1);
    const res = await fetch(API_URL + '/posts/' + postId + '/upload-design', { method: 'POST', body: formData }).then(r => r.json());
    if (res.success) {
        showToast('Design uploaded', 'success');
        viewPostDetail(postId);
        loadPipeline();
    } else {
        showToast('Upload failed', 'error');
    }
}

async function addPostComment(postId) {
    const input = document.getElementById('post-comment-input');
    const content = input?.value?.trim();
    if (!content) return;
    await fetch(API_URL + '/posts/' + postId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, user_id: currentUser?.id || 1 })
    });
    input.value = '';
    viewPostDetail(postId);
}