// Calendar page JS — Rich content calendar
let currentMonth = new Date();
let calendarPostsData = [];
let calendarByDate = {};
let scheduleSlots = {};
let currentDetailPost = null;
let draggedPostId = null;
let activeStatusFilter = '';

function pageInit() {
    loadCalendar();
    loadClientsDropdown('calendar-client-filter');
    // Auto-open post if linked from My Tasks
    const params = new URLSearchParams(window.location.search);
    const openPostId = params.get('open_post');
    if (openPostId) {
        setTimeout(() => openPostDetail(parseInt(openPostId)), 500);
        // Clean URL without reload
        window.history.replaceState({}, '', '/calendar');
    }
}

async function loadCalendar() {
    const clientId = document.getElementById('calendar-client-filter')?.value || '';
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    let url = `${API_URL}/posts/calendar?year=${year}&month=${month}&include_unscheduled=1`;
    if (clientId) url += `&client_id=${clientId}`;

    // Only fetch schedule slots when a specific client is selected
    const fetches = [apiFetch(url)];
    if (clientId) {
        fetches.push(apiFetch(`${API_URL}/calendar/schedule-slots?year=${year}&month=${month}&client_id=${clientId}`));
    } else {
        fetches.push(Promise.resolve(null));
    }

    const [data, slotsData] = await Promise.all(fetches);

    if (!data) return;
    calendarPostsData = data.posts || [];
    calendarByDate = data.by_date || {};
    scheduleSlots = (slotsData && slotsData.slots) ? slotsData.slots : {};
    renderCalendar();
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    document.getElementById('calendar-month').textContent = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';

    // Empty leading cells
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="bg-gray-50 rounded p-2 min-h-[100px]"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayPosts = getDayPosts(dateStr);
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        const filtered = filterByStatus(dayPosts);
        const daySlots = scheduleSlots[dateStr] || [];
        const unfilledSlots = daySlots.filter(s => !s.filled);

        html += `<div class="bg-white border rounded-lg p-2 cal-day-cell ${isToday ? 'ring-2 ring-indigo-500' : ''}"
                      data-date="${dateStr}"
                      ondragover="onDayDragOver(event)" ondragleave="onDayDragLeave(event)" ondrop="onDayDrop(event, '${dateStr}')">
            <div class="flex justify-between items-center mb-1">
                <span class="font-semibold text-sm ${isToday ? 'text-indigo-600' : ''}">${day}</span>
                <span class="flex items-center gap-1">
                    ${daySlots.length > 0 ? `<span class="text-[9px] px-1 rounded ${unfilledSlots.length > 0 ? 'bg-red-100 text-red-600 font-bold animate-pulse' : 'bg-green-100 text-green-600'}">${unfilledSlots.length > 0 ? '⚠ ' + unfilledSlots.length + ' need content' : '✓'}</span>` : ''}
                    ${dayPosts.length > 0 ? `<span class="text-xs text-gray-400">${dayPosts.length}</span>` : ''}
                </span>
            </div>
            ${daySlots.length > 0 ? `<div class="cal-schedule-slots mb-1" onclick="showDaySlots('${dateStr}'); event.stopPropagation();">${daySlots.slice(0, 4).map(s => {
                const typeIcon = s.content_type === 'story' ? '📱' : s.content_type === 'video' ? '🎬' : s.content_type === 'reel' ? '🎞' : '📷';
                const chipClass = s.filled ? 'cal-slot-chip cal-slot-filled' : 'cal-slot-chip cal-slot-needs-content';
                const label = s.filled ? esc(s.client_name?.substring(0, 6) || '') : 'Need Content';
                return `<div class="${chipClass}" style="border-left-color:${s.client_color || '#6366f1'}" title="${esc(s.client_name)} — ${s.content_type} — ${s.platform} @ ${s.time}${!s.filled ? ' — NEEDS CONTENT' : ''}">${typeIcon} ${label}</div>`;
            }).join('')}${daySlots.length > 4 ? `<div class="cal-slot-chip cal-slot-more">+${daySlots.length - 4}</div>` : ''}</div>` : ''}
            <div class="cal-day-posts">
                ${filtered.slice(0, 3).map(p => renderCalendarMiniCard(p)).join('')}
                ${filtered.length > 3 ? `<div class="text-xs text-indigo-600 font-semibold text-center cursor-pointer mt-1" onclick="showDayPosts('${dateStr}', ${day})">+${filtered.length - 3} more</div>` : ''}
            </div>
        </div>`;
    }

    document.getElementById('calendar-grid').innerHTML = html;
}

