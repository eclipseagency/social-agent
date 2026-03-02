// Capacity Planning page JS
let capacityData = null;

function pageInit() {
    loadCapacity();
}

async function loadCapacity() {
    const roleFilter = document.getElementById('capacity-role-filter')?.value || '';
    let url = `${API_URL}/capacity`;
    if (roleFilter) url += `?role=${roleFilter}`;
    try {
        capacityData = await fetch(url).then(r => r.json());
    } catch (e) { console.error('Capacity load failed:', e); return; }

    // Populate role filter dropdown (only on first load)
    const filterEl = document.getElementById('capacity-role-filter');
    if (filterEl && filterEl.options.length <= 1 && capacityData.roles) {
        const roleLabels = { admin: 'Admin', sm_specialist: 'SMM', designer: 'Designer', motion_designer: 'Motion', moderator: 'Moderator', copywriter: 'Writer' };
        capacityData.roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = roleLabels[r] || r;
            filterEl.appendChild(opt);
        });
    }

    renderRoleSummary(capacityData.role_summary);
    renderCapacityBars(capacityData.capacity_bars);
    renderHeatmap(capacityData.heatmap);
    renderUnassigned(capacityData.unassigned);
    renderDeadlines(capacityData.deadlines);
}

function filterCapacityByRole() {
    loadCapacity();
}

const ROLE_LABELS = { admin: 'Admin', sm_specialist: 'SMM Specialist', designer: 'Designer', motion_designer: 'Motion Designer', moderator: 'Moderator', copywriter: 'Copywriter' };
const ROLE_COLORS = { admin: 'border-red-400 bg-red-50', sm_specialist: 'border-green-400 bg-green-50', designer: 'border-purple-400 bg-purple-50', motion_designer: 'border-orange-400 bg-orange-50', moderator: 'border-blue-400 bg-blue-50', copywriter: 'border-yellow-400 bg-yellow-50' };
const ROLE_ICONS = { admin: 'fa-shield-halved text-red-500', sm_specialist: 'fa-bullhorn text-green-500', designer: 'fa-paintbrush text-purple-500', motion_designer: 'fa-film text-orange-500', moderator: 'fa-user-check text-blue-500', copywriter: 'fa-pen-nib text-yellow-500' };

function renderRoleSummary(summary) {
    const el = document.getElementById('role-summary');
    if (!el || !summary?.length) { if (el) el.innerHTML = ''; return; }
    el.innerHTML = summary.map(rs => {
        const color = ROLE_COLORS[rs.role] || 'border-gray-400 bg-gray-50';
        const icon = ROLE_ICONS[rs.role] || 'fa-user text-gray-500';
        const utilColor = rs.utilization > 80 ? 'text-red-600' : rs.utilization > 50 ? 'text-amber-600' : 'text-green-600';
        return `<div class="rounded-xl p-4 border-l-4 ${color}">
            <div class="flex items-center gap-2 mb-2"><i class="fa-solid ${icon}"></i><span class="text-xs font-bold">${ROLE_LABELS[rs.role] || rs.role}</span></div>
            <div class="text-2xl font-bold ${utilColor}">${rs.utilization}%</div>
            <div class="text-[10px] text-gray-500">${rs.users} members · ${rs.active}/${rs.required} tasks</div>
        </div>`;
    }).join('');
}

function renderCapacityBars(bars) {
    const el = document.getElementById('capacity-bars');
    if (!el) return;
    if (!bars?.length) { el.innerHTML = '<p class="text-gray-400 text-center py-4">No team members found</p>'; return; }

    el.innerHTML = bars.map(b => {
        const pct = Math.min(b.utilization, 100);
        const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500';
        const roleLabel = ROLE_LABELS[b.role] || b.role;
        const icon = ROLE_ICONS[b.role] || 'fa-user text-gray-500';
        return `<div class="flex items-center gap-3">
            <div class="w-32 flex-shrink-0">
                <div class="flex items-center gap-2"><i class="fa-solid ${icon} text-xs"></i><span class="text-sm font-semibold truncate">${esc(b.username)}</span></div>
                <span class="text-[10px] text-gray-400">${roleLabel}</span>
            </div>
            <div class="flex-1">
                <div class="w-full bg-gray-100 rounded-full h-4 relative overflow-hidden">
                    <div class="${barColor} h-4 rounded-full transition-all duration-500" style="width:${pct}%"></div>
                    <span class="absolute inset-0 flex items-center justify-center text-[10px] font-bold ${pct > 50 ? 'text-white' : 'text-gray-600'}">${b.active}/${b.required}</span>
                </div>
            </div>
            <div class="w-14 text-right text-sm font-bold ${pct > 80 ? 'text-red-600' : pct > 50 ? 'text-amber-600' : 'text-green-600'}">${b.utilization}%</div>
        </div>`;
    }).join('');
}

