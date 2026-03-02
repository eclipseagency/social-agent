// Post form page JS
let platformImages = { instagram: [], linkedin: [], facebook: [] };
let platformVideos = { instagram: null, linkedin: null, facebook: null };
let briefReferenceUrls = [];
let carouselPreviewIndex = 0;
let currentPostType = 'post';
let activePreviewTab = 'instagram';
let mockupCarouselIdx = { instagram: 0, linkedin: 0, facebook: 0 };

function pageInit() {
    loadClientsDropdown('post-client');
    loadUsersDropdown('post-designer', 'designer');
    initPlatformGalleries();
    // Setup schedule toggle listeners
    ['instagram', 'linkedin', 'facebook'].forEach(p => {
        document.querySelectorAll(`input[name="schedule-${p}"]`).forEach(radio => {
            radio.addEventListener('change', function() {
                const timeInput = document.getElementById(`schedule-${p}-time`);
                if (timeInput) timeInput.classList.toggle('hidden', this.value !== 'later');
            });
        });
        // Dim preview tabs when platform is unchecked
        const cb = document.getElementById('platform-' + p);
        if (cb) cb.addEventListener('change', () => { updatePreviewTabs(); renderAllMockups(); });
        // Re-render on size change
        const sizeEl = document.getElementById('size-' + p);
        if (sizeEl) sizeEl.addEventListener('change', () => renderAllMockups());
    });
    renderAllMockups();
    loadContentSuggestions(document.getElementById('post-client')?.value);
}

function onPostTypeChange() {
    const select = document.getElementById('post-type-select');
    currentPostType = select.value;
    const storyFeatures = document.getElementById('instagram-story-features');
    if (currentPostType === 'story' || currentPostType === 'reel') {
        document.getElementById('size-instagram').value = '1080x1920';
        document.getElementById('size-facebook').value = '1080x1920';
        document.getElementById('platform-linkedin').checked = false;
        document.getElementById('platform-linkedin').disabled = true;
        if (storyFeatures) storyFeatures.classList.remove('hidden');
    } else if (currentPostType === 'video') {
        document.getElementById('size-instagram').value = '1080x1080';
        document.getElementById('size-facebook').value = '1080x1080';
        document.getElementById('size-linkedin').value = '1200x627';
        document.getElementById('platform-linkedin').disabled = false;
        if (storyFeatures) storyFeatures.classList.add('hidden');
    } else {
        document.getElementById('size-instagram').value = '1080x1080';
        document.getElementById('size-facebook').value = '1080x1080';
        document.getElementById('size-linkedin').value = '1200x627';
        document.getElementById('platform-linkedin').disabled = false;
        if (storyFeatures) storyFeatures.classList.add('hidden');
    }
    // Hide caption for stories/banners/brochures — only text on design matters
    const captionContainer = document.getElementById('new-post-caption-container');
    if (captionContainer) {
        captionContainer.style.display = ['story', 'banner', 'brochure'].includes(currentPostType) ? 'none' : '';
    }
    updatePreview();
    renderAllMockups();
}

function getPlatformSize(platform) {
    const select = document.getElementById('size-' + platform);
    return select ? select.value : '1080x1080';
}

function updatePreview() {
    const platforms = ['instagram', 'linkedin', 'facebook'];
    let activePlatforms = 0;
    platforms.forEach(p => { if (document.getElementById('platform-' + p)?.checked) activePlatforms++; });
    const countEl = document.getElementById('preview-platforms-count');
    if (countEl) countEl.textContent = activePlatforms;
    const typeEl = document.getElementById('preview-type');
    const typeTextEl = document.getElementById('preview-type-text');
    const typeIcons = { story: ['fa-mobile-screen', 'Story'], reel: ['fa-film', 'Reel'], video: ['fa-video', 'Video'], carousel: ['fa-images', 'Carousel'], banner: ['fa-panorama', 'Banner'], brochure: ['fa-book-open', 'Brochure'] };
    const t = typeIcons[currentPostType] || ['fa-image', 'Image'];
    if (typeEl) typeEl.innerHTML = `<i class="fa-solid ${t[0]}"></i>`;
    if (typeTextEl) typeTextEl.textContent = t[1];
    updatePreviewTabs();
    renderAllMockups();
}

