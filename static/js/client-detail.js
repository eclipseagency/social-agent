// Client detail page JS — Simplified calendar-first workflow
let clientData = null;
let clientMonth = new Date();
let clientPostsData = [];
let clientCalByDate = {};
let clientDraggedPostId = null;
let clientStatusFilter = '';
let createPostRefFiles = [];
let slideViewPostId = null;

function pageInit() {
    loadClientDetail();
}

async function loadClientDetail() {
    clientData = await fetch(API_URL + '/clients/' + clientId).then(r => r.json());
    if (!clientData || clientData.error) { document.getElementById('client-title').textContent = 'Account Not Found'; return; }

    document.getElementById('client-title').innerHTML = `<i class="fa-solid fa-building text-indigo-600 mr-2"></i>${esc(clientData.name)}`;
    document.getElementById('cd-name').textContent = clientData.name || '-';
    document.getElementById('cd-company').textContent = clientData.company || '-';
    document.getElementById('cd-email').textContent = clientData.email || '-';

    // Show brief and content requirements
    renderBriefSection();

    loadClientCalendar();
}

function renderBriefSection() {
    const section = document.getElementById('cd-brief-section');
    if (!section || !clientData) return;

    const hasBrief = clientData.brief_text && clientData.brief_text.trim();
    const hasReqs = clientData.content_requirements && clientData.content_requirements.trim();

    if (hasBrief || hasReqs) {
        section.classList.remove('hidden');
        document.getElementById('cd-brief-text').textContent = clientData.brief_text || 'No brief set';

        const reqsEl = document.getElementById('cd-content-reqs');
        let reqs = [];
        try { reqs = JSON.parse(clientData.content_requirements || '[]'); } catch (e) {}
        if (reqs.length > 0) {
            reqsEl.innerHTML = reqs.map(r =>
                `<div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                    <span>${getPlatformIcon(r.platform)} <strong>${r.count}</strong> ${esc(r.type)}${r.count > 1 ? 's' : ''} on ${esc(r.platform)}</span>
                </div>`
            ).join('');
        } else {
            reqsEl.innerHTML = '<p class="text-gray-400 text-xs italic">No requirements set</p>';
        }
    } else {
        section.classList.add('hidden');
    }
}

// ========== CLIENT CALENDAR ==========

