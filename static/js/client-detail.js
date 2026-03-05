// Client detail page JS — Simplified calendar-first workflow
function isVideoUrl(url) {
    return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(url || '');
}
function mediaTag(url, cls, extra) {
    if (isVideoUrl(url)) return `<video src="${url}" class="${cls}" ${extra || ''} muted playsinline preload="metadata" onclick="window.open('${url}','_blank')"></video>`;
    return `<img src="${url}" class="${cls}" ${extra || ''} onclick="window.open('${url}','_blank')">`;
}

let clientData = null;
let clientId = null;
let clientMonth = new Date();
let clientPostsData = [];
let clientCalByDate = {};
let clientDraggedPostId = null;
let clientStatusFilter = '';
let createPostRefFiles = [];
let createPostDesignFiles = [];
let slideViewPostId = null;
let carouselSlides = [];
let clientCalPins = {};

function pageInit() {
    loadClientDetail();
}

async function loadClientDetail() {
    clientData = await fetch(API_URL + '/clients/by-slug/' + clientSlug).then(r => r.json());
    if (clientData && !clientData.error) clientId = clientData.id;
    if (!clientData || clientData.error) { document.getElementById('client-title').textContent = 'Account Not Found'; return; }

    document.getElementById('client-title').innerHTML = `<i class="fa-solid fa-building text-indigo-600 mr-2"></i>${esc(clientData.name)}`;
    document.getElementById('cd-name').textContent = clientData.name || '-';
    document.getElementById('cd-company').textContent = clientData.company || '-';
    document.getElementById('cd-email').textContent = clientData.email || '-';

    // Show logo in header if available
    const logoHeader = document.getElementById('client-logo-header');
    const logoHeaderImg = document.getElementById('client-logo-header-img');
    if (clientData.logo_url && logoHeader && logoHeaderImg) {
        logoHeaderImg.src = clientData.logo_url;
        logoHeader.classList.remove('hidden');
    } else if (logoHeader) {
        logoHeader.classList.add('hidden');
    }

    // Show brief and content requirements
    renderBriefSection();

    // Render assigned team badges
    renderTeamBadges();

    loadClientCalendar();
}

function renderTeamBadges() {
    const el = document.getElementById('cd-team');
    if (!el || !clientData) return;
    const roles = [
        { key: 'writer', label: 'Writer', color: 'bg-green-100 text-green-700', icon: 'fa-pen-nib' },
        { key: 'designer', label: 'Designer', color: 'bg-purple-100 text-purple-700', icon: 'fa-palette' },
        { key: 'sm', label: 'SM Specialist', color: 'bg-pink-100 text-pink-700', icon: 'fa-hashtag' },
        { key: 'motion', label: 'Motion', color: 'bg-orange-100 text-orange-700', icon: 'fa-film' },
        { key: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-700', icon: 'fa-user-tie' },
    ];
    const badges = roles
        .filter(r => clientData[`assigned_${r.key}_name`])
        .map(r => `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${r.color}"><i class="fa-solid ${r.icon}"></i>${esc(r.label)}: ${esc(clientData[`assigned_${r.key}_name`])}</span>`);
    el.innerHTML = badges.length ? badges.join('') : '';
}

let briefExpanded = false;

function renderBriefSection() {
    const section = document.getElementById('cd-brief-section');
    if (!section || !clientData) return;

    const hasBrief = clientData.brief_text && clientData.brief_text.trim();
    const hasBriefUrl = clientData.brief_url && clientData.brief_url.trim();
    const hasBriefFile = clientData.brief_file_url && clientData.brief_file_url.trim();
    const hasReqs = clientData.content_requirements && clientData.content_requirements.trim();

    if (hasBrief || hasBriefUrl || hasBriefFile || hasReqs) {
        section.classList.remove('hidden');
        if (clientData.brief_text && clientData.brief_text.trim()) {
            document.getElementById('cd-brief-text').textContent = clientData.brief_text;
        } else if (hasBriefFile || hasBriefUrl) {
            document.getElementById('cd-brief-text').innerHTML = '<span class="text-gray-400 italic"><i class="fa-solid fa-paperclip mr-1"></i>Brief attached below — no text description added</span>';
        } else {
            document.getElementById('cd-brief-text').textContent = 'No brief text set';
        }

        // Render attachments (link / PDF)
        const attachEl = document.getElementById('cd-brief-attachments');
        let attachHtml = '';
        if (hasBriefUrl) {
            attachHtml += `<a href="${esc(clientData.brief_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition">
                <i class="fa-solid fa-link"></i> Brief Link
            </a>`;
        }
        if (hasBriefFile) {
            const isPdf = clientData.brief_file_url.toLowerCase().endsWith('.pdf');
            attachHtml += `<a href="${esc(clientData.brief_file_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition">
                <i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file'}"></i> ${isPdf ? 'View PDF' : 'View File'}
            </a>`;
        }
        if (attachHtml) {
            attachEl.innerHTML = attachHtml;
            attachEl.classList.remove('hidden');
        } else {
            attachEl.classList.add('hidden');
        }

        // Check if text is long enough to need expand/collapse
        requestAnimationFrame(() => {
            const wrapper = document.getElementById('cd-brief-text-wrapper');
            const textEl = document.getElementById('cd-brief-text');
            const toggleBtn = document.getElementById('cd-brief-toggle');
            const fade = document.getElementById('cd-brief-fade');
            if (textEl.scrollHeight > 130) {
                toggleBtn.classList.remove('hidden');
                fade.classList.remove('hidden');
            } else {
                toggleBtn.classList.add('hidden');
                fade.classList.add('hidden');
                wrapper.style.maxHeight = 'none';
            }
        });

        const reqsEl = document.getElementById('cd-content-reqs');
        let reqs = [];
        try { reqs = JSON.parse(clientData.content_requirements || '[]'); } catch (e) {}
        if (reqs.length > 0) {
            reqsEl.innerHTML = reqs.map((r, i) => {
                const platList = r.platforms || (r.platform ? [r.platform] : []);
                const platIcons = platList.map(p => getPlatformIcon(p)).join(' ');
                const platNames = platList.map(p => esc(p)).join(', ');
                return `<div class="flex items-center gap-2">
                    ${platIcons}
                    <span class="font-semibold text-sm" id="req-progress-${i}">0</span>
                    <span class="text-gray-400 text-sm">/ ${r.count}</span>
                    <span class="text-sm">${esc(r.type)}${r.count > 1 ? 's' : ''}</span>
                    <span class="text-xs text-gray-400">on ${platNames}</span>
                    <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden ml-1" style="min-width:50px;max-width:100px">
                        <div class="h-full rounded-full transition-all" id="req-bar-${i}" style="width:0%;background:#6366f1"></div>
                    </div>
                </div>`;
            }).join('');
        } else {
            reqsEl.innerHTML = '<p class="text-gray-400 text-xs italic">No requirements set</p>';
        }
    } else {
        section.classList.add('hidden');
    }
}

function updateReqProgress() {
    if (!clientData) return;
    let reqs = [];
    try { reqs = JSON.parse(clientData.content_requirements || '[]'); } catch (e) {}
    if (reqs.length === 0) return;

    // Count posts for current calendar month by type and platform
    const posts = clientPostsData || [];

    reqs.forEach((r, i) => {
        const platList = r.platforms || (r.platform ? [r.platform] : []);
        const reqType = (r.type || '').toLowerCase();
        // Count posts matching ANY of the requirement's platforms AND the type
        const count = posts.filter(p => {
            const postType = (p.post_type || 'post').toLowerCase();
            const postPlatforms = (p.platforms || '').toLowerCase().split(',').map(s => s.trim());
            return postType === reqType && platList.some(rp => postPlatforms.includes(rp));
        }).length;

        const target = r.count || 1;
        const pct = Math.min(100, Math.round((count / target) * 100));
        const progressEl = document.getElementById(`req-progress-${i}`);
        const barEl = document.getElementById(`req-bar-${i}`);
        if (progressEl) {
            progressEl.textContent = count;
            if (count >= target) {
                progressEl.classList.add('text-green-600');
            } else if (count > 0) {
                progressEl.classList.add('text-indigo-600');
            } else {
                progressEl.classList.add('text-red-500');
            }
        }
        if (barEl) {
            barEl.style.width = pct + '%';
            if (count >= target) barEl.style.background = '#22c55e';
            else if (pct >= 50) barEl.style.background = '#6366f1';
            else barEl.style.background = '#f97316';
        }
    });
}

function toggleBriefExpand() {
    briefExpanded = !briefExpanded;
    const wrapper = document.getElementById('cd-brief-text-wrapper');
    const icon = document.getElementById('cd-brief-toggle-icon');
    const text = document.getElementById('cd-brief-toggle-text');
    const fade = document.getElementById('cd-brief-fade');

    if (briefExpanded) {
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
        icon.className = 'fa-solid fa-chevron-up mr-1';
        text.textContent = 'Show less';
        fade.classList.add('hidden');
    } else {
        wrapper.style.maxHeight = '120px';
        icon.className = 'fa-solid fa-chevron-down mr-1';
        text.textContent = 'Show more';
        fade.classList.remove('hidden');
    }
}

// ========== CLIENT CALENDAR ==========

async function loadClientCalendar() {
    const year = clientMonth.getFullYear();
    const month = clientMonth.getMonth() + 1;
    const [data, pinsData] = await Promise.all([
        apiFetch(`${API_URL}/posts/calendar?year=${year}&month=${month}&client_id=${clientId}&include_unscheduled=1`),
        apiFetch(`${API_URL}/calendar/pins?client_id=${clientId}&year=${year}&month=${month}`)
    ]);
    if (!data) return;
    clientPostsData = data.posts || [];
    clientCalByDate = data.by_date || {};
    clientCalPins = (pinsData && pinsData.pins) ? pinsData.pins : {};

    // Designer/motion_designer only see posts in_design or later
    const role = currentUser?.role;
    if (role === 'designer' || role === 'motion_designer') {
        const visibleStatuses = ['in_design', 'approved', 'scheduled', 'posted'];
        clientPostsData = clientPostsData.filter(p => visibleStatuses.includes(p.workflow_status));
        for (const d in clientCalByDate) {
            clientCalByDate[d] = clientCalByDate[d].filter(p => visibleStatuses.includes(p.workflow_status));
            if (!clientCalByDate[d].length) delete clientCalByDate[d];
        }
    }

    // Role-based filtering: motion_designer only sees video/reel
    if (currentUser?.role === 'motion_designer') {
        clientPostsData = clientPostsData.filter(p => ['video', 'reel'].includes((p.post_type || '').toLowerCase()));
        // Also filter by_date
        for (const date in clientCalByDate) {
            clientCalByDate[date] = clientCalByDate[date].filter(p => ['video', 'reel'].includes((p.post_type || '').toLowerCase()));
        }
    }
    // Designer only sees image-based types
    if (currentUser?.role === 'designer') {
        clientPostsData = clientPostsData.filter(p => ['post', 'story', 'carousel', 'grid', 'banner', 'brochure'].includes((p.post_type || '').toLowerCase()));
        for (const date in clientCalByDate) {
            clientCalByDate[date] = clientCalByDate[date].filter(p => ['post', 'story', 'carousel', 'grid', 'banner', 'brochure'].includes((p.post_type || '').toLowerCase()));
        }
    }

    document.getElementById('cd-posts-count').textContent = clientPostsData.length;
    renderClientCalendar();
    updateReqProgress();
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

    // Only SMM and admin can create posts
    const canCreate = canDo('createPost');

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="bg-gray-50 rounded p-1 min-h-[80px]"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayPosts = getClientDayPosts(dateStr);
        const filtered = filterClientByStatus(dayPosts);
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

        html += `<div class="bg-white border rounded-lg p-1 cal-day-cell ${canCreate ? 'cal-day-clickable' : ''} ${isToday ? 'ring-2 ring-indigo-500' : ''}"
                      data-date="${dateStr}"
                      ${canCreate ? `onclick="onDayCellClick(event, '${dateStr}')"` : ''}
                      ondragover="onClientDayDragOver(event)" ondragleave="onClientDayDragLeave(event)" ondrop="onClientDayDrop(event, '${dateStr}')">
            <div class="flex justify-between items-center mb-1">
                <span class="font-semibold text-xs ${isToday ? 'text-indigo-600' : ''}">${day}</span>
                <div class="flex items-center gap-0.5">
                    ${currentUser?.is_super_admin ? `<button class="cal-pin-btn" onclick="event.stopPropagation(); openPinPopover(this, '${dateStr}')" title="Add pin">
                        <i class="fa-solid fa-thumbtack"></i>
                    </button>` : ''}
                    ${canCreate ? `<button class="cal-add-btn" onclick="event.stopPropagation(); openCreatePostModal('${dateStr}')" title="Add post">
                        <i class="fa-solid fa-plus"></i>
                    </button>` : ''}
                </div>
            </div>
            ${renderCalPins(dateStr)}
            ${filtered.slice(0, 3).map(p => renderCalendarMiniCard(p)).join('')}
            ${filtered.length > 3 ? `<div class="text-[10px] text-indigo-600 font-semibold text-center cursor-pointer" onclick="event.stopPropagation(); showClientDayPosts('${dateStr}')">+${filtered.length - 3} more</div>` : ''}
        </div>`;
    }
    document.getElementById('client-calendar-grid').innerHTML = html;
}