function renderHeatmap(heatmap) {
    const el = document.getElementById('workload-heatmap');
    if (!el || !heatmap?.length) { if (el) el.innerHTML = '<p class="text-gray-400 text-center py-4">No data</p>'; return; }

    const dates = heatmap[0]?.days?.map(d => d.date) || [];
    const today = new Date().toISOString().split('T')[0];

    let html = '<table class="w-full text-xs" style="min-width:600px"><thead><tr><th class="text-left py-1 pr-3 text-gray-500 font-semibold" style="width:120px">Team Member</th>';
    dates.forEach(d => {
        const short = d.substring(5);
        const dayName = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const isToday = d === today;
        html += `<th class="text-center py-1 px-1 ${isToday ? 'text-indigo-600 font-bold' : 'text-gray-400'}" style="min-width:36px"><div>${dayName}</div><div>${short}</div></th>`;
    });
    html += '</tr></thead><tbody>';

    heatmap.forEach(row => {
        html += `<tr><td class="py-1 pr-3 font-medium truncate">${esc(row.username)}</td>`;
        row.days.forEach(d => {
            const c = d.count;
            let bg = 'bg-gray-50';
            if (c >= 5) bg = 'bg-red-500 text-white';
            else if (c >= 3) bg = 'bg-amber-400 text-white';
            else if (c >= 1) bg = 'bg-green-400 text-white';
            html += `<td class="text-center py-1 px-1"><div class="w-8 h-8 mx-auto rounded flex items-center justify-center text-xs font-semibold ${bg}" title="${d.date}: ${c} posts">${c || ''}</div></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    // Legend
    html += '<div class="flex items-center gap-3 mt-3 text-[10px] text-gray-500"><span>Load:</span><span class="flex items-center gap-1"><span class="w-4 h-4 rounded bg-gray-50 border"></span>0</span><span class="flex items-center gap-1"><span class="w-4 h-4 rounded bg-green-400"></span>1-2</span><span class="flex items-center gap-1"><span class="w-4 h-4 rounded bg-amber-400"></span>3-4</span><span class="flex items-center gap-1"><span class="w-4 h-4 rounded bg-red-500"></span>5+</span></div>';

    el.innerHTML = html;
}

function renderUnassigned(items) {
    const el = document.getElementById('unassigned-list');
    if (!el) return;
    if (!items?.length) { el.innerHTML = '<p class="text-gray-400 text-center py-4"><i class="fa-solid fa-circle-check text-green-400 text-2xl mb-2 block"></i>All work is assigned</p>'; return; }

    el.innerHTML = items.map(item => {
        const statusLabels = { pending_review: 'Needs Reviewer', in_design: 'Needs Designer', approved: 'Needs SM', scheduled: 'Needs SM' };
        const statusLabel = statusLabels[item.workflow_status] || item.workflow_status;
        const priBadge = item.priority === 'urgent' ? 'bg-red-100 text-red-700' : item.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600';
        const topic = getTopicPreview(item.topic, 40) || 'Untitled';
        return `<a href="/calendar?open_post=${item.id}" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${priBadge}">${item.priority || 'normal'}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold truncate">${esc(topic)}</p>
                <p class="text-[10px] text-gray-400">${esc(item.client_name || '')} · ${getPlatformIcon(item.platforms)} ${esc(item.post_type || '')}</p>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 whitespace-nowrap">${statusLabel}</span>
        </a>`;
    }).join('');
}

function renderDeadlines(items) {
    const el = document.getElementById('deadlines-list');
    if (!el) return;
    if (!items?.length) { el.innerHTML = '<p class="text-gray-400 text-center py-4">No upcoming deadlines</p>'; return; }

    el.innerHTML = items.map(item => {
        const dt = new Date(item.scheduled_at);
        const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const assignee = item.sm_name || item.designer_name || 'Unassigned';
        const topic = getTopicPreview(item.topic, 40) || 'Untitled';
        const isUrgent = (dt - new Date()) < 86400000; // less than 24h
        return `<a href="/calendar?open_post=${item.id}" class="flex items-center gap-3 p-3 ${isUrgent ? 'bg-red-50 border border-red-200' : 'bg-gray-50'} rounded-lg hover:bg-gray-100 transition">
            <div class="text-center flex-shrink-0 ${isUrgent ? 'text-red-600' : 'text-indigo-600'}">
                <div class="text-lg font-bold">${dt.getDate()}</div>
                <div class="text-[10px]">${dt.toLocaleDateString('en-US', { month: 'short' })}</div>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold truncate">${esc(topic)}</p>
                <p class="text-[10px] text-gray-400">${esc(item.client_name || '')} · ${timeStr} · ${getPlatformIcon(item.platforms)}</p>
            </div>
            <span class="text-[10px] text-gray-500 flex-shrink-0"><i class="fa-solid fa-user text-indigo-400"></i> ${esc(assignee)}</span>
        </a>`;
    }).join('');
}
