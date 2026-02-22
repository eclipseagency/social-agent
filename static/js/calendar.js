// Calendar page JS
let currentMonth = new Date();
let scheduledPostsData = [];

function pageInit() {
    loadCalendar();
    loadClientsDropdown('calendar-client-filter');
}

async function loadCalendar() {
    const clientId = document.getElementById('calendar-client-filter')?.value || '';
    let url = API_URL + '/all-posts';
    if (clientId) url += '?client_id=' + clientId;
    scheduledPostsData = await fetch(url).then(r => r.json());
    renderCalendar();
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    document.getElementById('calendar-month').textContent = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="bg-gray-50 rounded p-2 min-h-[80px]"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const posts = scheduledPostsData.filter(p => p.scheduled_at?.startsWith(dateStr) || p.created_at?.startsWith(dateStr));
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        const hasPosts = posts.length > 0;
        html += `<div class="bg-white border rounded-lg p-2 min-h-[80px] ${isToday ? 'ring-2 ring-indigo-500' : ''} ${hasPosts ? 'cursor-pointer hover:bg-gray-50 transition' : ''}" ${hasPosts ? `onclick="showDayPosts('${dateStr}', ${day})"` : ''}>
            <div class="font-semibold text-sm ${isToday ? 'text-indigo-600' : ''}">${day}</div>
            ${posts.slice(0, 2).map(p => `<div class="text-xs mt-1 px-2 py-1 rounded ${getPlatformBgClass(p.platforms)} truncate">${getPlatformIcon(p.platforms)} ${esc(p.topic?.substring(0, 10) || '')}...</div>`).join('')}
            ${posts.length > 2 ? `<div class="text-xs text-indigo-600 font-semibold mt-1 text-center">+${posts.length - 2} more</div>` : ''}
        </div>`;
    }
    document.getElementById('calendar-grid').innerHTML = html;
}

function showDayPosts(dateStr, day) {
    const posts = scheduledPostsData.filter(p => p.scheduled_at?.startsWith(dateStr) || p.created_at?.startsWith(dateStr));
    document.getElementById('day-posts-title').textContent = `Posts for Day ${day}`;
    if (posts.length === 0) {
        document.getElementById('day-posts-list').innerHTML = '<p class="text-gray-500 text-center py-8">No posts on this day</p>';
    } else {
        document.getElementById('day-posts-list').innerHTML = posts.map(p => `
            <div class="border rounded-xl p-4 hover:shadow-md transition ${p.status === 'posted' ? 'border-green-200 bg-green-50' : p.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2"><span class="text-2xl">${getPlatformIcon(p.platforms)}</span><div><p class="font-semibold">${esc(p.topic || 'Untitled')}</p><p class="text-xs text-gray-500">${esc(p.platforms)}</p></div></div>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${p.status === 'posted' ? 'bg-green-200 text-green-800' : p.status === 'failed' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}">${p.status === 'posted' ? 'Published' : p.status === 'failed' ? 'Failed' : 'Pending'}</span>
                </div>
                <p class="text-sm text-gray-600 mb-2 line-clamp-2">${esc(p.caption || '')}</p>
                <div class="flex justify-between items-center text-xs text-gray-400">
                    <span><i class="fa-regular fa-clock mr-1"></i>${p.scheduled_at?.replace('T', ' ') || p.created_at?.replace('T', ' ') || ''}</span>
                    <span>${esc(p.client_name || '')}</span>
                </div>
                ${p.image_url ? `<div class="mt-2"><img src="${p.image_url.split(',')[0]}" class="h-16 w-16 object-cover rounded-lg"></div>` : ''}
            </div>
        `).join('');
    }
    document.getElementById('day-posts-modal').classList.remove('hidden');
}

function hideDayPostsModal() { document.getElementById('day-posts-modal').classList.add('hidden'); }
function changeMonth(delta) { currentMonth.setMonth(currentMonth.getMonth() + delta); loadCalendar(); }