// ========== CALENDAR PINS ==========

const PIN_TYPE_META = {
    post:  { icon: 'fa-solid fa-image',       label: 'Post',  color: '#6366f1' },
    story: { icon: 'fa-solid fa-clock-rotate-left', label: 'Story', color: '#ec4899' },
    reel:  { icon: 'fa-solid fa-film',         label: 'Reel',  color: '#a855f7' },
    video: { icon: 'fa-solid fa-video',        label: 'Video', color: '#ef4444' },
};

function renderCalPins(dateStr) {
    const pins = clientCalPins[dateStr];
    if (!pins || !pins.length) return '';
    return pins.map(p => {
        const m = PIN_TYPE_META[p.content_type] || PIN_TYPE_META.post;
        const del = currentUser?.is_super_admin
            ? `<span class="cal-pin-del" onclick="event.stopPropagation(); deleteCalPin(${p.id})" title="Remove pin">&times;</span>`
            : '';
        const noteAttr = p.note ? ` title="${esc(p.note)}"` : '';
        return `<div class="cal-pin-badge" style="--pin-color:${m.color}"${noteAttr}>
            <i class="${m.icon} cal-pin-icon"></i><span class="cal-pin-label">${m.label}</span>${del}
        </div>`;
    }).join('');
}

function openPinPopover(btn, dateStr) {
    closePinPopover();
    const rect = btn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'cal-pin-popover';
    pop.className = 'cal-pin-popover';
    pop.innerHTML = `
        <div class="cal-pin-popover-title">Pin content for ${dateStr}</div>
        <div class="cal-pin-types">
            ${Object.entries(PIN_TYPE_META).map(([k, v]) =>
                `<button class="cal-pin-type-opt" data-type="${k}" onclick="selectPinType(this)">
                    <i class="${v.icon}" style="color:${v.color}"></i> ${v.label}
                </button>`
            ).join('')}
        </div>
        <input type="text" id="pin-note-input" class="cal-pin-note-input" placeholder="Optional note..." maxlength="100">
        <button class="cal-pin-submit" onclick="submitCalPin('${dateStr}')">Pin it</button>
    `;
    document.body.appendChild(pop);
    // Position near the button
    const popW = 220, popH = 220;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 4;
    if (left + popW > window.innerWidth) left = window.innerWidth - popW - 8;
    if (top + popH > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - popH - 4;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.dataset.date = dateStr;
    setTimeout(() => document.addEventListener('click', onPinPopoverOutside), 0);
}

function closePinPopover() {
    const el = document.getElementById('cal-pin-popover');
    if (el) el.remove();
    document.removeEventListener('click', onPinPopoverOutside);
}

function onPinPopoverOutside(e) {
    const pop = document.getElementById('cal-pin-popover');
    if (pop && !pop.contains(e.target)) closePinPopover();
}

function selectPinType(btn) {
    btn.closest('.cal-pin-types').querySelectorAll('.cal-pin-type-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

async function submitCalPin(dateStr) {
    const pop = document.getElementById('cal-pin-popover');
    if (!pop) return;
    const sel = pop.querySelector('.cal-pin-type-opt.selected');
    if (!sel) { showToast('Select a content type', 'error'); return; }
    const content_type = sel.dataset.type;
    const note = (pop.querySelector('#pin-note-input')?.value || '').trim();
    closePinPopover();
    const res = await apiFetch(`${API_URL}/calendar/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, pinned_date: dateStr, content_type, note })
    });
    if (res && res.success) {
        showToast('Pin added', 'success');
        loadClientCalendar();
    } else {
        showToast(res?.error || 'Failed to add pin', 'error');
    }
}

async function deleteCalPin(pinId) {
    const res = await apiFetch(`${API_URL}/calendar/pins/${pinId}`, { method: 'DELETE' });
    if (res && res.success) {
        showToast('Pin removed', 'success');
        loadClientCalendar();
    } else {
        showToast(res?.error || 'Failed to remove pin', 'error');
    }
}

function changeClientMonth(delta) {
    clientMonth.setMonth(clientMonth.getMonth() + delta);
    loadClientCalendar();
}

// ========== DAY POSTS MODAL ==========

function showClientDayPosts(dateStr) {
    const posts = filterClientByStatus(getClientDayPosts(dateStr));
    const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    let html = `<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="client-day-posts-modal" onclick="if(event.target===this) this.remove()">
        <div class="bg-white rounded-xl p-6 w-[95%] sm:w-[600px] max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold"><i class="fa-solid fa-calendar-day text-indigo-600 mr-2"></i>${esc(dayName)}</h3>
                <button onclick="document.getElementById('client-day-posts-modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div class="space-y-3">`;
    if (posts.length === 0) {
        html += '<p class="text-gray-500 text-center py-8">No posts</p>';
    } else {
        posts.forEach(p => {
            const status = getPostStatus(p);
            const color = getStatusColor(status);
            html += `<div class="border-l-4 rounded-xl p-4 hover:shadow-md transition cursor-pointer bg-white" style="border-left-color:${color}" onclick="document.getElementById('client-day-posts-modal').remove(); openPostSlideView(${p.id});">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        ${getPlatformIcon(p.platforms)} ${getContentTypeIcon(p.post_type)}
                        <div><p class="font-semibold text-sm">${esc(getTopicPreview(p.topic, 60) || 'Untitled')}</p><p class="text-xs text-gray-400">${esc(p.client_name || '')}</p></div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${status}</span>
                </div>
                <div class="text-xs text-gray-400 mt-1"><i class="fa-regular fa-clock mr-1"></i>${(p.scheduled_at || p.created_at || '').replace('T', ' ')}</div>
            </div>`;
        });
    }
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
}

// ========== DAY CELL CLICK ==========

function onDayCellClick(event, dateStr) {
    if (event.target.closest('.cal-mini-card') || event.target.closest('.cal-add-btn') || event.target.closest('.cal-pin-btn') || event.target.closest('.cal-pin-badge')) return;
    if (!canDo('createPost')) return;
    openCreatePostModal(dateStr);
}

// Redirect from shared renderCalendarMiniCard onclick
function openClientPostDetail(postId) {
    openPostSlideView(postId);
}

// ========== CALENDAR DRAG & DROP ==========

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
        showToast('No posts in "Needs Design" status on this day', 'error');
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
        if (slideViewPostId === postId) openPostSlideView(postId);
    }
}

if (typeof onCardDragStart === 'undefined') {
    window.onCardDragStart = function(e, postId) {
        clientDraggedPostId = postId;
        e.dataTransfer.setData('text/plain', postId);
        e.dataTransfer.effectAllowed = 'move';
    };
}

// ========== PLATFORM MULTI-SELECT HELPERS ==========

function getSelectedPlatforms() {
    return Array.from(document.querySelectorAll('#cp-platforms input:checked')).map(cb => cb.value);
}

function setSelectedPlatforms(platforms) {
    const list = (platforms || '').split(',').map(s => s.trim()).filter(Boolean);
    document.querySelectorAll('#cp-platforms input').forEach(cb => {
        cb.checked = list.includes(cb.value);
    });
}

function clearSelectedPlatforms() {
    document.querySelectorAll('#cp-platforms input').forEach(cb => { cb.checked = false; });
}

// ========== CAROUSEL SLIDES EDITOR ==========

function isCarouselSelected() {
    return document.getElementById('cp-post-type').value === 'carousel';
}

function isGridSelected() {
    return document.getElementById('cp-post-type').value === 'grid';
}

function isMultiSlideType() {
    return isCarouselSelected() || isGridSelected();
}

function toggleCarouselSlidesUI() {
    const isCarousel = isCarouselSelected();
    const isGrid = isGridSelected();
    const multiSlide = isCarousel || isGrid;
    const postType = (document.getElementById('cp-post-type')?.value || 'post').toLowerCase();
    const tovContainer = document.getElementById('cp-tov-container');
    const slidesContainer = document.getElementById('cp-slides-container');
    const captionContainer = document.getElementById('cp-caption-container');
    const addSlideBtn = slidesContainer?.querySelector('button[onclick="addCarouselSlide()"]');
    const slideHint = slidesContainer?.querySelector('p.text-\\[11px\\]');
    if (multiSlide) {
        tovContainer.classList.add('hidden');
        slidesContainer.classList.remove('hidden');
        if (isGrid) {
            // Grid: exactly 3 slides with caption fields — only reset if not already loaded (e.g. from edit)
            if (carouselSlides.length !== 3 || !carouselSlides.some(s => (s.text && s.text.trim()) || (s.caption && s.caption.trim()))) {
                carouselSlides = [{ text: '', caption: '' }, { text: '', caption: '' }, { text: '', caption: '' }];
            }
            if (addSlideBtn) addSlideBtn.style.display = 'none';
            if (slideHint) slideHint.textContent = 'Grid posts always have exactly 3 posts';
            // Hide the shared caption field — grid has per-post captions
            if (captionContainer) captionContainer.style.display = 'none';
        } else {
            // Carousel
            if (carouselSlides.length < 2) {
                carouselSlides = [{ text: '' }, { text: '' }];
            }
            if (addSlideBtn) addSlideBtn.style.display = '';
            if (slideHint) slideHint.innerHTML = '<i class="fa-solid fa-circle-info mr-1"></i>Minimum 2 slides for a carousel post';
        }
        renderCarouselSlides();
    } else {
        tovContainer.classList.remove('hidden');
        slidesContainer.classList.add('hidden');
        if (addSlideBtn) addSlideBtn.style.display = '';
    }
    // Hide caption for stories/banners/brochures — only text on design matters
    // Grid also hides shared caption (per-post captions in slides)
    if (captionContainer && !isGrid) {
        captionContainer.style.display = ['story', 'banner', 'brochure'].includes(postType) ? 'none' : '';
    }
}

function renderCarouselSlides() {
    const list = document.getElementById('cp-slides-list');
    const isGrid = isGridSelected();
    list.innerHTML = carouselSlides.map((slide, i) => `
        <div class="cp-slide-card">
            <div class="cp-slide-number">${isGrid ? 'Post' : 'Slide'} ${i + 1}</div>
            <textarea rows="2" placeholder="Text on design for ${isGrid ? 'post' : 'slide'} ${i + 1}..." oninput="onCarouselSlideInput(${i}, this.value)">${esc(slide.text || '')}</textarea>
            ${isGrid ? `<textarea rows="2" class="mt-1" placeholder="Caption for post ${i + 1}..." oninput="onGridSlideCaptionInput(${i}, this.value)" style="border-top:1px dashed #e5e7eb;padding-top:6px">${esc(slide.caption || '')}</textarea>` : ''}
            ${!isGrid && carouselSlides.length > 2 ? `<button type="button" class="cp-slide-delete" onclick="removeCarouselSlide(${i})" title="Remove slide"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        </div>
    `).join('');
}

function onGridSlideCaptionInput(i, val) {
    if (carouselSlides[i]) carouselSlides[i].caption = val;
    updateSlidePreview();
}

function addCarouselSlide() {
    carouselSlides.push({ text: '' });
    renderCarouselSlides();
    updateSlidePreview();
}

function removeCarouselSlide(i) {
    if (carouselSlides.length <= 2) { showToast('Minimum 2 slides required', 'error'); return; }
    carouselSlides.splice(i, 1);
    renderCarouselSlides();
    updateSlidePreview();
}

function onCarouselSlideInput(i, val) {
    if (carouselSlides[i]) carouselSlides[i].text = val;
    updateSlidePreview();
}

function getCarouselSlidesData() {
    const isGrid = isGridSelected();
    if (isGrid) {
        return JSON.stringify(carouselSlides.map(s => ({ text: s.text || '', caption: s.caption || '' })));
    }
    return JSON.stringify(carouselSlides.map(s => ({ text: s.text || '' })));
}

// ========== CREATE POST MODAL ==========

function openCreatePostModal(dateStr) {
    if (!canDo('createPost')) { showToast('You do not have permission to create posts', 'error'); return; }
    document.getElementById('cp-edit-id').value = '';
    document.getElementById('create-post-title').textContent = 'Create Post';
    document.getElementById('cp-date').value = dateStr || '';
    clearSelectedPlatforms();
    document.getElementById('cp-post-type').value = 'post';
    document.getElementById('cp-time').value = '12:00';
    document.getElementById('cp-tov').value = '';
    document.getElementById('cp-caption').value = '';
    document.getElementById('cp-notes').value = '';
    carouselSlides = [];
    document.getElementById('cp-slides-container').classList.add('hidden');
    document.getElementById('cp-tov-container').classList.remove('hidden');
    createPostRefFiles = [];
    createPostDesignFiles = [];
    document.getElementById('cp-ref-previews').innerHTML = '';
    document.getElementById('cp-ref-input').value = '';
    document.getElementById('cp-design-previews').innerHTML = '';
    // Show admin-only sections
    const isAdmin = currentUser?.role === 'admin';
    document.getElementById('cp-design-upload-section').classList.toggle('hidden', !isAdmin);
    document.getElementById('cp-btn-post-directly').classList.toggle('hidden', !isAdmin);
    updateSlidePreview();
    document.getElementById('create-post-modal').classList.remove('hidden');
}

function closeCreatePostModal() {
    document.getElementById('create-post-modal').classList.add('hidden');
    createPostRefFiles = [];
    createPostDesignFiles = [];
}

function updateSlidePreview() {
    const isCarousel = isCarouselSelected();
    const isGrid = isGridSelected();
    const multiSlide = isCarousel || isGrid;
    const tov = multiSlide ? '' : document.getElementById('cp-tov').value.trim();
    const caption = isGrid ? '' : document.getElementById('cp-caption').value.trim();
    const notes = document.getElementById('cp-notes').value.trim();
    const platforms = getSelectedPlatforms();
    const postType = document.getElementById('cp-post-type').value;
    const date = document.getElementById('cp-date').value;

    const hasSlideContent = multiSlide && carouselSlides.some(s => (s.text && s.text.trim()) || (s.caption && s.caption.trim()));
    if (!tov && !hasSlideContent && !caption && !notes && createPostRefFiles.length === 0 && platforms.length === 0) {
        document.getElementById('cp-slide-preview').innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Start typing to see preview...</p>';
        return;
    }

    let html = '';

    // Header badges
    html += '<div class="pres-slide-header" style="direction:ltr">';
    if (date) {
        html += `<span class="pres-date">${new Date(date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}</span>`;
    }
    platforms.forEach(p => {
        html += `<span class="pres-badge bg-gray-100 text-gray-700">${getPlatformIcon(p)} ${esc(p)}</span>`;
    });
    html += `<span class="pres-badge bg-gray-100 text-gray-700">${getContentTypeIcon(postType)} ${esc(postType)}</span>`;
    html += '</div>';

    // Grid: per-post preview with text + caption
    if (isGrid && carouselSlides.length > 0) {
        carouselSlides.forEach((slide, i) => {
            if ((slide.text && slide.text.trim()) || (slide.caption && slide.caption.trim())) {
                html += `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fafafa">`;
                html += `<div style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;margin-bottom:6px"><i class="fa-solid fa-grip mr-1"></i>Post ${i + 1}</div>`;
                if (slide.text && slide.text.trim()) {
                    const tDir = isRTL(slide.text) ? 'rtl' : 'ltr';
                    html += `<div class="pres-tov-block" dir="${tDir}" style="text-align:${tDir === 'rtl' ? 'right' : 'left'};font-size:15px;padding:10px 12px;margin-bottom:6px">`;
                    html += `<div class="pres-tov-label">Text on Design</div>`;
                    html += `<div>${esc(slide.text)}</div>`;
                    html += '</div>';
                }
                if (slide.caption && slide.caption.trim()) {
                    const cDir = isRTL(slide.caption) ? 'rtl' : 'ltr';
                    html += `<div class="pres-caption-block" dir="${cDir}" style="text-align:${cDir === 'rtl' ? 'right' : 'left'};font-size:14px;padding:8px 12px;margin:0">`;
                    html += `<div class="pres-caption-label">Caption</div>`;
                    html += `<div>${esc(slide.caption)}</div>`;
                    html += '</div>';
                }
                html += '</div>';
            }
        });
    }

    // Carousel: per-slide preview cards
    if (isCarousel && carouselSlides.length > 0) {
        carouselSlides.forEach((slide, i) => {
            if (slide.text && slide.text.trim()) {
                const slideDir = isRTL(slide.text) ? 'rtl' : 'ltr';
                html += `<div class="pres-tov-block" dir="${slideDir}" style="text-align:${slideDir === 'rtl' ? 'right' : 'left'};font-size:16px;padding:14px 16px;margin-bottom:8px">`;
                html += `<div class="pres-tov-label">Slide ${i + 1}</div>`;
                html += `<div>${esc(slide.text)}</div>`;
                html += '</div>';
            }
        });
    }

    // TOV block (indigo gradient) — only for non-multi-slide
    if (!multiSlide && tov) {
        const tovDir = isRTL(tov) ? 'rtl' : 'ltr';
        html += `<div class="pres-tov-block" dir="${tovDir}" style="text-align:${tovDir === 'rtl' ? 'right' : 'left'}">`;
        html += '<div class="pres-tov-label">Text on Design</div>';
        html += `<div>${esc(tov)}</div>`;
        html += '</div>';
    }

    // Reference previews
    if (createPostRefFiles.length > 0) {
        html += '<div class="pres-images-grid">';
        html += '<div class="pres-img-label">References</div>';
        createPostRefFiles.forEach(f => {
            if (f._previewUrl) {
                html += `<img class="pres-ref-img" src="${f._previewUrl}" alt="Ref">`;
            }
        });
        html += '</div>';
    }

    // Caption (not for grid — grid has per-post captions)
    if (caption && !isGrid) {
        const cDir = isRTL(caption) ? 'rtl' : 'ltr';
        html += `<div class="pres-caption-block" dir="${cDir}" style="text-align:${cDir === 'rtl' ? 'right' : 'left'}">`;
        html += '<div class="pres-caption-label">Caption</div>';
        html += `<div>${esc(caption)}</div>`;
        html += '</div>';
    }

    // Notes
    if (notes) {
        const nDir = isRTL(notes) ? 'rtl' : 'ltr';
        html += `<div class="pres-notes-block" dir="${nDir}" style="text-align:${nDir === 'rtl' ? 'right' : 'left'}">`;
        html += '<div class="pres-notes-label">Notes for Designer</div>';
        html += `<div>${esc(notes)}</div>`;
        html += '</div>';
    }

    document.getElementById('cp-slide-preview').innerHTML = html;
}

