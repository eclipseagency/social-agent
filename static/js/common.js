const API_URL = '/api';

// === Utility Functions ===
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

async function apiFetch(url, options = {}) {
    try {
        const defaults = { headers: { 'Content-Type': 'application/json' } };
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            options.body = JSON.stringify(options.body);
        }
        if (options.body instanceof FormData) {
            delete defaults.headers['Content-Type'];
        }
        const res = await fetch(url, { ...defaults, ...options });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Request failed', 'error');
            return null;
        }
        return data;
    } catch (e) {
        showToast('Connection error', 'error');
        console.error('API Error:', e);
        return null;
    }
}

// === Platform Helpers ===
function getPlatformIcon(platform) {
    if (platform === 'instagram') return '<i class="fa-brands fa-instagram text-pink-500"></i>';
    if (platform === 'linkedin') return '<i class="fa-brands fa-linkedin text-blue-600"></i>';
    if (platform === 'facebook') return '<i class="fa-brands fa-facebook text-blue-500"></i>';
    return '<i class="fa-solid fa-share-nodes"></i>';
}

function getPlatformBgClass(platform) {
    if (platform === 'instagram') return 'bg-pink-100 text-pink-800';
    if (platform === 'linkedin') return 'bg-blue-100 text-blue-800';
    if (platform === 'facebook') return 'bg-indigo-100 text-indigo-800';
    return 'bg-gray-100';
}

function getPlatformName(platform) {
    return ({ instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook' })[platform] || platform;
}

function getOfficialPlatformIcon(platform) {
    const icons = {
        instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
        linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
        facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
    };
    return icons[platform] || '';
}

// === Role Permissions ===
// Workflow: draft → in_design → design_review → approved → scheduled → posted
// Manager: assigns team members to clients, reviews designs in design_review, approves or sends back
// Copywriter: creates post in draft, writes caption/text/brief, uploads references, sends to designer
// Designer/Motion Editor: executes design, uploads files, submits for review
// SM Specialist: schedules approved posts, monitors publishing
const ROLE_PERMISSIONS = {
    admin:         { createPost: true, editCaption: true, uploadDesign: true, uploadRef: true, approve: true, schedule: true, viewAll: true, manageTeam: true, manageClients: true, viewClients: true, manageRules: true },
    manager:       { createPost: true, editCaption: true, uploadDesign: false, uploadRef: true, approve: true, schedule: false, viewAll: true, manageTeam: true, manageClients: true, viewClients: true, manageRules: true },
    sm_specialist: { createPost: false, editCaption: true, uploadDesign: false, uploadRef: false, approve: false, schedule: true, viewAll: true, manageTeam: false, manageClients: false, viewClients: true, manageRules: false },
    copywriter:    { createPost: true, editCaption: true, uploadDesign: false, uploadRef: true, approve: false, schedule: false, viewAll: false, manageTeam: false, manageClients: false, viewClients: true, manageRules: false },
    designer:      { createPost: false, editCaption: false, uploadDesign: true, uploadRef: false, approve: false, schedule: false, viewAll: false, manageTeam: false, manageClients: false, viewClients: false, manageRules: false },
    motion_editor: { createPost: false, editCaption: false, uploadDesign: true, uploadRef: false, approve: false, schedule: false, viewAll: false, manageTeam: false, manageClients: false, viewClients: false, manageRules: false },
};

function canDo(action) {
    const role = currentUser?.role || 'user';
    return ROLE_PERMISSIONS[role]?.[action] || false;
}

// === Auth Functions ===
let currentUser = null;

function login() {
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) {
        const err = document.getElementById('login-error');
        if (err) { err.textContent = 'Enter email and password'; err.classList.remove('hidden'); }
        return;
    }
    fetch(API_URL + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            window.location.href = '/';
        } else {
            const err = document.getElementById('login-error');
            if (err) { err.textContent = data.error || 'Invalid credentials'; err.classList.remove('hidden'); }
        }
    });
}