function updateLivePreview() {
    const imgCount = platformImages.instagram.length + platformImages.linkedin.length + platformImages.facebook.length;
    const el = document.getElementById('preview-images-count');
    if (el) el.textContent = imgCount;
    renderAllMockups();
}

// === Preview Tab System ===
function switchPreviewTab(platform) {
    activePreviewTab = platform;
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.preview-tab[data-platform="${platform}"]`)?.classList.add('active');
    document.querySelectorAll('.mockup-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('mockup-' + platform);
    if (panel) panel.style.display = 'block';
}

function updatePreviewTabs() {
    ['instagram', 'linkedin', 'facebook'].forEach(p => {
        const tab = document.querySelector(`.preview-tab[data-platform="${p}"]`);
        if (!tab) return;
        const checked = document.getElementById('platform-' + p)?.checked;
        tab.classList.toggle('dimmed', !checked);
    });
}

function renderAllMockups() {
    renderPlatformMockup('instagram');
    renderPlatformMockup('linkedin');
    renderPlatformMockup('facebook');
}

function getPreviewData(platform) {
    const clientSelect = document.getElementById('post-client');
    const clientName = clientSelect ? (clientSelect.options[clientSelect.selectedIndex]?.text || 'Client') : 'Client';
    const initial = (clientName || 'C').charAt(0).toUpperCase();
    const caption = document.getElementById('caption-' + platform)?.value || '';
    const images = platformImages[platform] || [];
    const size = getPlatformSize(platform);
    return { clientName, initial, caption, images, size };
}

function getAspectStyle(size) {
    const [w, h] = (size || '1080x1080').split('x').map(Number);
    const ratio = w / h;
    if (ratio > 1.5) return 'aspect-ratio: 1.91/1; min-height: 140px;';
    if (ratio < 0.8) return 'aspect-ratio: 4/5; min-height: 200px;';
    return 'aspect-ratio: 1/1; min-height: 180px;';
}

function renderImageArea(images, idx, platform, aspectStyle) {
    if (!images.length) {
        return `<div style="${aspectStyle}"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><i class="fa-regular fa-image" style="font-size:36px;color:#ccc"></i></div></div>`;
    }
    const safeIdx = Math.min(idx, images.length - 1);
    let nav = '';
    if (images.length > 1) {
        nav = `<div class="mockup-carousel-nav prev" onclick="event.stopPropagation(); previewCarouselNav('${platform}',-1)"><i class="fa-solid fa-chevron-left"></i></div>
               <div class="mockup-carousel-nav next" onclick="event.stopPropagation(); previewCarouselNav('${platform}',1)"><i class="fa-solid fa-chevron-right"></i></div>
               <div class="mockup-carousel-dots">${images.map((_, i) => `<div class="dot ${i === safeIdx ? 'active' : ''}"></div>`).join('')}</div>`;
    }
    return `<div style="${aspectStyle};position:relative"><img src="${images[safeIdx]}" style="width:100%;height:100%;object-fit:cover">${nav}</div>`;
}

function previewCarouselNav(platform, dir) {
    const imgs = platformImages[platform] || [];
    if (imgs.length <= 1) return;
    mockupCarouselIdx[platform] = (mockupCarouselIdx[platform] + dir + imgs.length) % imgs.length;
    renderPlatformMockup(platform);
}

function renderPlatformMockup(platform) {
    const panel = document.getElementById('mockup-' + platform);
    if (!panel) return;
    const isStory = currentPostType === 'story' || currentPostType === 'reel';
    if (isStory) { renderStoryMockup(panel, platform); return; }
    if (platform === 'instagram') renderInstagramMockup(panel);
    else if (platform === 'linkedin') renderLinkedInMockup(panel);
    else if (platform === 'facebook') renderFacebookMockup(panel);
}

function renderStoryMockup(panel, platform) {
    const { clientName, initial, images } = getPreviewData(platform);
    const img = images.length ? `<img src="${images[0]}" style="width:100%;height:100%;object-fit:cover">` : `<div class="mockup-story-placeholder"><i class="fa-regular fa-image"></i></div>`;
    panel.innerHTML = `<div class="mockup-story-frame">${img}<div class="mockup-story-overlay"><div class="mockup-story-avatar">${initial}</div><div class="mockup-story-name">${esc(clientName)}</div></div></div>`;
}

function renderInstagramMockup(panel) {
    const { clientName, initial, caption, images, size } = getPreviewData('instagram');
    const aspect = getAspectStyle(size);
    const imgHtml = renderImageArea(images, mockupCarouselIdx.instagram, 'instagram', aspect);
    const capText = caption || 'Caption will appear here...';
    const shortCap = capText.length > 100 ? capText.substring(0, 100) + '<span class="ig-more"> ...more</span>' : capText;
    panel.innerHTML = `
        <div class="mockup-ig-header"><div class="mockup-ig-avatar">${initial}</div><div><div class="mockup-ig-user">${esc(clientName)}</div></div><div class="mockup-ig-dots">···</div></div>
        <div class="mockup-ig-image">${imgHtml}</div>
        <div class="mockup-ig-actions"><i class="fa-regular fa-heart"></i><i class="fa-regular fa-comment"></i><i class="fa-regular fa-paper-plane"></i><i class="fa-regular fa-bookmark ig-save"></i></div>
        <div class="mockup-ig-likes">${images.length ? '0 likes' : ''}</div>
        <div class="mockup-ig-caption"><span class="ig-user">${esc(clientName)}</span> ${shortCap}</div>`;
}

function renderLinkedInMockup(panel) {
    const { clientName, initial, caption, images, size } = getPreviewData('linkedin');
    const aspect = getAspectStyle(size);
    const imgHtml = renderImageArea(images, mockupCarouselIdx.linkedin, 'linkedin', aspect);
    const capText = caption || 'Caption will appear here...';
    panel.innerHTML = `
        <div class="mockup-li-header"><div class="mockup-li-avatar">${initial}</div><div class="mockup-li-info"><div class="mockup-li-name">${esc(clientName)}</div><div class="mockup-li-company">Company · Just now</div></div><span class="mockup-li-follow">+ Follow</span></div>
        <div class="mockup-li-caption">${esc(capText)}</div>
        <div class="mockup-li-image">${imgHtml}</div>
        <div class="mockup-li-reactions"><span>👍</span><span>❤️</span><span>💡</span><span style="margin-left:auto">0 reactions</span></div>
        <div class="mockup-li-actions"><span><i class="fa-regular fa-thumbs-up"></i> Like</span><span><i class="fa-regular fa-comment"></i> Comment</span><span><i class="fa-solid fa-repeat"></i> Repost</span><span><i class="fa-regular fa-paper-plane"></i> Send</span></div>`;
}

function renderFacebookMockup(panel) {
    const { clientName, initial, caption, images, size } = getPreviewData('facebook');
    const aspect = getAspectStyle(size);
    const imgHtml = renderImageArea(images, mockupCarouselIdx.facebook, 'facebook', aspect);
    const capText = caption || 'Caption will appear here...';
    panel.innerHTML = `
        <div class="mockup-fb-header"><div class="mockup-fb-avatar">${initial}</div><div class="mockup-fb-info"><div class="mockup-fb-name">${esc(clientName)}</div><div class="mockup-fb-meta">Just now · <i class="fa-solid fa-earth-americas" style="font-size:10px"></i></div></div></div>
        <div class="mockup-fb-caption">${esc(capText)}</div>
        <div class="mockup-fb-image">${imgHtml}</div>
        <div class="mockup-fb-stats"><span>👍 ❤️ 0</span><span>0 comments · 0 shares</span></div>
        <div class="mockup-fb-actions"><span><i class="fa-regular fa-thumbs-up"></i> Like</span><span><i class="fa-regular fa-comment"></i> Comment</span><span><i class="fa-solid fa-share"></i> Share</span></div>`;
}

// === AI Content Suggestions (contextual hints on form) ===
async function loadContentSuggestions(clientId) {
    const container = document.getElementById('content-hints');
    const list = document.getElementById('content-hints-list');
    if (!container || !list) return;
    try {
        let url = API_URL + '/suggestions';
        if (clientId) url += '?client_id=' + clientId;
        const data = await fetch(url).then(r => r.json());
        if (!data || !data.best_hours || data.best_hours.length === 0) { container.classList.add('hidden'); return; }
        container.classList.remove('hidden');
        let html = '';
        // Best time per platform
        if (data.platform_best_times) {
            for (const [plat, info] of Object.entries(data.platform_best_times)) {
                html += `<div class="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">${getPlatformIcon(plat)}<span>Best time for ${getPlatformName(plat)}: <strong>${formatHour(info.hour)}</strong> <span class="text-purple-500">(${info.avg_engagement.toFixed(1)}% eng.)</span></span></div>`;
            }
        }
        // Best content type
        if (data.best_content_types && data.best_content_types.length > 0) {
            const best = data.best_content_types[0];
            html += `<div class="flex items-center gap-2 p-2 bg-blue-50 rounded-lg"><i class="fa-solid fa-trophy text-amber-500"></i><span>Top type: <strong>${best.type}</strong> (${best.avg_engagement.toFixed(1)}% avg eng.)</span></div>`;
        }
        list.innerHTML = html || '<p class="text-gray-400">No suggestions yet</p>';
    } catch (e) { container.classList.add('hidden'); }
}

function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h > 12 ? (h - 12) + ' PM' : h + ' AM';
}

function initPlatformGalleries() {
    platformImages = { instagram: [], linkedin: [], facebook: [] };
    platformVideos = { instagram: null, linkedin: null, facebook: null };
    ['instagram', 'linkedin', 'facebook'].forEach(p => {
        const gallery = document.getElementById(p + '-gallery');
        if (gallery) gallery.innerHTML = '';
        const videoPreview = document.getElementById(p + '-video-preview');
        if (videoPreview) videoPreview.innerHTML = '';
    });
}

async function uploadPlatformImages(platform, input) {
    const files = input.files;
    if (!files.length) return;
    for (let file of files) {
        const formData = new FormData();
        formData.append('image', file);
        try {
            const res = await fetch(API_URL + '/upload', { method: 'POST', body: formData }).then(r => r.json());
            if (res.url) { platformImages[platform].push(res.url); renderPlatformGallery(platform); }
        } catch (e) { showToast('Upload failed: ' + e.message, 'error'); }
    }
    input.value = '';
    updateLivePreview();
}

function removePlatformImage(platform, index) { platformImages[platform].splice(index, 1); renderPlatformGallery(platform); updateLivePreview(); }

function renderPlatformGallery(platform) {
    const gallery = document.getElementById(platform + '-gallery');
    if (!gallery) return;
    gallery.innerHTML = platformImages[platform].map((url, i) => `
        <div class="upload-thumb-wrap">
            <img src="${url}" class="upload-thumb-img" onclick="openImagePreview('${url}')">
            <div class="upload-thumb-badge">${i + 1}</div>
            <div class="upload-thumb-actions">
                <a href="${url}" download="image-${i + 1}" class="upload-thumb-btn download" title="Download"><i class="fa-solid fa-download"></i></a>
                <button class="upload-thumb-btn remove" onclick="removePlatformImage('${platform}', ${i})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
    `).join('');
}

async function uploadPlatformVideo(platform, input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('video', file);
    try {
        const res = await fetch(API_URL + '/upload-video', { method: 'POST', body: formData }).then(r => r.json());
        if (res.url) { platformVideos[platform] = res.url; renderPlatformVideoPreview(platform); showToast('Video uploaded', 'success'); }
        else { showToast(res.error || 'Video upload failed', 'error'); }
    } catch (e) { showToast('Upload error', 'error'); }
    input.value = '';
}

function removePlatformVideo(platform) { platformVideos[platform] = null; renderPlatformVideoPreview(platform); }

function renderPlatformVideoPreview(platform) {
    const container = document.getElementById(platform + '-video-preview');
    if (!container) return;
    if (!platformVideos[platform]) { container.innerHTML = ''; return; }
    container.innerHTML = `<div class="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200"><i class="fa-solid fa-film text-green-600"></i><span class="text-xs text-green-700 flex-1 truncate">${platformVideos[platform]}</span><button onclick="removePlatformVideo('${platform}')" class="text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div>`;
}