function getDayPosts(dateStr) {
    // Check by_date first, then fallback to filtering all posts
    if (calendarByDate[dateStr]) return calendarByDate[dateStr];
    return calendarPostsData.filter(p => {
        const sa = (p.scheduled_at || '').substring(0, 10);
        const ca = (p.created_at || '').substring(0, 10);
        return sa === dateStr || (!sa && ca === dateStr);
    });
}

function filterByStatus(posts) {
    if (!activeStatusFilter) return posts;
    return posts.filter(p => getPostStatus(p) === activeStatusFilter);
}

function applyStatusFilter() {
    activeStatusFilter = document.getElementById('calendar-status-filter')?.value || '';
    renderCalendar();
}

// ========== DRAG & DROP ==========

function onCardDragStart(e, postId) {
    draggedPostId = postId;
    e.dataTransfer.setData('text/plain', postId);
    e.dataTransfer.effectAllowed = 'move';
}

function onDayDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedPostId ? 'move' : 'copy';
    e.currentTarget.classList.add('drag-over');
}

function onDayDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function onDayDrop(e, dateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    // Check if it's a file drop (design upload)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileDrop(e.dataTransfer.files, dateStr);
        return;
    }

    // Post card drag (reschedule)
    if (draggedPostId) {
        const postId = draggedPostId;
        draggedPostId = null;
        const newDatetime = dateStr + 'T12:00:00';
        const res = await apiFetch(`${API_URL}/posts/${postId}/reschedule`, {
            method: 'PUT',
            body: { scheduled_at: newDatetime }
        });
        if (res && res.success) {
            showToast('Post rescheduled', 'success');
            loadCalendar();
        }
    }
}

async function handleFileDrop(files, dateStr) {
    // Find posts on this day that are in_design
    const dayPosts = getDayPosts(dateStr);
    const designPosts = dayPosts.filter(p => (p.workflow_status || '') === 'in_design');

    if (designPosts.length === 0) {
        showToast('No posts in "In Design" status on this day', 'error');
        return;
    }

    // Upload to the first in_design post
    const targetPost = designPosts[0];
    await uploadDesignFiles(targetPost.id, files);
}

async function uploadDesignFiles(postId, files) {
    const formData = new FormData();
    for (const file of files) {
        formData.append('images', file);
    }
    if (currentUser) formData.append('user_id', currentUser.id);

    showToast('Uploading designs...', 'info');
    const res = await apiFetch(`${API_URL}/posts/${postId}/upload-design`, {
        method: 'POST',
        body: formData
    });

    if (res && res.success) {
        showToast(`${res.urls?.length || 0} design(s) uploaded`, 'success');
        loadCalendar();
        // Refresh detail modal if open
        if (currentDetailPost && currentDetailPost.id === postId) {
            openPostDetail(postId);
        }
    }
}

// ========== DAY POSTS MODAL ==========

function showDayPosts(dateStr, day) {
    const posts = filterByStatus(getDayPosts(dateStr));
    document.getElementById('day-posts-title').textContent = `Posts for ${dateStr}`;
    if (posts.length === 0) {
        document.getElementById('day-posts-list').innerHTML = '<p class="text-gray-500 text-center py-8">No posts</p>';
    } else {
        document.getElementById('day-posts-list').innerHTML = posts.map(p => {
            const status = getPostStatus(p);
            const color = getStatusColor(status);
            return `<div class="border-l-4 rounded-xl p-4 hover:shadow-md transition cursor-pointer bg-white" style="border-left-color:${color}" onclick="openPostDetail(${p.id}); hideDayPostsModal();">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        ${getPlatformIcon(p.platforms)} ${getContentTypeIcon(p.post_type)}
                        <div><p class="font-semibold text-sm">${esc(p.topic || 'Untitled')}</p><p class="text-xs text-gray-400">${esc(p.client_name || '')}</p></div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${status}</span>
                </div>
                <p class="text-sm text-gray-600 line-clamp-2">${esc(p.caption || 'No caption yet')}</p>
                <div class="text-xs text-gray-400 mt-2"><i class="fa-regular fa-clock mr-1"></i>${(p.scheduled_at || p.created_at || '').replace('T', ' ')}</div>
            </div>`;
        }).join('');
    }
    document.getElementById('day-posts-modal').classList.remove('hidden');
}