function previewRefImages(files) {
    for (const file of files) {
        file._previewUrl = URL.createObjectURL(file);
        createPostRefFiles.push(file);
    }
    renderRefPreviews();
    updateSlidePreview();
}

function renderRefPreviews() {
    const container = document.getElementById('cp-ref-previews');
    container.innerHTML = createPostRefFiles.map((f, i) => `
        <div class="relative">
            <img src="${f._previewUrl}" class="w-16 h-16 object-cover rounded-lg border">
            <button onclick="removeRefPreview(${i})" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
        </div>
    `).join('');
}

function removeRefPreview(i) {
    if (createPostRefFiles[i]?._previewUrl) URL.revokeObjectURL(createPostRefFiles[i]._previewUrl);
    createPostRefFiles.splice(i, 1);
    renderRefPreviews();
    updateSlidePreview();
}

function previewDesignFiles(files) {
    for (const file of files) {
        file._previewUrl = URL.createObjectURL(file);
        createPostDesignFiles.push(file);
    }
    renderDesignPreviews();
}

function renderDesignPreviews() {
    const container = document.getElementById('cp-design-previews');
    container.innerHTML = createPostDesignFiles.map((f, i) => {
        const isVideo = f.type?.startsWith('video/');
        return `<div class="relative">
            ${isVideo
                ? `<video src="${f._previewUrl}" class="w-16 h-16 object-cover rounded-lg border"></video>`
                : `<img src="${f._previewUrl}" class="w-16 h-16 object-cover rounded-lg border">`}
            <button onclick="removeDesignPreview(${i})" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
        </div>`;
    }).join('');
}