async function uploadBriefReferences(input) {
    const files = input.files;
    if (!files.length) return;
    const formData = new FormData();
    for (let f of files) formData.append('images', f);
    try {
        const res = await fetch(API_URL + '/upload-design-reference', { method: 'POST', body: formData }).then(r => r.json());
        if (res.urls) {
            res.urls.forEach(u => briefReferenceUrls.push(u.url));
            renderBriefReferencesGallery();
        }
    } catch (e) { showToast('Upload failed', 'error'); }
    input.value = '';
}

function removeBriefReference(index) { briefReferenceUrls.splice(index, 1); renderBriefReferencesGallery(); }

function renderBriefReferencesGallery() {
    const gallery = document.getElementById('brief-references-gallery');
    if (!gallery) return;
    gallery.innerHTML = briefReferenceUrls.map((url, i) => `
        <div class="upload-thumb-wrap">
            <img src="${url}" class="upload-thumb-img" onclick="openImagePreview('${url}')">
            <div class="upload-thumb-actions">
                <a href="${url}" download="reference-${i + 1}" class="upload-thumb-btn download" title="Download"><i class="fa-solid fa-download"></i></a>
                <button class="upload-thumb-btn remove" onclick="removeBriefReference(${i})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
    `).join('');
}

function openImagePreview(url) {
    let overlay = document.getElementById('img-preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'img-preview-overlay';
        overlay.className = 'img-preview-overlay';
        overlay.innerHTML = '<div class="img-preview-close" onclick="closeImagePreview()">&times;</div><img class="img-preview-full"><a class="img-preview-download" download><i class="fa-solid fa-download"></i> Download</a>';
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeImagePreview(); });
        document.body.appendChild(overlay);
    }
    overlay.querySelector('.img-preview-full').src = url;
    overlay.querySelector('.img-preview-download').href = url;
    overlay.classList.add('active');
}