async function loadClientCalendar() {
    const year = clientMonth.getFullYear();
    const month = clientMonth.getMonth() + 1;
    const data = await apiFetch(`${API_URL}/posts/calendar?year=${year}&month=${month}&client_id=${clientId}&include_unscheduled=1`);
    if (!data) return;
    clientPostsData = data.posts || [];
    clientCalByDate = data.by_date || {};

    // Role-based filtering: motion_designer only sees video/reel
    if (currentUser?.role === 'motion_designer') {
        clientPostsData = clientPostsData.filter(p => ['video', 'reel'].includes((p.post_type || '').toLowerCase()));
        // Also filter by_date
        for (const date in clientCalByDate) {
            clientCalByDate[date] = clientCalByDate[date].filter(p => ['video', 'reel'].includes((p.post_type || '').toLowerCase()));
        }
    }
    // Designer only sees post/story (image-based)
    if (currentUser?.role === 'designer') {
        clientPostsData = clientPostsData.filter(p => ['post', 'story'].includes((p.post_type || '').toLowerCase()));
        for (const date in clientCalByDate) {
            clientCalByDate[date] = clientCalByDate[date].filter(p => ['post', 'story'].includes((p.post_type || '').toLowerCase()));
        }
    }

    document.getElementById('cd-posts-count').textContent = clientPostsData.length;
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
                ${canCreate ? `<button class="cal-add-btn" onclick="event.stopPropagation(); openCreatePostModal('${dateStr}')" title="Add post">
                    <i class="fa-solid fa-plus"></i>
                </button>` : ''}
            </div>
            ${filtered.slice(0, 3).map(p => renderCalendarMiniCard(p)).join('')}
            ${filtered.length > 3 ? `<div class="text-[10px] text-indigo-600 font-semibold text-center cursor-pointer" onclick="event.stopPropagation(); openPostSlideView(${filtered[3].id})">+${filtered.length - 3} more</div>` : ''}
        </div>`;
    }
    document.getElementById('client-calendar-grid').innerHTML = html;
}

function changeClientMonth(delta) {
    clientMonth.setMonth(clientMonth.getMonth() + delta);
    loadClientCalendar();
}

// ========== DAY CELL CLICK ==========

function onDayCellClick(event, dateStr) {
    if (event.target.closest('.cal-mini-card') || event.target.closest('.cal-add-btn')) return;
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
    createPostRefFiles = [];
    document.getElementById('cp-ref-previews').innerHTML = '';
    document.getElementById('cp-ref-input').value = '';
    updateSlidePreview();
    document.getElementById('create-post-modal').classList.remove('hidden');
}

function closeCreatePostModal() {
    document.getElementById('create-post-modal').classList.add('hidden');
    createPostRefFiles = [];
}

function updateSlidePreview() {
    const tov = document.getElementById('cp-tov').value.trim();
    const caption = document.getElementById('cp-caption').value.trim();
    const notes = document.getElementById('cp-notes').value.trim();
    const platforms = getSelectedPlatforms();
    const postType = document.getElementById('cp-post-type').value;
    const date = document.getElementById('cp-date').value;

    if (!tov && !caption && !notes && createPostRefFiles.length === 0 && platforms.length === 0) {
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

    // TOV block (indigo gradient)
    if (tov) {
        html += '<div class="pres-tov-block" style="direction:rtl">';
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

    // Caption
    if (caption) {
        html += '<div class="pres-caption-block" style="direction:rtl">';
        html += '<div class="pres-caption-label">Caption</div>';
        html += `<div>${esc(caption)}</div>`;
        html += '</div>';
    }

    // Notes
    if (notes) {
        html += '<div class="pres-notes-block" style="direction:rtl">';
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

async function submitCreatePost(workflowStatus) {
    const editId = document.getElementById('cp-edit-id').value;
    const date = document.getElementById('cp-date').value;
    const time = document.getElementById('cp-time').value || '12:00';
    const platforms = getSelectedPlatforms();
    const postType = document.getElementById('cp-post-type').value;
    const tov = document.getElementById('cp-tov').value.trim();
    const caption = document.getElementById('cp-caption').value.trim();
    const notes = document.getElementById('cp-notes').value.trim();

    if (!date) { showToast('Please select a date', 'error'); return; }
    if (platforms.length === 0) { showToast('Please select at least one platform', 'error'); return; }
    if (!tov) { showToast('Please enter text on design / TOV', 'error'); return; }

    const scheduledAt = date + 'T' + time + ':00';

    const postData = {
        client_id: clientId,
        platforms: platforms.join(','),
        post_type: postType,
        topic: tov,
        caption: caption,
        brief_notes: notes,
        scheduled_at: scheduledAt,
        workflow_status: workflowStatus,
        created_by_id: currentUser?.id || 1,
    };

    let postId;

    if (editId) {
        const res = await apiFetch(`${API_URL}/posts/${editId}`, { method: 'PUT', body: postData });
        if (!res || !res.success) { showToast('Failed to update post', 'error'); return; }
        postId = parseInt(editId);
        if (workflowStatus !== 'draft') {
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
        await apiFetch(`${API_URL}/posts/${postId}/upload-references`, { method: 'POST', body: formData });
    }

    showToast(editId ? 'Post updated' : 'Post created', 'success');
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

    // TOV / Topic block (indigo gradient)
    if (post.topic) {
        body += '<div class="pres-tov-block" style="direction:rtl">';
        body += '<div class="pres-tov-label">Text on Design / Topic</div>';
        body += `<div>${esc(post.topic)}</div>`;
        body += '</div>';
    }

    // Reference images
    const refUrls = (post.design_reference_urls || '').split(',').filter(u => u.trim());
    if (refUrls.length) {
        body += '<div class="pres-images-grid">';
        body += '<div class="pres-img-label">Design References</div>';
        refUrls.forEach(u => {
            const url = u.trim();
            body += `<img class="pres-ref-img" src="${url}" alt="Reference" onclick="window.open('${url}','_blank')">`;
        });
        body += '</div>';
    }

    // Design output
    const designUrls = (post.design_output_urls || '').split(',').filter(u => u.trim());
    if (designUrls.length) {
        body += '<div class="pres-images-grid">';
        body += '<div class="pres-img-label">Design Output</div>';
        designUrls.forEach(u => {
            const url = u.trim();
            body += `<img class="pres-design-img" src="${url}" alt="Design" onclick="window.open('${url}','_blank')">`;
        });
        body += '</div>';
    }

    // Designer upload zone (conditional: in_design + can upload design)
    if (wf === 'in_design' && canDo('uploadDesign')) {
        // Motion designer can only upload for video/reel posts
        const postType = (post.post_type || '').toLowerCase();
        const isMotion = currentUser?.role === 'motion_designer';
        const isDesigner = currentUser?.role === 'designer';
        const showUpload = (!isMotion && !isDesigner) || (isMotion && ['video', 'reel'].includes(postType)) || (isDesigner && ['post', 'story'].includes(postType));

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

    // Caption
    if (post.caption) {
        body += '<div class="pres-caption-block" style="direction:rtl">';
        body += '<div class="pres-caption-label">Caption</div>';
        body += `<div>${esc(post.caption)}</div>`;
        body += '</div>';
    }

    // Notes
    if (post.brief_notes) {
        body += '<div class="pres-notes-block" style="direction:rtl">';
        body += '<div class="pres-notes-label">Notes for Designer</div>';
        body += `<div>${esc(post.brief_notes)}</div>`;
        body += '</div>';
    }

    document.getElementById('post-slide-body').innerHTML = body;

    // Role-based action buttons
    document.getElementById('post-slide-actions').innerHTML = buildPostSlideActions(post);

    document.getElementById('post-slide-modal').classList.remove('hidden');
}

function closePostSlideModal() {
    document.getElementById('post-slide-modal').classList.add('hidden');
    slideViewPostId = null;
}

function buildPostSlideActions(post) {
    const wf = post.workflow_status || 'draft';
    let actions = '';

    // Draft: SMM/admin can edit and send to designer
    if (wf === 'draft' && canDo('createPost')) {
        actions += `<button onclick="editPostInModal(${post.id})" class="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700"><i class="fa-solid fa-pen mr-1"></i> Edit</button>`;
        actions += `<button onclick="clientTransitionPost(${post.id}, 'in_design')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"><i class="fa-solid fa-paper-plane mr-1"></i> Send to Designer</button>`;
    }

    // In Design: designer/motion_designer can upload and submit for review
    if (wf === 'in_design' && canDo('uploadDesign')) {
        const postType = (post.post_type || '').toLowerCase();
        const isMotion = currentUser?.role === 'motion_designer';
        const isDesigner = currentUser?.role === 'designer';
        const showActions = (!isMotion && !isDesigner) || (isMotion && ['video', 'reel'].includes(postType)) || (isDesigner && ['post', 'story'].includes(postType));

        if (showActions) {
            actions += `<button onclick="document.getElementById('psd-design-input')?.click()" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700"><i class="fa-solid fa-upload mr-1"></i> Upload Design</button>`;
            actions += `<button onclick="clientTransitionPost(${post.id}, 'design_review')" class="bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-700"><i class="fa-solid fa-eye mr-1"></i> Submit for Review</button>`;
        }
    }

    // Design Review: moderator/admin can approve or return
    if (wf === 'design_review' && canDo('approve')) {
        actions += `<button onclick="clientTransitionPost(${post.id}, 'approved')" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"><i class="fa-solid fa-check mr-1"></i> Approve</button>`;
        actions += `<button onclick="clientReturnToDesign(${post.id})" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fa-solid fa-rotate-left mr-1"></i> Return to Designer</button>`;
        actions += `<button onclick="clientReturnToCopywriter(${post.id})" class="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"><i class="fa-solid fa-pen-nib mr-1"></i> Return to Copywriter</button>`;
    }

    // Approved: moderator/admin can schedule
    if (wf === 'approved' && canDo('schedule')) {
        actions += `<button onclick="openSchedulePicker(${post.id})" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><i class="fa-solid fa-calendar-check mr-1"></i> Schedule Post</button>`;
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
    document.getElementById('cp-tov').value = post.topic || '';
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