function removeDesignPreview(i) {
    if (createPostDesignFiles[i]?._previewUrl) URL.revokeObjectURL(createPostDesignFiles[i]._previewUrl);
    createPostDesignFiles.splice(i, 1);
    renderDesignPreviews();
}

async function submitCreatePost(workflowStatus) {
    const editId = document.getElementById('cp-edit-id').value;
    const date = document.getElementById('cp-date').value;
    const time = document.getElementById('cp-time').value || '12:00';
    const platforms = getSelectedPlatforms();
    const postType = document.getElementById('cp-post-type').value;
    const caption = document.getElementById('cp-caption').value.trim();
    const notes = document.getElementById('cp-notes').value.trim();
    const isCarousel = postType === 'carousel';
    const isGrid = postType === 'grid';
    const multiSlide = isCarousel || isGrid;
    const isAdminDirect = workflowStatus === 'posted' && canDo('manageClients');

    if (!date) { showToast('Please select a date', 'error'); return; }
    if (platforms.length === 0) { showToast('Please select at least one platform', 'error'); return; }

    // Admin direct upload: require design files, TOV is optional
    if (isAdminDirect && createPostDesignFiles.length === 0) {
        showToast('Please upload at least one design or video', 'error'); return;
    }

    let topicValue;
    if (multiSlide) {
        if (isGrid && carouselSlides.length !== 3) { showToast('Grid requires exactly 3 posts', 'error'); return; }
        if (isCarousel && carouselSlides.length < 2) { showToast('Carousel requires at least 2 slides', 'error'); return; }
        const hasContent = carouselSlides.some(s => s.text && s.text.trim());
        if (!hasContent && !isAdminDirect) { showToast('Please enter text for at least one ' + (isGrid ? 'post' : 'slide'), 'error'); return; }
        topicValue = getCarouselSlidesData();
    } else {
        topicValue = document.getElementById('cp-tov').value.trim();
        if (!topicValue && !isAdminDirect) { showToast('Please enter text on design / TOV', 'error'); return; }
    }

    const scheduledAt = date + 'T' + time + ':00';

    const postData = {
        client_id: clientId,
        platforms: platforms.join(','),
        post_type: postType,
        topic: topicValue,
        caption: caption,
        brief_notes: notes,
        scheduled_at: scheduledAt,
        workflow_status: workflowStatus,
        created_by_id: currentUser?.id || 1,
    };

    let postId;

    if (editId) {
        // Get current workflow status before updating
        const existing = clientPostsData.find(p => p.id === parseInt(editId));
        const currentWf = existing?.workflow_status || 'draft';
        const res = await apiFetch(`${API_URL}/posts/${editId}`, { method: 'PUT', body: postData });
        if (!res || !res.success) { showToast('Failed to update post', 'error'); return; }
        postId = parseInt(editId);
        // Only transition if target status differs from current
        if (workflowStatus !== 'draft' && workflowStatus !== currentWf) {
            await apiFetch(`${API_URL}/posts/${postId}/transition`, {
                method: 'POST',
                body: { status: workflowStatus, user_id: currentUser?.id || 1 }
            });
        }
    } else {
        const res = await apiFetch(`${API_URL}/clients/${clientId}/posts`, { method: 'POST', body: postData });
        if (!res || res.error) { showToast('Failed to create post', 'error'); return; }
        postId = res.id;
    }

    // Step 2: Upload reference images if any
    if (createPostRefFiles.length > 0 && postId) {
        const formData = new FormData();
        for (const file of createPostRefFiles) formData.append('images', file);
        if (currentUser) formData.append('user_id', currentUser.id);
        await apiFetch(`${API_URL}/posts/${postId}/upload-reference`, { method: 'POST', body: formData });
    }

    // Step 3: Upload design files if admin direct post
    if (createPostDesignFiles.length > 0 && postId) {
        const formData = new FormData();
        for (const file of createPostDesignFiles) formData.append('images', file);
        if (currentUser) formData.append('user_id', currentUser.id);
        await apiFetch(`${API_URL}/posts/${postId}/upload-design`, { method: 'POST', body: formData });
    }

    showToast(editId ? 'Post updated' : (isAdminDirect ? 'Post published directly' : 'Post created'), 'success');
    closeCreatePostModal();
    loadClientCalendar();
}