function closeImagePreview() {
    const overlay = document.getElementById('img-preview-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function loadScheduleSuggestions(clientId) {
    if (!clientId) return;
    try {
        const data = await fetch(API_URL + '/clients/' + clientId + '/suggest-schedule?count=5').then(r => r.json());
        const container = document.getElementById('schedule-suggestions');
        const list = document.getElementById('suggestions-list');
        if (!data.suggested_slots || data.suggested_slots.length === 0) { container?.classList.add('hidden'); return; }
        container?.classList.remove('hidden');
        list.innerHTML = data.suggested_slots.map(s => `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs cursor-pointer hover:bg-indigo-50 transition" onclick="applySuggestedTime('${s.datetime}', '${s.platform}')">
                <div><span class="font-semibold">${s.day_name}</span> ${s.date} ${s.time}</div>
                <span class="px-2 py-0.5 rounded ${getPlatformBgClass(s.platform)}">${getPlatformIcon(s.platform)} ${s.platform}</span>
            </div>
        `).join('');
    } catch (e) { /* silent */ }
}

function applySuggestedTime(datetime, platform) {
    const timeInput = document.getElementById('schedule-' + platform + '-time');
    if (timeInput) {
        timeInput.value = datetime;
        timeInput.classList.remove('hidden');
        const laterRadio = document.querySelector(`input[name="schedule-${platform}"][value="later"]`);
        if (laterRadio) laterRadio.checked = true;
    }
}

function getStoryFeatures() {
    return { stickers: [], hashtags: '', poll: null, link: '' };
}

async function saveBrief(workflowStatus) {
    const clientId = document.getElementById('post-client')?.value;
    if (!clientId) { alert('Select a client'); return; }
    const topic = document.getElementById('post-topic')?.value?.trim();
    if (!topic) { alert('Enter a post topic'); return; }
    // Collect selected platforms
    const selectedPlatforms = ['instagram', 'linkedin', 'facebook']
        .filter(p => document.getElementById('platform-' + p)?.checked)
        .join(',') || 'instagram';
    // Collect post type and primary size
    const postType = document.getElementById('post-type-select')?.value || 'post';
    const primaryPlatform = selectedPlatforms.split(',')[0] || 'instagram';
    const imageSize = document.getElementById('size-' + primaryPlatform)?.value || '1080x1080';
    const data = {
        topic,
        caption: document.getElementById('post-caption')?.value || '',
        tov: document.getElementById('post-tov')?.value || '',
        brief_notes: document.getElementById('post-brief-notes')?.value || '',
        design_reference_urls: briefReferenceUrls.join(','),
        priority: document.getElementById('post-priority')?.value || 'normal',
        platforms: selectedPlatforms,
        post_type: postType,
        image_size: imageSize,
        workflow_status: workflowStatus,
        created_by_id: currentUser?.id || 1,
        assigned_designer_id: document.getElementById('post-designer')?.value || null
    };
    const res = await fetch(API_URL + '/clients/' + clientId + '/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
    if (res.success) {
        const msgs = { 'draft': 'Draft saved', 'pending_review': 'Sent for review', 'in_design': 'Sent to designer' };
        showToast(msgs[workflowStatus] || 'Saved', 'success');
        setTimeout(() => { window.location.href = '/calendar'; }, 1000);
    } else { showToast(res.error || 'Failed', 'error'); }
}

function renderResults(resultDiv, results) {
    resultDiv.innerHTML = '<div class="flex flex-wrap gap-4 justify-center">' + results.map(r => {
        const isSuccess = r.success || r.scheduled;
        const isPending = r.pending;
        const statusText = r.scheduled ? 'Scheduled'
            : isPending ? 'Publishing...'
            : isSuccess ? 'Published'
            : r.error || 'Failed';
        return `<div class="result-card ${isSuccess || isPending ? r.platform : 'error'} ${isSuccess ? 'success-animation' : ''}">
            <div class="icon">${getOfficialPlatformIcon(r.platform)}</div>
            <div class="platform-name">${getPlatformName(r.platform)}</div>
            <div class="status">${statusText}</div>
        </div>`;
    }).join('') + '</div>';
}

async function waitForPublish(postId, platform) {
    // Poll every 500ms for up to 8 seconds, then give up and show pending
    for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const res = await fetch(API_URL + '/posts/' + postId + '/publish-status').then(r => r.json());
            if (res.status !== 'pending') {
                const log = (res.logs || []).find(l => l.platform === platform);
                const failed = res.status === 'failed' || (log && log.status === 'failed');
                return { platform, success: !failed, error: failed ? (log?.response || 'Failed to publish') : '' };
            }
        } catch (e) {}
    }
    // Still pending after 8s — publishing is happening in the background
    return { platform, pending: true };
}