function hideDayPostsModal() { document.getElementById('day-posts-modal').classList.add('hidden'); }

// ========== POST DETAIL MODAL ==========

async function openPostDetail(postId) {
    const post = await apiFetch(`${API_URL}/posts/${postId}`);
    if (!post || post.error) return;
    currentDetailPost = post;

    const status = getPostStatus(post);
    const color = getStatusColor(status);
    const wf = post.workflow_status || 'draft';

    // Title
    document.getElementById('detail-title').textContent = post.topic || 'Untitled Post';

    // Meta badges
    document.getElementById('detail-meta').innerHTML = `
        <span class="px-3 py-1 rounded-full text-xs font-semibold text-white" style="background:${color}">${status}</span>
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${getPlatformBgClass(post.platforms)}">${getPlatformIcon(post.platforms)} ${esc(post.platforms || '')}</span>
        ${post.post_type ? `<span class="px-3 py-1 rounded-full text-xs bg-gray-100 font-semibold">${getContentTypeIcon(post.post_type)} ${esc(post.post_type)}</span>` : ''}
        ${post.priority && post.priority !== 'normal' ? `<span class="px-3 py-1 rounded-full text-xs font-semibold badge-${post.priority}">${esc(post.priority)}</span>` : ''}
    `;

    // Role-specific banner
    const role = currentUser?.role || 'user';
    const bannerEl = document.getElementById('detail-role-banner');
    bannerEl.className = 'hidden';
    bannerEl.innerHTML = '';

    if (role === 'copywriter') {
        if (wf === 'needs_caption') {
            bannerEl.className = 'role-banner role-banner-copywriter';
            bannerEl.innerHTML = '<i class="fa-solid fa-pen-nib"></i><div><strong>Your turn!</strong> Write and submit the caption for this post.</div>';
        } else if (wf === 'draft') {
            bannerEl.className = 'role-banner role-banner-copywriter';
            bannerEl.innerHTML = '<i class="fa-solid fa-pen-nib"></i><div>Draft — write the caption and save it.</div>';
        } else if (['in_design', 'design_review'].includes(wf)) {
            bannerEl.className = 'role-banner role-banner-copywriter';
            bannerEl.innerHTML = '<i class="fa-solid fa-pen-nib"></i><div>You can still edit and save the caption.</div>';
        } else {
            bannerEl.className = 'role-banner role-banner-copywriter';
            bannerEl.innerHTML = '<i class="fa-solid fa-eye"></i><div>View only — this post is in <strong>' + esc(wf.replace(/_/g, ' ')) + '</strong> stage.</div>';
        }
    } else if (role === 'designer' || role === 'motion_editor') {
        if (wf === 'in_design') {
            bannerEl.className = 'role-banner role-banner-designer';
            bannerEl.innerHTML = '<i class="fa-solid fa-paintbrush"></i><div><strong>Your turn!</strong> Upload designs using the brief and references below.</div>';
        } else {
            bannerEl.className = 'role-banner role-banner-designer';
            bannerEl.innerHTML = '<i class="fa-solid fa-eye"></i><div>View only — this post is in <strong>' + esc(wf.replace(/_/g, ' ')) + '</strong> stage.</div>';
        }
    } else if (role === 'sm_specialist') {
        if (wf === 'design_review') {
            bannerEl.className = 'role-banner role-banner-reviewer';
            bannerEl.innerHTML = '<i class="fa-solid fa-clipboard-check"></i><div><strong>Review needed!</strong> Check the designs and approve or return for changes.</div>';
        } else if (wf === 'approved') {
            bannerEl.className = 'role-banner role-banner-reviewer';
            bannerEl.innerHTML = '<i class="fa-solid fa-calendar-check"></i><div>Approved — ready to schedule.</div>';
        }
    }

    // Editable mode for draft/needs_caption — only for roles that can create/edit
    const hasEditPerm = canDo('createPost') || canDo('editCaption');
    const isEditable = ['draft', 'needs_caption'].includes(wf) && hasEditPerm;

    // Text on Design (topic)
    const topicSection = document.getElementById('detail-topic-section');
    const topicDisplay = document.getElementById('detail-topic');
    const topicInput = document.getElementById('detail-topic-input');
    topicSection.style.display = '';
    if (isEditable) {
        topicDisplay.style.display = 'none';
        topicInput.classList.remove('hidden');
        topicInput.value = post.topic || '';
    } else {
        topicInput.classList.add('hidden');
        if (post.topic) {
            topicDisplay.textContent = post.topic;
            topicDisplay.style.display = '';
        } else {
            topicSection.style.display = 'none';
        }
    }

    // Notes for Designer
    const notesSection = document.getElementById('detail-notes-section');
    const notesDisplay = document.getElementById('detail-notes');
    const notesInput = document.getElementById('detail-notes-input');
    notesSection.style.display = '';
    if (isEditable) {
        notesDisplay.style.display = 'none';
        notesInput.classList.remove('hidden');
        notesInput.value = post.brief_notes || '';
    } else {
        notesInput.classList.add('hidden');
        if (post.brief_notes) {
            notesDisplay.textContent = post.brief_notes;
            notesDisplay.style.display = '';
        } else {
            notesSection.style.display = 'none';
        }
    }

    // Design Outputs — only show when designer has uploaded, or when in design stages
    const designUrls = (post.design_output_urls || '').split(',').filter(u => u.trim());
    const designsSection = document.getElementById('detail-designs-section');
    const designsTitle = document.getElementById('detail-designs-title');
    const needsDesign = ['draft', 'needs_caption', 'in_design'].includes(wf);

    // Design References — larger gallery cards with delete
    const refsSection = document.getElementById('detail-references-section');
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    if (refUrls.length) {
        document.getElementById('detail-references').innerHTML = `<div class="ref-gallery">${refUrls.map((u, i) => {
            const url = u.trim();
            const filename = url.split('/').pop().split('?')[0];
            return `<div class="ref-gallery-item">
                <img src="${url}" alt="Reference" onclick="window.open('${url}','_blank')">
                <div class="ref-gallery-overlay">
                    <span class="ref-gallery-name">${esc(filename.length > 20 ? filename.substring(0, 17) + '...' : filename)}</span>
                    ${needsDesign && canDo('uploadRef') ? `<button class="ref-gallery-delete" onclick="event.stopPropagation(); deleteReference(${post.id}, ${i})" title="Remove"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </div>`;
        }).join('')}</div>`;
        refsSection.style.display = '';
    } else if (needsDesign) {
        document.getElementById('detail-references').innerHTML = '<p class="text-gray-400 text-sm">No references added yet — upload references for the designer</p>';
        refsSection.style.display = '';
    } else {
        refsSection.style.display = 'none';
    }

    // Show/hide reference upload zone — only before design is done AND if user can upload refs
    const refUploadZone = document.getElementById('detail-reference-upload-zone');
    if (refUploadZone) {
        refUploadZone.style.display = (needsDesign && canDo('uploadRef')) ? '' : 'none';
    }

    if (designUrls.length) {
        // Designer has uploaded designs
        designsTitle.innerHTML = '<i class="fa-solid fa-palette mr-1"></i> Design Output';
        document.getElementById('detail-designs').innerHTML = designUrls.map(u => `<img src="${u.trim()}" alt="Design" onclick="window.open('${u.trim()}','_blank')">`).join('');
        designsSection.style.display = '';
    } else if (wf === 'in_design') {
        // Post is actively waiting for designer
        designsTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-orange-500 mr-1"></i> Needs Design';
        document.getElementById('detail-designs').innerHTML = '<div class="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center"><i class="fa-solid fa-paintbrush text-orange-400 text-xl mb-1 block"></i><p class="text-sm font-semibold text-orange-700">Waiting for designer to create content</p><p class="text-xs text-orange-500 mt-1">The designer should use the references above to create the design</p></div>';
        designsSection.style.display = '';
    } else if (['draft', 'needs_caption'].includes(wf)) {
        // Still preparing brief — hide design section, not relevant yet
        designsSection.style.display = 'none';
    } else {
        designsTitle.innerHTML = '<i class="fa-solid fa-palette mr-1"></i> Design Output';
        document.getElementById('detail-designs').innerHTML = '<p class="text-gray-400 text-sm">No designs attached</p>';
        designsSection.style.display = '';
    }

    // Caption — read-only unless user can edit captions AND post not yet approved/published
    const captionEl = document.getElementById('detail-caption');
    captionEl.value = post.caption || '';
    const canEditCaption = canDo('editCaption') && !['approved', 'scheduled', 'posted'].includes(wf);
    captionEl.readOnly = !canEditCaption;
    captionEl.style.opacity = canEditCaption ? '1' : '0.7';

    // Tone of Voice
    const tovSection = document.getElementById('detail-tov-section');
    const tovDisplay = document.getElementById('detail-tov');
    const tovInput = document.getElementById('detail-tov-input');
    tovSection.style.display = '';
    if (isEditable) {
        tovDisplay.style.display = 'none';
        tovInput.classList.remove('hidden');
        tovInput.value = post.tov || '';
    } else {
        tovInput.classList.add('hidden');
        if (post.tov) {
            tovDisplay.textContent = post.tov;
            tovDisplay.style.display = '';
        } else {
            tovSection.style.display = 'none';
        }
    }

    // Assignments (always read-only — inherited from client)
    const assignSection = document.getElementById('detail-assignments-section');
    const assignDisplay = document.getElementById('detail-assignments');
    assignSection.style.display = '';

    const assignments = [];
    if (post.assigned_writer_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-pen-nib text-yellow-500 mr-1"></i> Copywriter: <strong>${esc(post.assigned_writer_name)}</strong></span>`);
    if (post.assigned_designer_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-paintbrush text-purple-500 mr-1"></i> Designer: <strong>${esc(post.assigned_designer_name)}</strong></span>`);
    if (post.assigned_sm_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-bullhorn text-blue-500 mr-1"></i> SM: <strong>${esc(post.assigned_sm_name)}</strong></span>`);
    if (post.assigned_motion_name) assignments.push(`<span class="mr-3"><i class="fa-solid fa-film text-red-500 mr-1"></i> Motion: <strong>${esc(post.assigned_motion_name)}</strong></span>`);
    if (assignments.length) {
        assignDisplay.innerHTML = assignments.join('');
        assignDisplay.style.display = '';
    } else {
        assignSection.style.display = 'none';
    }

    // Save Brief button — only for roles that can create posts
    const saveBriefSection = document.getElementById('detail-save-brief-section');
    if (saveBriefSection) {
        saveBriefSection.classList.toggle('hidden', !(isEditable && canDo('createPost')));
    }

    // Workflow action buttons — filtered by role permissions
    const actions = [];
    if (wf === 'draft' && canDo('createPost')) {
        if (post.assigned_writer_id) {
            actions.push(`<button onclick="transitionPost(${post.id}, 'needs_caption')" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-pen-nib mr-1"></i> Send to Copywriter</button>`);
        }
        actions.push(`<button onclick="transitionPost(${post.id}, 'in_design')" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fa-solid fa-paper-plane mr-1"></i> Send to Design</button>`);
    }
    if (wf === 'needs_caption') {
        // Only show submit caption button (handled separately in caption section)
    }
    if (wf === 'in_design' && canDo('uploadDesign')) {
        actions.push(`<button onclick="document.getElementById('detail-design-input').click()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700"><i class="fa-solid fa-upload mr-1"></i> Upload Design</button>`);
    }
    if (wf === 'design_review' && canDo('approve')) {
        actions.push(`<button onclick="transitionPost(${post.id}, 'approved')" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"><i class="fa-solid fa-check mr-1"></i> Approve</button>`);
        actions.push(`<button onclick="returnToDesign(${post.id})" class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600"><i class="fa-solid fa-rotate-left mr-1"></i> Return to Design</button>`);
        if (post.assigned_writer_id) {
            actions.push(`<button onclick="returnToCaption(${post.id})" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-pen-nib mr-1"></i> Return to Copywriter</button>`);
        }
    }
    if (wf === 'approved' && canDo('schedule')) {
        actions.push(`<button onclick="schedulePost(${post.id})" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><i class="fa-solid fa-calendar-check mr-1"></i> Schedule</button>`);
    }
    document.getElementById('detail-actions').innerHTML = actions.join('');

    // Show/hide caption submit button — only if user can edit captions AND status is needs_caption
    const submitCaptionBtn = document.getElementById('btn-submit-caption');
    if (submitCaptionBtn) {
        if (wf === 'needs_caption' && canDo('editCaption')) {
            submitCaptionBtn.classList.remove('hidden');
        } else {
            submitCaptionBtn.classList.add('hidden');
        }
    }

    // Show/hide save caption button
    const saveCaptionBtn = document.getElementById('btn-save-caption');
    if (saveCaptionBtn) {
        saveCaptionBtn.style.display = canEditCaption ? '' : 'none';
    }

    // Show/hide design upload zone — ONLY when post is in_design AND user can upload designs
    const uploadZone = document.getElementById('detail-upload-zone');
    if (uploadZone) {
        uploadZone.style.display = (wf === 'in_design' && canDo('uploadDesign')) ? '' : 'none';
    }

    // ===== Role-specific UX tailoring =====
    const captionSection = document.getElementById('detail-caption-section');
    const captionButtons = document.getElementById('detail-caption-buttons');

    // Reset all role-focus highlights
    document.querySelectorAll('#post-detail-modal .role-focus').forEach(el => el.classList.remove('role-focus'));

    if (role === 'copywriter') {
        // Copywriter: caption is their main job — highlight it, hide irrelevant sections
        if (captionSection && canEditCaption) captionSection.classList.add('role-focus');
        // Hide design upload zone entirely (they can't upload)
        if (uploadZone) uploadZone.style.display = 'none';
        if (refUploadZone) refUploadZone.style.display = 'none';
        // Hide assignments and save brief (not their concern)
        if (assignSection) assignSection.style.display = 'none';
        if (saveBriefSection) saveBriefSection.classList.add('hidden');
        // Hide TOV editing for copywriter (they follow it, don't set it)
        if (tovSection && !post.tov) tovSection.style.display = 'none';

    } else if (role === 'designer' || role === 'motion_editor') {
        // Designer: topic + notes + references are key info, design upload is their action
        if (topicSection && post.topic) topicSection.classList.add('role-focus');
        if (notesSection && post.brief_notes) notesSection.classList.add('role-focus');
        if (refsSection) refsSection.classList.add('role-focus');
        // Highlight upload zone when it's their turn
        if (wf === 'in_design' && designsSection) designsSection.classList.add('role-focus');
        // Hide caption section entirely (not their job)
        if (captionSection) captionSection.style.display = 'none';
        // Hide assignments and save brief
        if (assignSection) assignSection.style.display = 'none';
        if (saveBriefSection) saveBriefSection.classList.add('hidden');
        if (tovSection) tovSection.style.display = 'none';
        if (refUploadZone) refUploadZone.style.display = 'none';

    } else if (role === 'sm_specialist') {
        // SM Specialist / Moderator: review-focused, read-only
        // Highlight designs section during review
        if (wf === 'design_review' && designsSection) designsSection.classList.add('role-focus');
        // Hide upload zones (they don't upload)
        if (uploadZone) uploadZone.style.display = 'none';
        if (refUploadZone) refUploadZone.style.display = 'none';
        // Hide caption buttons (they don't edit captions)
        if (captionButtons) captionButtons.style.display = 'none';
        // Hide save brief
        if (saveBriefSection) saveBriefSection.classList.add('hidden');
    }

    document.getElementById('post-detail-modal').classList.remove('hidden');
}

function closePostDetail() {
    document.getElementById('post-detail-modal').classList.add('hidden');
    currentDetailPost = null;
}

// ========== SAVE BRIEF FROM DETAIL ==========

async function saveBriefFromDetail() {
    if (!currentDetailPost) return;

    const data = {
        topic: document.getElementById('detail-topic-input').value.trim(),
        brief_notes: document.getElementById('detail-notes-input').value.trim(),
        caption: document.getElementById('detail-caption').value.trim(),
        tov: document.getElementById('detail-tov-input').value.trim(),
    };

    const res = await apiFetch(`${API_URL}/posts/${currentDetailPost.id}`, {
        method: 'PUT',
        body: data
    });

    if (res && res.success) {
        showToast('Brief saved', 'success');
        loadCalendar();
        openPostDetail(currentDetailPost.id);
    } else {
        showToast('Save failed', 'error');
    }
}

// ========== CAPTION SAVE ==========

async function saveCaption() {
    if (!currentDetailPost) return;
    const caption = document.getElementById('detail-caption').value;
    const res = await apiFetch(`${API_URL}/posts/${currentDetailPost.id}`, {
        method: 'PUT',
        body: { caption }
    });
    if (res && res.success) {
        showToast('Caption saved', 'success');
        // Update local data
        currentDetailPost.caption = caption;
        const idx = calendarPostsData.findIndex(p => p.id === currentDetailPost.id);
        if (idx >= 0) calendarPostsData[idx].caption = caption;
        // Re-group and render
        rebuildByDate();
        renderCalendar();
    }
}

// ========== SUBMIT CAPTION & SEND TO DESIGN ==========

async function submitCaption() {
    if (!currentDetailPost) return;
    const caption = document.getElementById('detail-caption').value.trim();
    if (!caption) {
        showToast('Please write a caption first', 'error');
        return;
    }
    // Save caption first
    const saveRes = await apiFetch(`${API_URL}/posts/${currentDetailPost.id}`, {
        method: 'PUT',
        body: { caption }
    });
    if (!saveRes || !saveRes.success) return;

    // Transition from needs_caption to in_design
    const res = await apiFetch(`${API_URL}/posts/${currentDetailPost.id}/transition`, {
        method: 'POST',
        body: { status: 'in_design', user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast('Caption submitted — sent to design', 'success');
        loadCalendar();
        openPostDetail(currentDetailPost.id);
    }
}

async function returnToCaption(postId) {
    const comment = prompt('Feedback for copywriter (required):');
    if (!comment) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'needs_caption', user_id: currentUser?.id || 1, comment }
    });
    if (res && res.success) {
        showToast('Returned to copywriter', 'success');
        loadCalendar();
        openPostDetail(postId);
    }
}