// ========== POST SLIDE DETAIL VIEW ==========

async function openPostSlideView(postId) {
    const post = await apiFetch(`${API_URL}/posts/${postId}`);
    if (!post || post.error) return;
    slideViewPostId = postId;

    const status = getPostStatus(post);
    const color = getStatusColor(status);
    const wf = post.workflow_status || 'draft';
    const dateStr = post.scheduled_at || post.created_at || '';
    const dateObj = dateStr ? new Date(dateStr) : null;
    const formattedDate = dateObj
        ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
        : 'Unscheduled';

    // Sticky header with badges
    document.getElementById('post-slide-header').innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${esc(status)}</span>
            <span class="px-3 py-1 rounded-full text-xs font-semibold ${getPlatformBgClass(post.platforms)}">${getPlatformIcon(post.platforms)} ${esc(post.platforms || '')}</span>
            ${post.post_type ? `<span class="px-3 py-1 rounded-full text-xs bg-gray-100 font-semibold">${getContentTypeIcon(post.post_type)} ${esc(post.post_type)}</span>` : ''}
            <span class="text-sm font-semibold text-gray-600">${esc(formattedDate)}</span>
        </div>
        <button onclick="closePostSlideModal()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
    `;

    // Body — presentation-style content
    let body = '';

    // TOV / Topic block (indigo gradient) — carousel/grid shows per-slide
    const topicParsed = parseTopic(post.topic || '');
    const isGridPost = (post.post_type || '').toLowerCase() === 'grid';
    if (topicParsed.isCarousel && topicParsed.slides.length > 0) {
        if (isGridPost) {
            // Grid: show each post with text on design + caption
            topicParsed.slides.forEach((slide, i) => {
                body += `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;background:#fafafa">`;
                body += `<div style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;margin-bottom:8px"><i class="fa-solid fa-grip mr-1"></i>Post ${i + 1}</div>`;
                if (slide.text && slide.text.trim()) {
                    const sDir = isRTL(slide.text) ? 'rtl' : 'ltr';
                    body += `<div class="pres-tov-block" dir="${sDir}" style="text-align:${sDir === 'rtl' ? 'right' : 'left'};font-size:16px;padding:12px 14px;margin-bottom:6px">`;
                    body += `<div class="pres-tov-label">Text on Design</div>`;
                    body += `<div>${esc(slide.text).replace(/\n/g, '<br>')}</div>`;
                    body += '</div>';
                }
                if (slide.caption && slide.caption.trim()) {
                    const cDir = isRTL(slide.caption) ? 'rtl' : 'ltr';
                    body += `<div class="pres-caption-block" dir="${cDir}" style="text-align:${cDir === 'rtl' ? 'right' : 'left'};font-size:14px;padding:10px 14px;margin:0">`;
                    body += `<div class="pres-caption-label">Caption</div>`;
                    body += `<div>${esc(slide.caption).replace(/\n/g, '<br>')}</div>`;
                    body += '</div>';
                }
                body += '</div>';
            });
        } else {
            // Carousel: show per-slide text
            topicParsed.slides.forEach((slide, i) => {
                if (slide.text && slide.text.trim()) {
                    const sDir = isRTL(slide.text) ? 'rtl' : 'ltr';
                    body += `<div class="pres-tov-block" dir="${sDir}" style="text-align:${sDir === 'rtl' ? 'right' : 'left'};font-size:18px;padding:16px 18px;margin-bottom:8px">`;
                    body += `<div class="pres-tov-label">Slide ${i + 1}</div>`;
                    body += `<div>${esc(slide.text).replace(/\n/g, '<br>')}</div>`;
                    body += '</div>';
                }
            });
        }
    } else if (post.topic) {
        const topicDir = isRTL(post.topic) ? 'rtl' : 'ltr';
        body += `<div class="pres-tov-block" dir="${topicDir}" style="text-align:${topicDir === 'rtl' ? 'right' : 'left'}">`;
        body += `<div class="pres-tov-label" style="display:flex;justify-content:space-between;align-items:center">Text on Design / Topic <button onclick="copyToClipboard(\`${esc(post.topic).replace(/`/g, '\\`').replace(/\\/g, '\\\\')}\`)" class="text-xs text-indigo-300 hover:text-white" title="Copy"><i class="fa-solid fa-copy"></i></button></div>`;
        body += `<div>${esc(post.topic).replace(/\n/g, '<br>')}</div>`;
        body += '</div>';
    }

    // Caption (hidden for stories/banners/brochures — only text on design matters)
    // Grid posts have per-post captions in the topic JSON
    if (post.caption && !['story', 'banner', 'brochure', 'grid'].includes(post.post_type)) {
        const capDir = isRTL(post.caption) ? 'rtl' : 'ltr';
        body += `<div class="pres-caption-block" dir="${capDir}" style="text-align:${capDir === 'rtl' ? 'right' : 'left'}">`;
        body += `<div class="pres-caption-label" style="display:flex;justify-content:space-between;align-items:center">Caption <button onclick="copyToClipboard(decodeURIComponent('${encodeURIComponent(post.caption)}'))" class="text-xs text-green-300 hover:text-white" title="Copy caption"><i class="fa-solid fa-copy"></i></button></div>`;
        body += `<div>${esc(post.caption).replace(/\n/g, '<br>')}</div>`;
        body += '</div>';
    }

    // Notes
    if (post.brief_notes) {
        const notesDir = isRTL(post.brief_notes) ? 'rtl' : 'ltr';
        body += `<div class="pres-notes-block" dir="${notesDir}" style="text-align:${notesDir === 'rtl' ? 'right' : 'left'}">`;
        body += '<div class="pres-notes-label">Notes for Designer</div>';
        body += `<div>${esc(post.brief_notes).replace(/\n/g, '<br>')}</div>`;
        body += '</div>';
    }

    // Reference images (after notes)
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    const canUploadRefs = canDo('uploadRef') && wf !== 'posted';
    if (refUrls.length || canUploadRefs) {
        body += '<div class="pres-images-grid">';
        body += '<div class="pres-img-label">Design References</div>';
        refUrls.forEach((u, i) => {
            const url = u.trim();
            body += `<div style="position:relative;display:inline-block">`;
            body += `<img class="pres-ref-img" src="${url}" alt="Reference" onclick="window.open('${url}','_blank')">`;
            if (canUploadRefs) {
                body += `<button onclick="event.stopPropagation();deletePostReference(${post.id},${i})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600" style="position:absolute;top:2px;right:2px" title="Remove">&times;</button>`;
            }
            body += `</div>`;
        });
        body += '</div>';
        if (canUploadRefs) {
            body += `<div class="upload-zone p-3 rounded-lg text-center cursor-pointer text-sm text-gray-500 mt-2 mb-4" id="psd-ref-upload-zone"
                onclick="document.getElementById('psd-ref-input').click()"
                ondragover="event.preventDefault(); this.classList.add('dragover')"
                ondragleave="this.classList.remove('dragover')"
                ondrop="handlePsdRefDrop(event)">
                <i class="fa-solid fa-cloud-arrow-up text-lg mb-1 block text-blue-400"></i>
                Drop reference images here or click to upload
            </div>
            <input type="file" id="psd-ref-input" multiple accept="image/*" class="hidden" onchange="uploadPsdReferences(this.files)">`;
        }
    }

    // Design output (last section before comments)
    const designUrls = (post.design_output_urls || '').split(',').filter(u => u.trim());
    if (designUrls.length) {
        const isCarousel = ((post.post_type || '').toLowerCase() === 'carousel' || (post.post_type || '').toLowerCase() === 'grid') && designUrls.length > 1;
        if (isCarousel) {
            body += `<div class="pres-img-label" style="margin-bottom:8px">Design Output</div>`;
            body += `<div class="carousel-preview" id="psd-carousel" style="border-radius:12px;margin-bottom:8px">`;
            designUrls.forEach((u, i) => {
                const url = u.trim();
                body += isVideoUrl(url)
                    ? `<video src="${url}" data-slide="${i}" style="display:${i===0?'block':'none'};cursor:pointer" muted playsinline preload="metadata" onclick="window.open('${url}','_blank')"></video>`
                    : `<img src="${url}" alt="Slide ${i+1}" data-slide="${i}" style="display:${i===0?'block':'none'};cursor:pointer" onclick="window.open('${url}','_blank')">`;
            });
            body += `<div class="carousel-nav prev" onclick="event.stopPropagation();carouselNav(-1)"><i class="fa-solid fa-chevron-left"></i></div>`;
            body += `<div class="carousel-nav next" onclick="event.stopPropagation();carouselNav(1)"><i class="fa-solid fa-chevron-right"></i></div>`;
            body += `<div class="carousel-dots" id="psd-carousel-dots">`;
            designUrls.forEach((u, i) => {
                body += `<div class="carousel-dot ${i===0?'active':''}" onclick="event.stopPropagation();carouselGoTo(${i})"></div>`;
            });
            body += `</div>`;
            body += `</div>`;
            body += `<div class="text-center text-xs text-gray-500 mb-2" id="psd-carousel-counter">Slide 1 of ${designUrls.length}</div>`;
            const canDeleteSlide = canDo('uploadDesign') && ['in_design', 'approved'].includes(wf);
            body += `<div class="flex flex-wrap gap-2 mb-4" id="psd-carousel-thumbs">`;
            designUrls.forEach((u, i) => {
                const url = u.trim();
                body += `<div class="relative" style="width:64px;height:64px">`;
                body += isVideoUrl(url)
                    ? `<video src="${url}" class="w-full h-full object-cover rounded-lg border cursor-pointer ${i===0?'ring-2 ring-indigo-500':''}" data-thumb="${i}" muted playsinline preload="metadata" onclick="carouselGoTo(${i})"></video>`
                    : `<img src="${url}" class="w-full h-full object-cover rounded-lg border cursor-pointer ${i===0?'ring-2 ring-indigo-500':''}" data-thumb="${i}" onclick="carouselGoTo(${i})">`;
                if (canDeleteSlide) {
                    body += `<button onclick="event.stopPropagation();deleteCarouselSlide(${post.id},${i})" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>`;
                }
                body += `</div>`;
            });
            body += `</div>`;
        } else {
            const canDeleteDesign = canDo('uploadDesign') && ['in_design', 'approved'].includes(wf);
            body += '<div class="pres-images-grid">';
            body += '<div class="pres-img-label">Design Output</div>';
            designUrls.forEach((u, i) => {
                const url = u.trim();
                body += `<div class="design-item-wrap pres-design-wrap">`;
                body += isVideoUrl(url)
                    ? `<video class="pres-design-img" src="${url}" muted playsinline preload="metadata" onclick="window.open('${url}','_blank')"></video>`
                    : `<img class="pres-design-img" src="${url}" alt="Design" onclick="window.open('${url}','_blank')">`;
                body += `<a href="${url}" download="design-${i + 1}" class="design-download-btn" title="Download"><i class="fa-solid fa-download"></i></a>`;
                if (canDeleteDesign) {
                    body += `<button onclick="event.stopPropagation();deleteCarouselSlide(${post.id},${i})" class="design-remove-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>`;
                }
                body += `</div>`;
            });
            body += '</div>';
        }
    }

    // Designer upload zone (conditional: in_design/approved + can upload design)
    if (['in_design', 'approved'].includes(wf) && canDo('uploadDesign')) {
        const postType = (post.post_type || '').toLowerCase();
        const isMotion = currentUser?.role === 'motion_designer';
        const isDesigner = currentUser?.role === 'designer';
        const showUpload = (!isMotion && !isDesigner) || (isMotion && ['video', 'reel'].includes(postType)) || (isDesigner && ['post', 'story', 'carousel', 'grid', 'banner', 'brochure'].includes(postType));

        if (showUpload) {
            body += `<div class="upload-zone p-4 rounded-lg text-center cursor-pointer text-sm text-gray-500 mb-4" id="psd-upload-zone"
                         onclick="document.getElementById('psd-design-input').click()"
                         ondragover="event.preventDefault(); this.classList.add('dragover')"
                         ondragleave="this.classList.remove('dragover')"
                         ondrop="handlePsdDesignDrop(event)">
                <i class="fa-solid fa-cloud-arrow-up text-2xl mb-1 block text-indigo-400"></i>
                Drop designs here or click to upload
            </div>
            <input type="file" id="psd-design-input" multiple accept="image/*,video/*" class="hidden" onchange="uploadPsdDesign(this.files)">`;
        }
    }

    // Comments chat section
    body += `<div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px"><i class="fa-solid fa-comments text-indigo-500 mr-1"></i> Comments</div>
        <div id="slide-comments-list" class="post-chat-list"></div>
        <div class="post-chat-input-row">
            <input type="text" id="slide-comment-input" class="post-chat-input" placeholder="Write a comment..." onkeydown="if(event.key==='Enter')sendSlideComment()">
            <button onclick="sendSlideComment()" class="post-chat-send"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
    </div>`;

    document.getElementById('post-slide-body').innerHTML = body;

    // Role-based action buttons
    document.getElementById('post-slide-actions').innerHTML = buildPostSlideActions(post);

    document.getElementById('post-slide-modal').classList.remove('hidden');
    loadSlideComments(post.id);
    initMentionAutocomplete(document.getElementById('slide-comment-input'));
}