async function submitPost() {
    const clientId = document.getElementById('post-client')?.value;
    if (!clientId) { alert('Select a client'); return; }
    const topic = document.getElementById('post-topic')?.value?.trim() || '';
    const platforms = ['instagram', 'linkedin', 'facebook'];
    const btn = document.getElementById('submit-post-btn');
    const resultDiv = document.getElementById('post-result');
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner mx-auto"></div>';
    let results = [];
    let pendingPolls = [];

    for (const platform of platforms) {
        if (!document.getElementById('platform-' + platform)?.checked) continue;
        const caption = document.getElementById('caption-' + platform)?.value || topic;
        const scheduleMode = document.querySelector(`input[name="schedule-${platform}"]:checked`)?.value || 'now';
        const scheduleTime = document.getElementById('schedule-' + platform + '-time')?.value || '';
        const imageSize = getPlatformSize(platform);
        const images = platformImages[platform] || [];
        const video = platformVideos[platform] || '';

        if (scheduleMode === 'later' && scheduleTime) {
            const data = {
                topic, caption, platforms: platform,
                image_url: video || images.join(','),
                scheduled_at: scheduleTime,
                image_size: imageSize,
                post_type: currentPostType,
                workflow_status: 'scheduled',
                created_by_id: currentUser?.id
            };
            const res = await fetch(API_URL + '/clients/' + clientId + '/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
            results.push({ platform, success: res.success, scheduled: true });
        } else {
            const data = {
                client_id: parseInt(clientId), topic, caption, platform,
                image_urls: images, video_url: video,
                post_type: currentPostType, image_size: imageSize
            };
            const res = await fetch(API_URL + '/post-now-single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
            if (!res.success) {
                results.push({ platform, success: false, error: res.error || 'Failed' });
            } else {
                results.push({ platform, pending: true });
                pendingPolls.push({ platform, postId: res.post_id });
            }
        }
    }

    // Re-enable button and show initial "Publishing..." cards immediately
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Post';
    renderResults(resultDiv, results);

    // Poll all platforms in parallel
    await Promise.all(pendingPolls.map(async ({ platform, postId }) => {
        const finalResult = await waitForPublish(postId, platform);
        const idx = results.findIndex(r => r.platform === platform);
        if (idx !== -1) results[idx] = finalResult;
        renderResults(resultDiv, results);
    }));

    initPlatformGalleries();
}