// ========== REFERENCE UPLOAD FROM DETAIL MODAL ==========

function handleReferenceFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    if (currentDetailPost && e.dataTransfer.files.length > 0) {
        uploadReferenceImages(e.dataTransfer.files);
    }
}

async function uploadReferenceImages(files) {
    if (!currentDetailPost || !files.length) return;
    const formData = new FormData();
    for (const file of files) {
        formData.append('images', file);
    }
    showToast('Uploading references...', 'info');
    const res = await apiFetch(`${API_URL}/posts/${currentDetailPost.id}/upload-reference`, {
        method: 'POST',
        body: formData
    });
    if (res && res.success) {
        const uploadedCount = res.urls?.length || 0;
        const errorCount = res.errors?.length || 0;
        if (errorCount > 0) {
            const errorMsgs = res.errors.map(e => `${e.filename}: ${e.error}`).join(', ');
            showToast(`${uploadedCount} uploaded, ${errorCount} failed: ${errorMsgs}`, errorCount === files.length ? 'error' : 'info');
        } else {
            showToast(`${uploadedCount} reference(s) uploaded`, 'success');
        }
        loadCalendar();
        openPostDetail(currentDetailPost.id);
    } else {
        showToast(res?.error || 'Upload failed — check file types and try again', 'error');
    }
}