function closePostSlideModal() {
    document.getElementById('post-slide-modal').classList.add('hidden');
    slideViewPostId = null;
}

// ========== SLIDE COMMENTS (Chat) ==========

async function loadSlideComments(postId) {
    const list = document.getElementById('slide-comments-list');
    if (!list) return;
    list.innerHTML = '<p class="text-gray-400 text-center text-xs py-2">Loading...</p>';
    const data = await fetch(`${API_URL}/posts/${postId}/comments`).then(r => r.json()).catch(() => []);
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-center text-xs py-3">No comments yet</p>';
        return;
    }
    const myId = currentUser?.id;
    list.innerHTML = data.map(c => {
        const isMine = c.user_id === myId;
        const time = c.created_at ? new Date(c.created_at + (c.created_at.includes('Z') ? '' : 'Z')).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const typeIcon = c.comment_type === 'rejection' ? '<i class="fa-solid fa-rotate-left text-red-400 mr-1"></i>' :
                         c.comment_type === 'approval' ? '<i class="fa-solid fa-check text-green-400 mr-1"></i>' :
                         c.comment_type === 'edit' ? '<i class="fa-solid fa-pen text-amber-400 mr-1"></i>' : '';
        const contentHtml = c.comment_type === 'edit' ? renderEditComment(c.content) : highlightMentions(esc(c.content));
        return `<div class="post-chat-msg ${isMine ? 'post-chat-mine' : 'post-chat-other'}">
            <div class="post-chat-bubble ${isMine ? 'post-chat-bubble-mine' : 'post-chat-bubble-other'} ${c.comment_type === 'edit' ? 'post-chat-edit' : ''}">
                <div class="post-chat-name">${esc(c.user_name || 'User')}</div>
                <div class="post-chat-text">${typeIcon}${contentHtml}</div>
                <div class="post-chat-time">${time}</div>
            </div>
        </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
}

async function sendSlideComment() {
    const input = document.getElementById('slide-comment-input');
    if (!input || !input.value.trim() || !slideViewPostId) return;
    const content = input.value.trim();
    input.value = '';
    await apiFetch(`${API_URL}/posts/${slideViewPostId}/comments`, {
        method: 'POST',
        body: { content, user_id: currentUser?.id || 1, comment_type: 'comment' }
    });
    loadSlideComments(slideViewPostId);
}

async function clientMarkAsPosted(postId) {
    if (!confirm('Mark this post as published?')) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'posted', user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast('Post marked as posted', 'success');
        closePostSlideModal();
        if (typeof loadClientCalendar === 'function') loadClientCalendar();
        if (typeof loadClientPosts === 'function') loadClientPosts();
    } else {
        showToast(res?.error || 'Failed', 'error');
    }
}

async function deletePostFromSlide(postId) {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}`, { method: 'DELETE' });
    if (res && res.success) {
        showToast('Post deleted', 'success');
        closePostSlideModal();
        if (typeof loadClientCalendar === 'function') loadClientCalendar();
        if (typeof loadCalendar === 'function') loadCalendar();
        if (typeof loadClientPosts === 'function') loadClientPosts();
    } else {
        showToast(res?.error || 'Delete failed', 'error');
    }
}