async function register() {
    const name = document.getElementById('register-name')?.value;
    const email = document.getElementById('register-email')?.value;
    const password = document.getElementById('register-password')?.value;
    const confirm = document.getElementById('register-confirm')?.value;
    const errorEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
    if (!name || !email || !password || !confirm) { if (errorEl) { errorEl.textContent = 'All fields are required'; errorEl.classList.remove('hidden'); } return; }
    if (!email.includes('@')) { if (errorEl) { errorEl.textContent = 'Invalid email address'; errorEl.classList.remove('hidden'); } return; }
    if (password.length < 6) { if (errorEl) { errorEl.textContent = 'Password must be at least 6 characters'; errorEl.classList.remove('hidden'); } return; }
    if (password !== confirm) { if (errorEl) { errorEl.textContent = 'Passwords do not match'; errorEl.classList.remove('hidden'); } return; }
    try {
        const res = await fetch(API_URL + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }).then(r => r.json());
        if (res.success) {
            if (successEl) { successEl.textContent = 'Account created successfully!'; successEl.classList.remove('hidden'); }
            setTimeout(() => { window.location.href = '/login'; }, 2000);
        } else {
            if (errorEl) { errorEl.textContent = res.error || 'Could not create account'; errorEl.classList.remove('hidden'); }
        }
    } catch (e) { if (errorEl) { errorEl.textContent = 'Connection error'; errorEl.classList.remove('hidden'); } }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    window.location.href = '/login';
}

function checkAuth() {
    const saved = localStorage.getItem('user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            // Update UI elements
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = currentUser.name || currentUser.username || currentUser.email;
            const jobEl = document.getElementById('user-job-title');
            if (jobEl && currentUser.job_title) { jobEl.textContent = currentUser.job_title; jobEl.classList.remove('hidden'); }
            // Role badge
            const roleBadge = document.getElementById('user-role-badge');
            if (roleBadge) {
                const roleLabels = { admin: 'Admin', manager: 'Manager', sm_specialist: 'Moderator', copywriter: 'Copywriter', designer: 'Designer', motion_editor: 'Motion Editor' };
                const roleColors = { admin: 'bg-red-500/20 text-red-300', manager: 'bg-green-500/20 text-green-300', sm_specialist: 'bg-blue-500/20 text-blue-300', copywriter: 'bg-yellow-500/20 text-yellow-300', designer: 'bg-purple-500/20 text-purple-300', motion_editor: 'bg-pink-500/20 text-pink-300' };
                const r = currentUser.role || 'user';
                roleBadge.textContent = roleLabels[r] || r;
                roleBadge.className = `inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 mb-4 ${roleColors[r] || 'bg-slate-500/20 text-slate-300'}`;
            }
            // Hide admin-only nav items for non-admins
            if (currentUser.role !== 'admin') {
                const usersNav = document.getElementById('users-nav');
                if (usersNav) usersNav.classList.add('hidden');
            }
            // Role-based nav filtering
            document.querySelectorAll('[data-nav-perm]').forEach(el => {
                const perm = el.getAttribute('data-nav-perm');
                if (perm && !canDo(perm)) {
                    el.style.display = 'none';
                }
            });
            // Apply dark mode
            if (currentUser.dark_mode) document.body.classList.add('dark');
            // Start notification polling
            loadNotificationCount();
            setInterval(loadNotificationCount, 30000);
            // Call page-specific init
            if (typeof pageInit === 'function') pageInit();
        } catch (e) {
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
    } else {
        // On login page, just stay. On other pages, redirect.
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
        }
    }
}

// === Mobile Menu ===
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('hidden');
    document.body.style.overflow = sidebar?.classList.contains('open') ? 'hidden' : '';
}

function closeMobileMenu() {
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// === Dark Mode ===
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark') ? 1 : 0;
    if (currentUser) {
        fetch(API_URL + '/users/' + currentUser.id + '/dark-mode', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dark_mode: isDark })
        });
        currentUser.dark_mode = isDark;
        localStorage.setItem('user', JSON.stringify(currentUser));
    }
}

