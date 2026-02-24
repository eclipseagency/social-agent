// Post form page JS
let platformImages = { instagram: [], linkedin: [], facebook: [] };
let platformVideos = { instagram: null, linkedin: null, facebook: null };
let briefReferenceUrls = [];
let carouselPreviewIndex = 0;
let currentPostType = 'post';

function pageInit() {
    loadClientsDropdown('post-client');
    initPlatformGalleries();
    // Setup schedule toggle listeners
    ['instagram', 'linkedin', 'facebook'].forEach(p => {
        document.querySelectorAll(`input[name="schedule-${p}"]`).forEach(radio => {
            radio.addEventListener('change', function() {
                const timeInput = document.getElementById(`schedule-${p}-time`);
                if (timeInput) timeInput.classList.toggle('hidden', this.value !== 'later');
            });
        });
    });
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
    updatePreview();
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
    if (currentPostType === 'story') {
        if (typeEl) typeEl.innerHTML = '<i class="fa-solid fa-mobile-screen"></i>';
        if (typeTextEl) typeTextEl.textContent = 'Story';
    } else {
        if (typeEl) typeEl.innerHTML = '<i class="fa-solid fa-image"></i>';
        if (typeTextEl) typeTextEl.textContent = 'Image';
    }
}

function updateLivePreview() {
    const clientSelect = document.getElementById('post-client');
    const clientName = clientSelect ? clientSelect.options[clientSelect.selectedIndex]?.text : 'Client Name';
    document.getElementById('preview-name').textContent = clientName || 'Client Name';
    document.getElementById('preview-avatar').textContent = (clientName || 'C').charAt(0).toUpperCase();
    const caption = document.getElementById('caption-instagram')?.value || document.getElementById('caption-linkedin')?.value || document.getElementById('caption-facebook')?.value || '';
    document.getElementById('preview-caption').textContent = caption || 'Caption will appear here...';
    const imgCount = platformImages.instagram.length + platformImages.linkedin.length + platformImages.facebook.length;
    document.getElementById('preview-images-count').textContent = imgCount;
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
        <div class="relative w-16 h-16 rounded-lg overflow-hidden border">
            <img src="${url}" class="w-full h-full object-cover">
            <div class="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl cursor-pointer text-xs" onclick="removePlatformImage('${platform}', ${i})">&times;</div>
            <div class="absolute top-0 left-0 bg-indigo-600 text-white w-5 h-5 flex items-center justify-center rounded-br text-xs">${i + 1}</div>
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
        <div class="relative w-16 h-16 rounded-lg overflow-hidden border">
            <img src="${url}" class="w-full h-full object-cover">
            <div class="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl cursor-pointer text-xs" onclick="removeBriefReference(${i})">&times;</div>
        </div>
    `).join('');
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
        created_by_id: currentUser?.id || 1
    };
    const res = await fetch(API_URL + '/clients/' + clientId + '/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
    if (res.success) {
        const msgs = { 'draft': 'Draft saved', 'in_design': 'Sent to designer' };
        showToast(msgs[workflowStatus] || 'Saved', 'success');
        setTimeout(() => { window.location.href = '/calendar'; }, 1000);
    } else { showToast(res.error || 'Failed', 'error'); }
}

async function submitPost() {
    const clientId = document.getElementById('post-client')?.value;
    if (!clientId) { alert('Select a client'); return; }
    const topic = document.getElementById('post-topic')?.value?.trim() || '';
    const platforms = ['instagram', 'linkedin', 'facebook'];
    const btn = document.getElementById('submit-post-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner mx-auto"></div>';
    let results = [];

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
            results.push({ platform, ...res });
        }
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Post';

    const resultDiv = document.getElementById('post-result');
    resultDiv.innerHTML = '<div class="flex flex-wrap gap-4 justify-center">' + results.map(r => {
        const isSuccess = r.success || r.scheduled;
        return `<div class="result-card ${isSuccess ? r.platform : 'error'} success-animation">
            <div class="icon">${getOfficialPlatformIcon(r.platform)}</div>
            <div class="platform-name">${getPlatformName(r.platform)}</div>
            <div class="status">${r.scheduled ? 'Scheduled' : isSuccess ? 'Published' : r.error || 'Failed'}</div>
        </div>`;
    }).join('') + '</div>';

    initPlatformGalleries();
}