function buildPostSlideActions(post) {
    const wf = post.workflow_status || 'draft';
    let actions = '';

    // Edit button — available at any stage before posted
    if (wf !== 'posted' && canDo('createPost')) {
        actions += `<button onclick="editPostInModal(${post.id})" class="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700"><i class="fa-solid fa-pen mr-1"></i> Edit</button>`;
    }

    // Draft: SMM/admin can send for review
    if (wf === 'draft' && canDo('createPost')) {
        actions += `<button onclick="clientTransitionPost(${post.id}, 'pending_review')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-paper-plane mr-1"></i> Send for Review</button>`;
    }

    // Pending Review: manager/admin can approve and send to design, or return to draft
    if (wf === 'pending_review' && canDo('approve')) {
        actions += `<button onclick="clientTransitionPost(${post.id}, 'in_design')" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fa-solid fa-palette mr-1"></i> Approve & Send to Design</button>`;
        actions += `<button onclick="clientReturnToDraft(${post.id})" class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600"><i class="fa-solid fa-rotate-left mr-1"></i> Return to Draft</button>`;
    }

    // In Design / Approved: designer/motion_designer can upload designs
    if (['in_design', 'approved'].includes(wf) && canDo('uploadDesign')) {
        const postType = (post.post_type || '').toLowerCase();
        const isMotion = currentUser?.role === 'motion_designer';
        const isDesigner = currentUser?.role === 'designer';
        const showActions = (!isMotion && !isDesigner) || (isMotion && ['video', 'reel'].includes(postType)) || (isDesigner && ['post', 'story', 'carousel', 'grid', 'banner', 'brochure'].includes(postType));

        if (showActions) {
            actions += `<button onclick="document.getElementById('psd-design-input')?.click()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700"><i class="fa-solid fa-upload mr-1"></i> Upload Design</button>`;
            if (wf === 'in_design') actions += `<button onclick="clientTransitionPost(${post.id}, 'approved')" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"><i class="fa-solid fa-check mr-1"></i> Mark as Done</button>`;
        }
    }

    // In Design: admin can return for review
    if (wf === 'in_design' && currentUser?.role === 'admin') {
        actions += `<button onclick="clientTransitionPost(${post.id}, 'pending_review')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-rotate-left mr-1"></i> Return for Review</button>`;
    }

    // Approved: moderator/admin can schedule
    if (wf === 'approved' && canDo('schedule')) {
        actions += `<button onclick="openSchedulePicker(${post.id})" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><i class="fa-solid fa-calendar-check mr-1"></i> Schedule Post</button>`;
    }

    // Mark as Posted — for moderator/admin on scheduled or approved posts
    if (['scheduled', 'approved'].includes(wf) && canDo('markPosted')) {
        actions += `<button onclick="clientMarkAsPosted(${post.id})" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"><i class="fa-solid fa-check-double mr-1"></i> Mark as Posted</button>`;
    }

    // Delete button — for admin/managers on non-posted posts
    if (wf !== 'posted' && canDo('createPost')) {
        actions += `<button onclick="deletePostFromSlide(${post.id})" class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600"><i class="fa-solid fa-trash mr-1"></i> Delete</button>`;
    }

    return actions;
}

// ========== EDIT POST IN MODAL ==========

async function editPostInModal(postId) {
    if (!canDo('createPost')) { showToast('You do not have permission to edit posts', 'error'); return; }
    const post = await apiFetch(`${API_URL}/posts/${postId}`);
    if (!post || post.error) return;

    closePostSlideModal();

    document.getElementById('cp-edit-id').value = post.id;
    document.getElementById('create-post-title').textContent = 'Edit Post';
    setSelectedPlatforms(post.platforms || '');
    document.getElementById('cp-post-type').value = post.post_type || 'post';

    // Parse topic: carousel/grid JSON or plain text
    const topicParsed = parseTopic(post.topic || '');
    const editPostType = post.post_type || 'post';
    if (topicParsed.isCarousel) {
        if (editPostType === 'grid') {
            carouselSlides = topicParsed.slides.map(s => ({ text: s.text || '', caption: s.caption || '' }));
        } else {
            carouselSlides = topicParsed.slides.map(s => ({ text: s.text || '' }));
        }
        document.getElementById('cp-tov').value = '';
    } else {
        carouselSlides = [];
        document.getElementById('cp-tov').value = post.topic || '';
    }
    toggleCarouselSlidesUI();

    document.getElementById('cp-caption').value = post.caption || '';
    document.getElementById('cp-notes').value = post.brief_notes || '';

    const sa = post.scheduled_at || '';
    if (sa) {
        document.getElementById('cp-date').value = sa.substring(0, 10);
        document.getElementById('cp-time').value = sa.substring(11, 16) || '12:00';
    } else {
        document.getElementById('cp-date').value = '';
        document.getElementById('cp-time').value = '12:00';
    }

    createPostRefFiles = [];
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    document.getElementById('cp-ref-previews').innerHTML = refUrls.map(u => `
        <div class="relative">
            <img src="${u.trim()}" class="w-16 h-16 object-cover rounded-lg border">
        </div>
    `).join('');
    document.getElementById('cp-ref-input').value = '';

    updateSlidePreview();
    document.getElementById('create-post-modal').classList.remove('hidden');
}

// ========== SCHEDULE PICKER ==========

function openSchedulePicker(postId) {
    document.getElementById('sp-post-id').value = postId;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('sp-datetime').value = now.toISOString().slice(0, 16);
    document.getElementById('schedule-picker-modal').classList.remove('hidden');
}

function closeSchedulePicker() {
    document.getElementById('schedule-picker-modal').classList.add('hidden');
}

async function confirmSchedulePost() {
    const postId = document.getElementById('sp-post-id').value;
    const dt = document.getElementById('sp-datetime').value;
    if (!dt) { showToast('Please select a date and time', 'error'); return; }

    // Validate against posting rules
    if (typeof clientId !== 'undefined' && clientId) {
        const check = await apiFetch(`${API_URL}/clients/${clientId}/validate-schedule`, {
            method: 'POST', body: { scheduled_at: dt }
        });
        if (check && check.warnings && check.warnings.length > 0) {
            const proceed = confirm('Schedule warnings:\n\n' + check.warnings.join('\n') + '\n\nSchedule anyway?');
            if (!proceed) return;
        }
    }

    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'scheduled', user_id: currentUser?.id || 1, scheduled_at: dt }
    });
    if (res && res.success) {
        showToast('Post scheduled', 'success');
        closeSchedulePicker();
        closePostSlideModal();
        loadClientCalendar();
    }
}

// ========== DESIGN UPLOAD FROM SLIDE VIEW ==========

function handlePsdDesignDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    if (slideViewPostId && event.dataTransfer.files.length > 0) {
        uploadPsdDesign(event.dataTransfer.files);
    }
}

function uploadPsdDesign(files) {
    if (slideViewPostId && files.length > 0) {
        uploadClientDesignFiles(slideViewPostId, files);
    }
}

// ========== REFERENCE UPLOAD (post slideshow) ==========

function handlePsdRefDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    if (slideViewPostId && event.dataTransfer.files.length > 0) {
        uploadPsdReferences(event.dataTransfer.files);
    }
}

async function uploadPsdReferences(files) {
    if (!slideViewPostId || !files.length) return;
    const formData = new FormData();
    for (const f of files) formData.append('images', f);
    const res = await apiFetch(`${API_URL}/posts/${slideViewPostId}/upload-reference`, {
        method: 'POST', body: formData
    });
    if (res && res.urls) {
        showToast(`${res.urls.length} reference(s) uploaded`, 'success');
        loadClientCalendar();
        // Re-open the post detail to refresh
        openClientPostDetail(slideViewPostId);
    }
}

async function deletePostReference(postId, index) {
    const post = clientPostsData.find(p => p.id === postId);
    if (!post) return;
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    refUrls.splice(index, 1);
    const res = await apiFetch(`${API_URL}/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { design_reference_urls: refUrls.join(',') }
    });
    if (res && res.success) {
        showToast('Reference removed', 'success');
        post.design_reference_urls = refUrls.join(',');
        openClientPostDetail(postId);
    }
}

// ========== CAROUSEL NAVIGATION ==========

let carouselCurrentSlide = 0;

function carouselNav(dir) {
    const imgs = document.querySelectorAll('#psd-carousel img[data-slide]');
    if (!imgs.length) return;
    carouselCurrentSlide = (carouselCurrentSlide + dir + imgs.length) % imgs.length;
    carouselGoTo(carouselCurrentSlide);
}

function carouselGoTo(idx) {
    const imgs = document.querySelectorAll('#psd-carousel img[data-slide]');
    const dots = document.querySelectorAll('#psd-carousel-dots .carousel-dot');
    const thumbs = document.querySelectorAll('#psd-carousel-thumbs img[data-thumb]');
    if (!imgs.length) return;
    carouselCurrentSlide = idx;
    imgs.forEach((img, i) => { img.style.display = i === idx ? 'block' : 'none'; });
    dots.forEach((dot, i) => { dot.classList.toggle('active', i === idx); });
    thumbs.forEach((th, i) => {
        th.classList.toggle('ring-2', i === idx);
        th.classList.toggle('ring-indigo-500', i === idx);
    });
    const counter = document.getElementById('psd-carousel-counter');
    if (counter) counter.textContent = `Slide ${idx + 1} of ${imgs.length}`;
}

async function deleteCarouselSlide(postId, slideIndex) {
    if (!confirm('Remove this slide?')) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/remove-design-slide`, {
        method: 'POST',
        body: { slide_index: slideIndex, user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast('Slide removed', 'success');
        loadClientCalendar();
        openPostSlideView(postId);
    }
}

// ========== WORKFLOW TRANSITIONS ==========

async function clientTransitionPost(postId, newStatus) {
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: newStatus, user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast(`Status changed to ${newStatus.replace(/_/g, ' ')}`, 'success');
        loadClientCalendar();
        openPostSlideView(postId);
    }
}

async function clientReturnToDraft(postId) {
    const comment = prompt('Feedback (optional):');
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'draft', user_id: currentUser?.id || 1, comment: comment || '' }
    });
    if (res && res.success) {
        showToast('Returned to draft', 'success');
        loadClientCalendar();
        openPostSlideView(postId);
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
        openPostSlideView(postId);
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
        openPostSlideView(postId);
    }
}

// ========== EDIT ACCOUNT ==========