// === Notifications ===
async function loadNotificationCount() {
    if (!currentUser) return;
    try {
        const data = await fetch(API_URL + '/notifications/count?user_id=' + currentUser.id).then(r => r.json());
        const badge = document.getElementById('sidebar-notif-badge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) { /* silent */ }
}

// === Dropdown Loaders ===
async function loadClientsDropdown(selectId = 'post-client') {
    const clients = await fetch(API_URL + '/clients').then(r => r.json());
    const el = document.getElementById(selectId);
    if (el) el.innerHTML = clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return clients;
}

async function loadUsersDropdown(selectId, roleFilter = '') {
    let url = API_URL + '/users';
    if (roleFilter) url += '?role=' + roleFilter;
    const users = await fetch(url).then(r => r.json());
    const el = document.getElementById(selectId);
    if (el) {
        const currentHtml = el.innerHTML;
        // Keep existing first option if it's a placeholder
        const firstOption = el.querySelector('option')?.outerHTML || '';
        el.innerHTML = firstOption + users.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
    }
    return users;
}

// === Time Display ===
function updateTime() {
    const el = document.getElementById('current-time');
    if (el) el.textContent = new Date().toLocaleString('en-US');
}

// === Calendar Shared Helpers ===

function getPostStatus(post) {
    const wf = post.workflow_status || 'draft';
    if (wf === 'posted') return 'Posted';
    if (wf === 'scheduled') return 'Scheduled';
    if (wf === 'approved') return 'Approved';
    if (wf === 'design_review') return 'Design Review';
    if (wf === 'needs_caption') return 'Draft';  // Legacy - treat as draft
    if (wf === 'in_design') return 'In Design';
    if (wf === 'draft') return 'Draft';
    return wf.replace(/_/g, ' ');
}

function getStatusColor(status) {
    const colors = {
        'Draft': '#94a3b8',
        'In Design': '#f97316',
        'Design Review': '#8b5cf6',
        'Approved': '#22c55e',
        'Scheduled': '#3b82f6',
        'Posted': '#10b981'
    };
    return colors[status] || '#94a3b8';
}

function getStatusBorderClass(post) {
    const status = getPostStatus(post);
    const map = {
        'Draft': 'cal-border-draft',
        'In Design': 'cal-border-needs-design',
        'Design Review': 'cal-border-design-review',
        'Approved': 'cal-border-ready',
        'Scheduled': 'cal-border-scheduled',
        'Posted': 'cal-border-posted'
    };
    return map[status] || 'cal-border-draft';
}

function getContentTypeIcon(type) {
    const icons = {
        'post': '<i class="fa-solid fa-image text-blue-500" title="Post"></i>',
        'story': '<i class="fa-solid fa-mobile-screen text-pink-500" title="Story"></i>',
        'reel': '<i class="fa-solid fa-film text-purple-500" title="Reel"></i>',
        'video': '<i class="fa-solid fa-video text-red-500" title="Video"></i>'
    };
    return icons[(type || 'post').toLowerCase()] || icons['post'];
}

function renderCalendarMiniCard(post) {
    const status = getPostStatus(post);
    const borderClass = getStatusBorderClass(post);
    const time = (post.scheduled_at || '').substring(11, 16) || '';
    const topic = post.topic || '';
    const topicPreview = topic.length > 35 ? topic.substring(0, 32) + '...' : topic;
    const caption = post.caption || '';
    const captionPreview = caption.length > 40 ? caption.substring(0, 40) + '...' : caption;
    const thumbnail = (post.design_output_urls || '').split(',')[0].trim();
    const platform = post.platforms || '';
    const contentType = post.post_type || 'post';
    const wf = post.workflow_status || 'draft';

    // Show upload hint for designers on in_design posts
    const isDesignerUpload = canDo('uploadDesign') && wf === 'in_design';

    const canDrag = canDo('schedule') || canDo('approve');
    // Use the right click handler depending on which page we're on
    const clickFn = typeof openClientPostDetail === 'function' && typeof clientId !== 'undefined' ? 'openClientPostDetail' : 'openPostDetail';
    return `<div class="cal-mini-card ${borderClass} ${isDesignerUpload ? 'cal-card-designer-upload' : ''}" data-post-id="${post.id}" ${canDrag ? `draggable="true" ondragstart="onCardDragStart(event, ${post.id})"` : ''}
                 onclick="${clickFn}(${post.id}); event.stopPropagation();">
        <div class="cal-card-top">
            ${time ? `<span class="cal-card-time">${esc(time)}</span>` : ''}
            <span class="cal-card-icons">${getPlatformIcon(platform)} ${getContentTypeIcon(contentType)}</span>
            <span class="cal-status-dot" style="background:${getStatusColor(status)}" title="${status}"></span>
        </div>
        ${thumbnail ? `<div class="cal-card-thumb"><img src="${thumbnail}" alt="" loading="lazy"></div>` : ''}
        ${topicPreview ? `<div class="cal-card-topic">${esc(topicPreview)}</div>` : ''}
        ${captionPreview ? `<div class="cal-card-caption">${esc(captionPreview)}</div>` : ''}
        ${isDesignerUpload ? `<div class="cal-card-upload-hint"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Design</div>` : ''}
        <div class="cal-card-meta">
            <span class="cal-card-client">${esc(post.client_name || '')}</span>
            ${(post.assigned_designer_name || post.assigned_writer_name || post.assigned_sm_name) ? `<span class="cal-card-assignee"><i class="fa-solid fa-user text-indigo-400"></i> ${esc(post.assigned_designer_name || post.assigned_writer_name || post.assigned_sm_name)}</span>` : ''}
        </div>
    </div>`;
}

// === Init ===
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    updateTime();
    setInterval(updateTime, 1000);
});
