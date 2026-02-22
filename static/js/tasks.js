// Tasks page JS
let taskViewMode = 'board';
let taskSortables = [];

function pageInit() {
    loadTasks();
    loadTaskFilterDropdowns();
}

async function loadTaskFilterDropdowns() {
    const clients = await fetch(API_URL + '/clients').then(r => r.json());
    const users = await fetch(API_URL + '/users').then(r => r.json());
    const assigneeSelect = document.getElementById('task-filter-assignee');
    const clientSelect = document.getElementById('task-filter-client');
    const taskAssignee = document.getElementById('task-assignee');
    const taskClient = document.getElementById('task-client');
    if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">All Members</option>' + users.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
    if (clientSelect) clientSelect.innerHTML = '<option value="">All Clients</option>' + clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (taskAssignee) taskAssignee.innerHTML = '<option value="">Unassigned</option>' + users.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
    if (taskClient) taskClient.innerHTML = '<option value="">No client</option>' + clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

async function loadTasks() {
    // Update view buttons
    document.getElementById('btn-board-view').className = taskViewMode === 'board' ? 'bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-sm font-semibold' : 'bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm';
    document.getElementById('btn-list-view').className = taskViewMode === 'list' ? 'bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-sm font-semibold' : 'bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm';
    document.getElementById('tasks-board-view').classList.toggle('hidden', taskViewMode !== 'board');
    document.getElementById('tasks-list-view').classList.toggle('hidden', taskViewMode !== 'list');

    const assignee = document.getElementById('task-filter-assignee')?.value || '';
    const clientId = document.getElementById('task-filter-client')?.value || '';
    const priority = document.getElementById('task-filter-priority')?.value || '';

    let url = API_URL + '/tasks/board';
    const board = await fetch(url).then(r => r.json());

    if (taskViewMode === 'board') {
        renderKanbanBoard(board);
        initKanbanDragDrop();
    } else {
        let params = [];
        if (assignee) params.push('assigned_to_id=' + assignee);
        if (clientId) params.push('client_id=' + clientId);
        if (priority) params.push('priority=' + priority);
        const tasks = await fetch(API_URL + '/tasks' + (params.length ? '?' + params.join('&') : '')).then(r => r.json());
        renderTasksList(tasks);
    }
}

function renderKanbanBoard(board) {
    const statuses = ['todo', 'in_progress', 'in_review', 'done'];
    statuses.forEach(status => {
        const col = document.getElementById('col-' + status);
        const count = document.getElementById('count-' + status);
        const tasks = board[status] || [];
        if (count) count.textContent = tasks.length;
        if (col) col.innerHTML = tasks.map(t => renderKanbanCard(t)).join('') || '<p class="text-gray-400 text-xs text-center py-4">No tasks</p>';
    });
}

function renderKanbanCard(task) {
    const priorityClass = 'priority-' + (task.priority || 'normal');
    return `
        <div class="kanban-card ${priorityClass}" data-id="${task.id}" onclick="viewTaskDetail(${task.id})">
            <div class="flex items-center justify-between mb-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold badge-${task.priority || 'normal'}">${task.priority || 'normal'}</span>
                ${task.category ? `<span class="text-[10px] text-gray-400">${esc(task.category)}</span>` : ''}
            </div>
            <p class="font-semibold text-sm mb-1">${esc(task.title)}</p>
            <div class="flex items-center justify-between text-xs text-gray-400 mt-2">
                <span>${esc(task.client_name || '')}</span>
                <span>${esc(task.assigned_to_name || 'Unassigned')}</span>
            </div>
            ${task.due_date ? `<div class="text-xs mt-1 ${new Date(task.due_date) < new Date() ? 'text-red-500 font-semibold' : 'text-gray-400'}"><i class="fa-regular fa-clock mr-1"></i>${task.due_date}</div>` : ''}
        </div>
    `;
}

function initKanbanDragDrop() {
    taskSortables.forEach(s => s.destroy());
    taskSortables = [];
    ['todo', 'in_progress', 'in_review', 'done'].forEach(status => {
        const col = document.getElementById('col-' + status);
        if (!col) return;
        const sortable = new Sortable(col, {
            group: 'tasks',
            animation: 200,
            ghostClass: 'sortable-ghost',
            onEnd: async function(evt) {
                const taskId = evt.item.dataset.id;
                const newStatus = evt.to.dataset.status;
                if (taskId && newStatus) {
                    await changeTaskStatus(taskId, newStatus);
                }
            }
        });
        taskSortables.push(sortable);
    });
}

function renderTasksList(tasks) {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;
    tbody.innerHTML = tasks.map(t => `
        <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="viewTaskDetail(${t.id})">
            <td class="px-4 py-3 font-semibold text-sm">${esc(t.title)}</td>
            <td class="px-4 py-3 text-sm">${esc(t.client_name || '-')}</td>
            <td class="px-4 py-3 text-sm">${esc(t.assigned_to_name || '-')}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold badge-${t.priority || 'normal'}">${t.priority || 'normal'}</span></td>
            <td class="px-4 py-3 text-sm ${t.due_date && new Date(t.due_date) < new Date() ? 'text-red-500 font-semibold' : ''}">${t.due_date || '-'}</td>
            <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ${t.status === 'done' ? 'bg-green-100 text-green-800' : t.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : t.status === 'in_review' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}">${t.status}</span></td>
            <td class="px-4 py-3"><button onclick="event.stopPropagation(); deleteTask(${t.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-500">No tasks found</td></tr>';
}

function showAddTaskModal() { document.getElementById('add-task-modal').classList.remove('hidden'); }
function hideAddTaskModal() { document.getElementById('add-task-modal').classList.add('hidden'); }

async function submitTask() {
    const data = {
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        client_id: document.getElementById('task-client').value || null,
        assigned_to_id: document.getElementById('task-assignee').value || null,
        priority: document.getElementById('task-priority').value,
        category: document.getElementById('task-category').value,
        due_date: document.getElementById('task-due-date').value || null,
        created_by_id: currentUser?.id || 1
    };
    if (!data.title) { alert('Title is required'); return; }
    const res = await fetch(API_URL + '/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
    if (res.success) { hideAddTaskModal(); loadTasks(); showToast('Task created', 'success'); } else { alert(res.error || 'Failed'); }
}

async function viewTaskDetail(taskId) {
    const task = await fetch(API_URL + '/tasks/' + taskId).then(r => r.json());
    if (!task || task.error) return;
    document.getElementById('task-detail-title').textContent = task.title;
    const statusOpts = ['todo', 'in_progress', 'in_review', 'done'].map(s => `<option value="${s}" ${task.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('');
    document.getElementById('task-detail-content').innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Status</p>
                <select onchange="changeTaskStatus(${task.id}, this.value)" class="border rounded px-2 py-1 text-sm mt-1">${statusOpts}</select>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Priority</p><p class="font-semibold text-sm"><span class="badge-${task.priority || 'normal'} px-2 py-0.5 rounded text-xs">${task.priority || 'normal'}</span></p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Assignee</p><p class="font-semibold text-sm">${esc(task.assigned_to_name || 'Unassigned')}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Client</p><p class="font-semibold text-sm">${esc(task.client_name || '-')}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Due Date</p><p class="font-semibold text-sm">${task.due_date || '-'}</p></div>
            <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Created By</p><p class="font-semibold text-sm">${esc(task.created_by_name || '-')}</p></div>
        </div>
        ${task.description ? `<div class="mb-4"><h4 class="font-semibold text-sm mb-1">Description</h4><p class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">${esc(task.description)}</p></div>` : ''}
        <div class="border-t pt-4">
            <h4 class="font-semibold text-sm mb-3">Comments (${(task.comments || []).length})</h4>
            <div class="space-y-2 mb-3 max-h-48 overflow-y-auto">
                ${(task.comments || []).map(c => `<div class="bg-gray-50 p-3 rounded-lg"><div class="flex justify-between text-xs text-gray-400 mb-1"><span class="font-semibold text-gray-600">${esc(c.user_name || 'User')}</span><span>${c.created_at || ''}</span></div><p class="text-sm">${esc(c.content)}</p></div>`).join('') || '<p class="text-gray-400 text-sm">No comments</p>'}
            </div>
            <div class="flex gap-2">
                <input type="text" id="task-comment-input" class="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="Add a comment..." onkeypress="if(event.key==='Enter') addTaskComment(${task.id})">
                <button onclick="addTaskComment(${task.id})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Send</button>
            </div>
        </div>
        <div class="flex gap-2 mt-4 pt-4 border-t">
            <button onclick="deleteTask(${task.id})" class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm"><i class="fa-solid fa-trash mr-1"></i> Delete</button>
        </div>
    `;
    document.getElementById('task-detail-modal').classList.remove('hidden');
}

function hideTaskDetailModal() { document.getElementById('task-detail-modal').classList.add('hidden'); }

async function changeTaskStatus(taskId, newStatus) {
    await fetch(API_URL + '/tasks/' + taskId + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });
    loadTasks();
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    await fetch(API_URL + '/tasks/' + taskId, { method: 'DELETE' });
    hideTaskDetailModal();
    loadTasks();
}

async function addTaskComment(taskId) {
    const input = document.getElementById('task-comment-input');
    const content = input?.value?.trim();
    if (!content) return;
    await fetch(API_URL + '/tasks/' + taskId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, user_id: currentUser?.id || 1 })
    });
    input.value = '';
    viewTaskDetail(taskId);
}