// ========== DELETE REFERENCE IMAGE ==========

async function deleteReference(postId, index) {
    if (!currentDetailPost) return;
    const refUrls = (currentDetailPost.design_reference_urls || '').split(',').filter(u => u.trim());
    refUrls.splice(index, 1);
    const res = await apiFetch(`${API_URL}/posts/${postId}`, {
        method: 'PUT',
        body: { design_reference_urls: refUrls.join(',') }
    });
    if (res && res.success) {
        showToast('Reference removed', 'success');
        openPostDetail(postId);
    }
}

// ========== DESIGN UPLOAD FROM DETAIL MODAL ==========

function handleDetailDesignDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    if (currentDetailPost && e.dataTransfer.files.length > 0) {
        uploadDesignFiles(currentDetailPost.id, e.dataTransfer.files);
    }
}

function uploadDetailDesign(files) {
    if (currentDetailPost && files.length > 0) {
        uploadDesignFiles(currentDetailPost.id, files);
    }
}

// ========== WORKFLOW TRANSITIONS ==========

async function transitionPost(postId, newStatus) {
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: newStatus, user_id: currentUser?.id || 1 }
    });
    if (res && res.success) {
        showToast(`Status changed to ${newStatus.replace('_', ' ')}`, 'success');
        loadCalendar();
        openPostDetail(postId);
    }
}