let editBriefFileUrl = '';
let _editWebsiteTimer = null;

// ========== API STATUS CHECK ==========

async function checkApiStatus() {
    if (!clientId) return;
    const container = document.getElementById('cd-api-results');
    if (!container) return;
    container.innerHTML = '<span class="text-xs text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Checking...</span>';
    const data = await fetch(`${API_URL}/clients/${clientId}/check-all-accounts`).then(r => r.json()).catch(() => []);
    if (!data || data.length === 0) {
        container.innerHTML = '<span class="text-xs text-gray-400">No connected accounts</span>';
        return;
    }
    container.innerHTML = data.map(a => {
        const icon = a.status === 'active' ? 'fa-circle-check text-green-500' :
                     a.status === 'error' ? 'fa-circle-xmark text-red-500' :
                     'fa-circle-question text-yellow-500';
        const bg = a.status === 'active' ? 'bg-green-50 border-green-200' :
                   a.status === 'error' ? 'bg-red-50 border-red-200' :
                   'bg-yellow-50 border-yellow-200';
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${bg}" title="${esc(a.message || '')}">
            <i class="fa-solid ${icon}"></i>
            ${getPlatformIcon(a.platform)} ${esc(a.account_name || a.platform)}
            ${a.needs_reauth ? '<span class="text-red-500 ml-1 font-bold">Reconnect</span>' : ''}
        </span>`;
    }).join('');
}

async function openEditClientModal() {
    if (!clientData) return;
    document.getElementById('ec-name').value = clientData.name || '';
    document.getElementById('ec-company').value = clientData.company || '';
    document.getElementById('ec-email').value = clientData.email || '';
    document.getElementById('ec-website').value = clientData.website || '';
    document.getElementById('ec-logo-url').value = clientData.logo_url || '';
    // Show logo preview if exists
    if (clientData.logo_url) {
        document.getElementById('ec-logo-preview-img').src = clientData.logo_url;
        document.getElementById('ec-logo-preview').classList.remove('hidden');
    } else {
        document.getElementById('ec-logo-preview').classList.add('hidden');
    }
    document.getElementById('ec-logo-spinner').classList.add('hidden');
    document.getElementById('ec-brief-text').value = clientData.brief_text || '';
    document.getElementById('ec-brief-url').value = clientData.brief_url || '';
    // Populate content requirement rows
    const reqContainer = document.getElementById('ec-content-req-rows');
    reqContainer.innerHTML = '';
    let reqs = [];
    try { reqs = JSON.parse(clientData.content_requirements || '[]'); } catch (e) {}
    if (reqs.length > 0) {
        reqs.forEach(r => addEditReqRow(r.platforms || r.platform, r.type, r.count));
    } else {
        addEditReqRow();
    }
    editBriefFileUrl = clientData.brief_file_url || '';

    const fileCurrentEl = document.getElementById('ec-brief-file-current');
    if (editBriefFileUrl) {
        fileCurrentEl.innerHTML = `Current: <a href="${esc(editBriefFileUrl)}" target="_blank" class="text-indigo-600 underline">View file</a>`;
        fileCurrentEl.classList.remove('hidden');
    } else {
        fileCurrentEl.classList.add('hidden');
    }
    document.getElementById('ec-brief-file').value = '';

    document.getElementById('edit-client-modal').classList.remove('hidden');

    // Load team dropdowns and pre-select current assignments
    const teamRoles = [
        { select: 'ec-assigned-writer', field: 'assigned_writer_id' },
        { select: 'ec-assigned-designer', field: 'assigned_designer_id' },
        { select: 'ec-assigned-sm', field: 'assigned_sm_id' },
        { select: 'ec-assigned-motion', field: 'assigned_motion_id' },
        { select: 'ec-assigned-manager', field: 'assigned_manager_id' },
    ];
    for (const r of teamRoles) {
        await loadUsersDropdown(r.select);
        const sel = document.getElementById(r.select);
        if (sel) sel.value = clientData[r.field] || '';
    }
}

function closeEditClientModal() {
    document.getElementById('edit-client-modal').classList.add('hidden');
}

async function onEditBriefFileSelected(files) {
    if (!files || !files.length) return;
    const formData = new FormData();
    formData.append('file', files[0]);
    showToast('Uploading brief file...', 'info');
    try {
        const res = await fetch(API_URL + '/upload-brief-file', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.url) {
            editBriefFileUrl = data.url;
            const fileCurrentEl = document.getElementById('ec-brief-file-current');
            fileCurrentEl.innerHTML = `Uploaded: <a href="${esc(data.url)}" target="_blank" class="text-indigo-600 underline">${esc(data.filename || 'View file')}</a>`;
            fileCurrentEl.classList.remove('hidden');
            showToast('File uploaded', 'success');
        } else {
            showToast('Upload failed', 'error');
        }
    } catch (e) {
        showToast('File upload failed', 'error');
    }
}

function onEditWebsiteInput() {
    clearTimeout(_editWebsiteTimer);
    const url = document.getElementById('ec-website').value.trim();
    if (!url || url.length < 5) {
        document.getElementById('ec-logo-preview').classList.add('hidden');
        document.getElementById('ec-logo-spinner').classList.add('hidden');
        document.getElementById('ec-logo-url').value = '';
        return;
    }
    _editWebsiteTimer = setTimeout(() => fetchLogoForField(url, 'ec-logo-url', 'ec-logo-preview', 'ec-logo-preview-img', 'ec-logo-spinner'), 800);
}

async function fetchLogoForField(url, hiddenId, previewId, imgId, spinnerId) {
    document.getElementById(spinnerId).classList.remove('hidden');
    document.getElementById(previewId).classList.add('hidden');
    try {
        const res = await fetch(API_URL + '/fetch-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success && data.logo_url) {
            document.getElementById(hiddenId).value = data.logo_url;
            const img = document.getElementById(imgId);
            img.src = data.logo_url;
            img.onerror = () => {
                document.getElementById(previewId).classList.add('hidden');
                document.getElementById(hiddenId).value = '';
            };
            document.getElementById(previewId).classList.remove('hidden');
        }
    } catch (e) {
        console.error('Logo fetch failed:', e);
    }
    document.getElementById(spinnerId).classList.add('hidden');
}

function addEditReqRow(platforms, type, count) {
    // Backward compat: old data has `platform` (string), new has `platforms` (array)
    const selected = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const container = document.getElementById('ec-content-req-rows');
    const div = document.createElement('div');
    div.className = 'ec-req-row border rounded-lg p-2 mb-2';
    div.innerHTML = `
        <div class="flex flex-wrap gap-1 mb-1 cr-platforms">${buildReqPlatformToggles(selected)}</div>
        <div class="flex items-center gap-2">
            <select class="cr-type border rounded-lg px-2 py-1 text-sm">
                <option value="post" ${type==='post'?'selected':''}>Post</option>
                <option value="story" ${type==='story'?'selected':''}>Story</option>
                <option value="reel" ${type==='reel'?'selected':''}>Reel</option>
                <option value="video" ${type==='video'?'selected':''}>Video</option>
                <option value="carousel" ${type==='carousel'?'selected':''}>Carousel</option>
                <option value="grid" ${type==='grid'?'selected':''}>Grid (3 Posts)</option>
            </select>
            <input type="number" class="cr-count border rounded-lg px-2 py-1 text-sm w-16" min="1" value="${count||1}" placeholder="#">
            <span class="text-xs text-gray-400">/ month</span>
            <button onclick="this.closest('.ec-req-row').remove()" class="text-red-400 hover:text-red-600 text-sm"><i class="fa-solid fa-times"></i></button>
        </div>
    `;
    container.appendChild(div);
    initReqPlatformToggles(div);
}

function collectEditReqs() {
    const rows = document.querySelectorAll('.ec-req-row');
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

async function saveClientEdit() {
    const name = document.getElementById('ec-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }

    const payload = {
        name,
        company: document.getElementById('ec-company').value.trim(),
        email: document.getElementById('ec-email').value.trim(),
        website: document.getElementById('ec-website').value.trim(),
        logo_url: document.getElementById('ec-logo-url').value.trim(),
        brief_text: document.getElementById('ec-brief-text').value.trim(),
        brief_url: document.getElementById('ec-brief-url').value.trim(),
        brief_file_url: editBriefFileUrl,
        content_requirements: collectEditReqs(),
        assigned_writer_id: document.getElementById('ec-assigned-writer').value || null,
        assigned_designer_id: document.getElementById('ec-assigned-designer').value || null,
        assigned_sm_id: document.getElementById('ec-assigned-sm').value || null,
        assigned_motion_id: document.getElementById('ec-assigned-motion').value || null,
        assigned_manager_id: document.getElementById('ec-assigned-manager').value || null,
    };

    const oldName = clientData?.name || '';
    const res = await apiFetch(`${API_URL}/clients/${clientId}`, { method: 'PUT', body: payload });
    if (res && res.success) {
        showToast('Account updated', 'success');
        closeEditClientModal();
        // If name changed, slug changed — reload via new slug
        if (name !== oldName) {
            const updated = await fetch(API_URL + '/clients/' + clientId).then(r => r.json());
            if (updated && updated.slug) { window.location.href = '/clients/' + updated.slug; return; }
        }
        loadClientDetail();
    }
}