async function returnToDesign(postId) {
    const comment = prompt('Feedback for designer (required):');
    if (!comment) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'in_design', user_id: currentUser?.id || 1, comment }
    });
    if (res && res.success) {
        showToast('Returned to design', 'success');
        loadCalendar();
        openPostDetail(postId);
    }
}

async function schedulePost(postId) {
    const dt = prompt('Schedule date/time (YYYY-MM-DDTHH:MM):');
    if (!dt) return;
    const res = await apiFetch(`${API_URL}/posts/${postId}/transition`, {
        method: 'POST',
        body: { status: 'scheduled', user_id: currentUser?.id || 1, scheduled_at: dt }
    });
    if (res && res.success) {
        showToast('Post scheduled', 'success');
        loadCalendar();
        openPostDetail(postId);
    }
}

// ========== SCHEDULE SLOTS MODAL ==========

function showDaySlots(dateStr) {
    const slots = scheduleSlots[dateStr] || [];
    if (slots.length === 0) return;

    const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const typeIcons = { post: '📷 Post', story: '📱 Story', video: '🎬 Video', reel: '🎞 Reel' };
    const typeColors = { post: 'bg-blue-100 text-blue-800', story: 'bg-pink-100 text-pink-800', video: 'bg-red-100 text-red-800', reel: 'bg-purple-100 text-purple-800' };

    let html = `<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="slots-modal" onclick="if(event.target===this) this.remove()">
        <div class="bg-white rounded-xl p-6 w-[95%] sm:w-[550px] max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold"><i class="fa-solid fa-calendar-day text-indigo-600 mr-2"></i>Schedule — ${esc(dayName)}</h3>
                <button onclick="document.getElementById('slots-modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div class="space-y-3">`;

    for (const s of slots) {
        const typeLabel = typeIcons[s.content_type] || typeIcons['post'];
        const typeBg = typeColors[s.content_type] || typeColors['post'];
        const statusBadge = s.filled
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fa-solid fa-check mr-1"></i>Done</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Needs Content</span>';

        html += `
            <div class="border rounded-xl p-4 hover:shadow-md transition" style="border-left: 4px solid ${s.client_color || '#6366f1'}">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-sm">${esc(s.client_name || '')}</span>
                        ${statusBadge}
                    </div>
                    <span class="text-xs text-gray-400">${esc(s.time)}</span>
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${typeBg}">${typeLabel}</span>
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${getPlatformBgClass(s.platform)}">${getPlatformIcon(s.platform)} ${esc(s.platform)}</span>
                </div>
                ${s.notes ? `<p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-2 mb-2"><i class="fa-solid fa-note-sticky text-yellow-500 mr-1"></i>${esc(s.notes)}</p>` : ''}
                ${!s.filled && canDo('createPost') ? `<button onclick="createPostFromSlot('${dateStr}', ${s.client_id}, '${esc(s.platform)}', '${esc(s.content_type)}', '${esc(s.time)}'); document.getElementById('slots-modal').remove();" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 transition"><i class="fa-solid fa-plus mr-1"></i>Create Post</button>` : ''}
            </div>`;
    }

    html += `</div></div></div>`;

    document.body.insertAdjacentHTML('beforeend', html);
}

async function createPostFromSlot(dateStr, clientId, platform, contentType, time) {
    const scheduledAt = dateStr + 'T' + time + ':00';
    const data = {
        topic: '',
        caption: '',
        platforms: platform,
        post_type: contentType,
        scheduled_at: scheduledAt,
        workflow_status: 'draft',
        created_by_id: currentUser?.id || 1
    };
    const res = await apiFetch(`${API_URL}/clients/${clientId}/posts`, {
        method: 'POST',
        body: data
    });
    if (res && res.success) {
        showToast('Draft post created', 'success');
        loadCalendar();
        openPostDetail(res.id);
    }
}

// ========== HELPERS ==========

function rebuildByDate() {
    calendarByDate = {};
    for (const post of calendarPostsData) {
        const sa = (post.scheduled_at || '').substring(0, 10);
        const ca = (post.created_at || '').substring(0, 10);
        const key = sa || ca;
        if (key) {
            if (!calendarByDate[key]) calendarByDate[key] = [];
            calendarByDate[key].push(post);
        }
    }
}

function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    loadCalendar();
}
