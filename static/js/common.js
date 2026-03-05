const API_URL = '/api';

// === Utility Functions ===
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function copyToClipboard(text) {
    if (!text || !text.trim()) { showToast('Nothing to copy', 'error'); return; }
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Copied to clipboard', 'success');
    });
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

// === Shared Helpers ===
function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h > 12 ? (h - 12) + ' PM' : h + ' AM';
}

function renderEditComment(content) {
    const beforeMatch = content.match(/⸺ Before:\n([\s\S]*?)(?=\n\n⸺ After:)/);
    const afterMatch = content.match(/⸺ After:\n([\s\S]*?)$/);
    const labelMatch = content.match(/^✏️\s*(.+?)\s*edited/);
    if (beforeMatch && afterMatch) {
        const label = labelMatch ? labelMatch[1] : 'Field';
        const before = esc(beforeMatch[1].trim());
        const after = esc(afterMatch[1].trim());
        return `<strong>${esc(label)} edited</strong>
            <div class="edit-diff" dir="auto">
                <div class="edit-before"><span class="edit-label">Before</span>${before}</div>
                <div class="edit-after"><span class="edit-label">After</span>${after}</div>
            </div>`;
    }
    return esc(content);
}

// === Platform Helpers ===
function getPlatformIcon(platform) {
    if (platform === 'instagram') return '<i class="fa-brands fa-instagram text-pink-500"></i>';
    if (platform === 'linkedin') return '<i class="fa-brands fa-linkedin text-blue-600"></i>';
    if (platform === 'facebook') return '<i class="fa-brands fa-facebook text-blue-500"></i>';
    if (platform === 'web') return '<i class="fa-solid fa-globe text-green-500"></i>';
    return '<i class="fa-solid fa-share-nodes"></i>';
}

function getPlatformBgClass(platform) {
    if (platform === 'instagram') return 'bg-pink-100 text-pink-800';
    if (platform === 'linkedin') return 'bg-blue-100 text-blue-800';
    if (platform === 'facebook') return 'bg-indigo-100 text-indigo-800';
    if (platform === 'web') return 'bg-green-100 text-green-800';
    return 'bg-gray-100';
}

function getPlatformName(platform) {
    return ({ instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', web: 'Web' })[platform] || platform;
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
// Workflow: draft → pending_review → in_design → approved → scheduled → posted
// Manager: reviews content in pending_review before sending to design. Design approval is done externally.
// Roles:
// Admin: manages accounts, team, sets requirements/brief, full access
// SMM Specialist: creates posts on calendar, writes TOV/caption, uploads references, views designs
// Designer: views image posts (post/story), uploads designs, views brief. Cannot create posts.
// Motion Designer: same as designer but only sees video/reel content. Uploads motion designs.
// Moderator: approves designs, schedules posts, shares with client. Final approval role.
const ROLE_PERMISSIONS = {
    admin:            { createPost: true, editCaption: true, uploadDesign: true, uploadRef: true, approve: true, schedule: true, viewAll: true, manageTeam: true, manageClients: true, viewClients: true, markPosted: true },
    sm_specialist:    { createPost: true, editCaption: true, uploadDesign: false, uploadRef: true, approve: false, schedule: false, viewAll: true, manageTeam: false, manageClients: false, viewClients: true },
    designer:         { createPost: false, editCaption: false, uploadDesign: true, uploadRef: false, approve: false, schedule: false, viewAll: false, manageTeam: false, manageClients: false, viewClients: true },
    motion_designer:  { createPost: false, editCaption: false, uploadDesign: true, uploadRef: false, approve: false, schedule: false, viewAll: false, manageTeam: false, manageClients: false, viewClients: true },
    moderator:        { createPost: false, editCaption: false, uploadDesign: false, uploadRef: false, approve: false, schedule: false, viewAll: true, manageTeam: false, manageClients: false, viewClients: true, markPosted: true },
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
            // Ensure super admin flag is always set
            if (currentUser.email === 'marketing@eclipseadagency.com') currentUser.is_super_admin = true;
            // Clear search inputs to prevent browser autofill
            ['global-search-input', 'mobile-search-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            // Update UI elements
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = currentUser.name || currentUser.username || currentUser.email;
            const jobEl = document.getElementById('user-job-title');
            if (jobEl && currentUser.job_title) { jobEl.textContent = currentUser.job_title; jobEl.classList.remove('hidden'); }
            // Role badge
            const roleBadge = document.getElementById('user-role-badge');
            if (roleBadge) {
                const roleLabels = { admin: 'Admin', sm_specialist: 'SMM Specialist', designer: 'Graphic Designer', motion_designer: 'Motion Designer', moderator: 'Account Moderator' };
                const roleColors = { admin: 'bg-red-500/20 text-red-300', sm_specialist: 'bg-green-500/20 text-green-300', designer: 'bg-purple-500/20 text-purple-300', motion_designer: 'bg-orange-500/20 text-orange-300', moderator: 'bg-blue-500/20 text-blue-300' };
                const r = currentUser.role || 'user';
                roleBadge.textContent = currentUser.is_super_admin ? 'Super Admin' : (roleLabels[r] || r);
                roleBadge.className = `inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 mb-4 ${roleColors[r] || 'bg-slate-500/20 text-slate-300'}`;
            }
            // Hide admin-only nav items for non-admins
            if (currentUser.role !== 'admin') {
                const usersNav = document.getElementById('users-nav');
                if (usersNav) usersNav.classList.add('hidden');
                const billingNav = document.getElementById('billing-nav');
                if (billingNav) billingNav.classList.add('hidden');
            }
            // Billing is super-admin only
            if (!currentUser.is_super_admin) {
                const billingNav = document.getElementById('billing-nav');
                if (billingNav) billingNav.classList.add('hidden');
            }
            // Role-based nav filtering
            document.querySelectorAll('[data-nav-perm]').forEach(el => {
                const perm = el.getAttribute('data-nav-perm');
                if (perm && !canDo(perm)) {
                    el.style.display = 'none';
                }
            });
            // Role-based element visibility
            document.querySelectorAll('[data-perm]').forEach(el => {
                const perm = el.getAttribute('data-perm');
                if (perm && !canDo(perm)) {
                    el.style.display = 'none';
                }
            });
            // Apply dark mode
            if (currentUser.dark_mode) document.body.classList.add('dark');
            // Start notification polling
            loadNotificationCount();
            setInterval(loadNotificationCount, 30000);
            // Start designer reminder polling
            loadReminders();
            setInterval(loadReminders, 300000);
            // Load mention users for @mention autocomplete
            loadMentionUsers();
            // Load global check-in banner
            loadCheckInStatus();
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
let _lastNotifCount = -1;
let _notifSoundCtx = null;

function playNotificationSound() {
    try {
        if (!_notifSoundCtx) _notifSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _notifSoundCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) { /* silent - audio may be blocked */ }
}

async function loadNotificationCount() {
    if (!currentUser) return;
    try {
        const data = await fetch(API_URL + '/notifications/count?user_id=' + currentUser.id).then(r => r.json());
        const count = data.count || 0;
        const badge = document.getElementById('sidebar-notif-badge');
        const mobileDot = document.getElementById('mobile-notif-dot');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        if (mobileDot) {
            if (count > 0) mobileDot.classList.remove('hidden');
            else mobileDot.classList.add('hidden');
        }
        // Play sound + show popup when new notifications arrive
        if (_lastNotifCount >= 0 && count > _lastNotifCount) {
            playNotificationSound();
            showNotificationPopup();
        }
        _lastNotifCount = count;
    } catch (e) { /* silent */ }
}

// === @Mention Autocomplete ===
let _mentionUsers = [];

async function loadMentionUsers() {
    try {
        const users = await fetch(API_URL + '/users').then(r => r.json());
        _mentionUsers = (users || []).map(u => ({ id: u.id, username: u.username }));
    } catch (e) { /* silent */ }
}

function initMentionAutocomplete(inputEl) {
    if (!inputEl || inputEl._mentionInit) return;
    inputEl._mentionInit = true;

    // Create dropdown (positioned by parent's relative container)
    let dropdown = inputEl.parentElement.querySelector('.mention-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'mention-dropdown';
        inputEl.parentElement.style.position = 'relative';
        inputEl.parentElement.insertBefore(dropdown, inputEl);
    }

    let activeIdx = -1;
    let matched = [];

    inputEl.addEventListener('input', function() {
        const val = this.value;
        const cursor = this.selectionStart;
        const textBefore = val.substring(0, cursor);
        const match = textBefore.match(/@(\w*)$/);
        if (!match) { dropdown.classList.remove('show'); return; }
        const query = match[1].toLowerCase();
        matched = _mentionUsers.filter(u =>
            u.username.toLowerCase().includes(query) &&
            u.id !== currentUser?.id
        ).slice(0, 8);
        if (matched.length === 0) { dropdown.classList.remove('show'); return; }
        activeIdx = -1;
        renderMentionDropdown(dropdown, matched, activeIdx);
        dropdown.classList.add('show');
    });

    inputEl.addEventListener('keydown', function(e) {
        if (!dropdown.classList.contains('show')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, matched.length - 1);
            renderMentionDropdown(dropdown, matched, activeIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            renderMentionDropdown(dropdown, matched, activeIdx);
        } else if ((e.key === 'Enter' || e.key === 'Tab') && activeIdx >= 0) {
            e.preventDefault();
            insertMention(inputEl, matched[activeIdx].username);
            dropdown.classList.remove('show');
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    });

    // Close dropdown on blur (with delay so click can register)
    inputEl.addEventListener('blur', function() {
        setTimeout(() => dropdown.classList.remove('show'), 150);
    });
}

function renderMentionDropdown(dropdown, users, activeIdx) {
    dropdown.innerHTML = users.map((u, i) =>
        `<div class="mention-item ${i === activeIdx ? 'mention-item-active' : ''}" data-idx="${i}" onmousedown="event.preventDefault()">
            <span class="mention-at">@</span>${esc(u.username)}
        </div>`
    ).join('');
    // Click handler on items
    dropdown.querySelectorAll('.mention-item').forEach(el => {
        el.addEventListener('mousedown', function(e) {
            e.preventDefault();
            const idx = parseInt(this.dataset.idx);
            const input = dropdown.parentElement.querySelector('input.post-chat-input');
            if (input && users[idx]) {
                insertMention(input, users[idx].username);
                dropdown.classList.remove('show');
            }
        });
    });
}

function insertMention(inputEl, username) {
    const val = inputEl.value;
    const cursor = inputEl.selectionStart;
    const textBefore = val.substring(0, cursor);
    const textAfter = val.substring(cursor);
    const newBefore = textBefore.replace(/@(\w*)$/, '@' + username + ' ');
    inputEl.value = newBefore + textAfter;
    inputEl.selectionStart = inputEl.selectionEnd = newBefore.length;
    inputEl.focus();
}

function highlightMentions(escapedText) {
    return escapedText.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
}

// === Notification Toast Popup ===
async function showNotificationPopup() {
    if (!currentUser) return;
    try {
        const notifs = await fetch(API_URL + '/notifications?user_id=' + currentUser.id + '&unread_only=true').then(r => r.json());
        if (!notifs || notifs.length === 0) return;
        const n = notifs[0]; // latest unread
        const container = document.getElementById('toast-container');
        if (!container) return;

        const iconMap = {
            task_assigned: 'fa-clipboard-list',
            design_assigned: 'fa-palette',
            pending_review: 'fa-clock-rotate-left',
            design_completed: 'fa-circle-check',
            post_approved: 'fa-circle-check',
            post_scheduled: 'fa-calendar-check',
            post_reminder: 'fa-clock',
            mention: 'fa-at',
        };
        const icon = iconMap[n.type] || 'fa-bell';

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `
            <div class="toast-notif-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="toast-notif-body">
                <div class="toast-notif-title">${esc(n.title || 'New Notification')}</div>
                <div class="toast-notif-message">${esc(n.message || '')}</div>
            </div>
            <button class="toast-notif-close" onclick="event.stopPropagation(); this.parentElement.remove();">&times;</button>
        `;
        toast.addEventListener('click', () => {
            window.location.href = '/notifications';
        });
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    } catch (e) { /* silent */ }
}

// === Dropdown Loaders ===
async function loadClientsDropdown(selectId = 'post-client') {
    let url = API_URL + '/clients';
    if (currentUser) url += `?user_id=${currentUser.id}&role=${currentUser.role || ''}`;
    const clients = await fetch(url).then(r => r.json());
    const el = document.getElementById(selectId);
    if (el) el.innerHTML = clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    return clients;
}

async function loadUsersDropdown(selectId, roleFilter = '') {
    let url = API_URL + '/users';
    if (roleFilter) url += '?role=' + roleFilter;
    const users = await fetch(url).then(r => r.json());
    // Exclude moderators from assignment dropdowns — they see all accounts by default
    const assignable = users.filter(u => u.role !== 'moderator');
    const el = document.getElementById(selectId);
    if (el) {
        const currentHtml = el.innerHTML;
        // Keep existing first option if it's a placeholder
        const firstOption = el.querySelector('option')?.outerHTML || '';
        el.innerHTML = firstOption + assignable.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
    }
    return users;
}

// === Content Requirements Helpers ===

function buildReqPlatformToggles(selected) {
    const list = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    const platforms = [
        { val: 'instagram', icon: 'fa-brands fa-instagram', label: 'IG' },
        { val: 'facebook', icon: 'fa-brands fa-facebook', label: 'FB' },
        { val: 'linkedin', icon: 'fa-brands fa-linkedin', label: 'LI' },
        { val: 'tiktok', icon: 'fa-brands fa-tiktok', label: 'TT' },
        { val: 'x', icon: 'fa-brands fa-x-twitter', label: 'X' },
    ];
    return platforms.map(p =>
        `<label class="cr-plat-toggle cursor-pointer select-none">
            <input type="checkbox" value="${p.val}" class="hidden cr-plat-cb" ${list.includes(p.val) ? 'checked' : ''}>
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition
                ${list.includes(p.val) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-500 border-gray-200'}">
                <i class="${p.icon}"></i>${p.label}
            </span>
        </label>`
    ).join('');
}

function initReqPlatformToggles(container) {
    container.querySelectorAll('.cr-plat-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            const span = this.nextElementSibling;
            if (this.checked) {
                span.className = span.className.replace('bg-gray-50 text-gray-500 border-gray-200', 'bg-indigo-600 text-white border-indigo-600');
            } else {
                span.className = span.className.replace('bg-indigo-600 text-white border-indigo-600', 'bg-gray-50 text-gray-500 border-gray-200');
            }
        });
    });
}

// === Time Display ===
function updateTime() {
    const el = document.getElementById('current-time');
    if (el) el.textContent = new Date().toLocaleString('en-US');
    // Cairo clock (Africa/Cairo = UTC+2)
    const cairoEl = document.getElementById('cairo-clock-time');
    if (cairoEl) {
        const now = new Date();
        cairoEl.textContent = now.toLocaleTimeString('en-US', {
            timeZone: 'Africa/Cairo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
    // Shift progress
    updateShiftTracker();
}

// === Topic Parsing (Carousel Support) ===

function parseTopic(topic) {
    if (!topic) return { isCarousel: false, slides: [], displayText: '' };
    try {
        const parsed = JSON.parse(topic);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
            return {
                isCarousel: true,
                slides: parsed,
                displayText: parsed.map((s, i) => `Slide ${i + 1}: ${s.text || ''}`).join(' | ')
            };
        }
    } catch (e) { /* not JSON, plain text */ }
    return { isCarousel: false, slides: [], displayText: topic };
}

function getTopicPreview(topic, maxLen = 35) {
    const { isCarousel, slides, displayText } = parseTopic(topic);
    if (isCarousel && slides.length > 0) {
        const first = (slides[0].text || '').trim();
        const preview = first || `${slides.length} slides`;
        return preview.length > maxLen ? preview.substring(0, maxLen - 3) + '...' : preview;
    }
    if (!displayText) return '';
    return displayText.length > maxLen ? displayText.substring(0, maxLen - 3) + '...' : displayText;
}

// === Calendar Shared Helpers ===

function getPostStatus(post) {
    const wf = post.workflow_status || 'draft';
    if (wf === 'posted') return 'Posted';
    if (wf === 'scheduled') return 'Scheduled';
    if (wf === 'approved') return 'Approved';
    if (wf === 'design_review') return 'Approved';  // Legacy - treat as approved
    if (wf === 'needs_caption') return 'Draft';  // Legacy - treat as draft
    if (wf === 'pending_review') return 'Pending Review';
    if (wf === 'in_design') return 'Needs Design';
    if (wf === 'draft') return 'Draft';
    return wf.replace(/_/g, ' ');
}

function getStatusColor(status) {
    const colors = {
        'Draft': '#94a3b8',
        'Pending Review': '#eab308',
        'Needs Design': '#f97316',
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
        'Pending Review': 'cal-border-pending-review',
        'Needs Design': 'cal-border-needs-design',
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
        'video': '<i class="fa-solid fa-video text-red-500" title="Video"></i>',
        'carousel': '<i class="fa-solid fa-images text-indigo-500" title="Carousel"></i>',
        'banner': '<i class="fa-solid fa-panorama text-teal-500" title="Banner"></i>',
        'brochure': '<i class="fa-solid fa-book-open text-amber-500" title="Brochure"></i>'
    };
    return icons[(type || 'post').toLowerCase()] || icons['post'];
}

function isPostOverdue(post) {
    const wf = post.workflow_status || 'draft';
    if (wf === 'posted' || wf === 'scheduled') return false;
    const sa = post.scheduled_at;
    if (!sa) return false;
    return new Date(sa) < new Date();
}

function isRTL(text) {
    if (!text) return false;
    const rtlChar = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
    // Check first non-whitespace, non-punctuation character
    for (let i = 0; i < text.length && i < 100; i++) {
        if (rtlChar.test(text[i])) return true;
        if (/[a-zA-Z]/.test(text[i])) return false;
    }
    return false;
}

function setTextDir(el, text) {
    if (!el) return;
    const rtl = isRTL(text);
    el.dir = rtl ? 'rtl' : 'ltr';
    el.style.textAlign = rtl ? 'right' : 'left';
}

function renderCalendarMiniCard(post) {
    const status = getPostStatus(post);
    const borderClass = getStatusBorderClass(post);
    const time = (post.scheduled_at || '').substring(11, 16) || '';
    const topicPreview = getTopicPreview(post.topic || '', 35);
    const caption = post.caption || '';
    const captionPreview = caption.length > 40 ? caption.substring(0, 40) + '...' : caption;
    const thumbnail = (post.design_output_urls || '').split(',')[0].trim();
    const platform = post.platforms || '';
    const contentType = post.post_type || 'post';
    const wf = post.workflow_status || 'draft';
    const overdue = isPostOverdue(post);
    const commentCount = post.comment_count || 0;

    // Show upload hint for designers on in_design posts
    const isDesignerUpload = canDo('uploadDesign') && wf === 'in_design';

    // Show comment badge on pre-approved posts that have comments
    const showCommentBadge = commentCount > 0 && ['draft', 'pending_review', 'in_design'].includes(wf);

    const canDrag = canDo('schedule') || canDo('approve') || canDo('markPosted');
    // Use the right click handler depending on which page we're on
    const clickFn = typeof openClientPostDetail === 'function' && typeof clientId !== 'undefined' ? 'openClientPostDetail' : 'openPostDetail';
    return `<div class="cal-mini-card ${borderClass} ${isDesignerUpload ? 'cal-card-designer-upload' : ''} ${overdue ? 'cal-card-overdue' : ''}" data-post-id="${post.id}" ${canDrag ? `draggable="true" ondragstart="onCardDragStart(event, ${post.id})"` : ''}
                 onclick="${clickFn}(${post.id}); event.stopPropagation();">
        <div class="cal-card-top">
            ${overdue ? '<span class="cal-overdue-badge"><i class="fa-solid fa-clock"></i> Overdue</span>' : ''}
            ${time ? `<span class="cal-card-time">${esc(time)}</span>` : ''}
            <span class="cal-card-icons">${getPlatformIcon(platform)} ${getContentTypeIcon(contentType)}</span>
            ${showCommentBadge ? `<span class="cal-comment-badge" title="${commentCount} comment${commentCount > 1 ? 's' : ''} — review needed"><i class="fa-solid fa-comment"></i> ${commentCount}</span>` : ''}
            <span class="cal-status-dot" style="background:${getStatusColor(status)}" title="${status}"></span>
        </div>
        ${thumbnail ? `<div class="cal-card-thumb" style="position:relative">${/\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(thumbnail) ? `<video src="${thumbnail}" muted playsinline preload="metadata" loading="lazy"></video>` : `<img src="${thumbnail}" alt="" loading="lazy">`}${contentType === 'carousel' && (post.design_output_urls || '').split(',').filter(u => u.trim()).length > 1 ? `<span style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px"><i class="fa-solid fa-images" style="margin-right:2px"></i>${(post.design_output_urls || '').split(',').filter(u => u.trim()).length}</span>` : ''}</div>` : ''}
        ${topicPreview ? `<div class="cal-card-topic" dir="auto">${esc(topicPreview)}</div>` : ''}
        ${captionPreview ? `<div class="cal-card-caption" dir="auto">${esc(captionPreview)}</div>` : ''}
        ${isDesignerUpload ? `<div class="cal-card-upload-hint"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Design</div>` : ''}
        <div class="cal-card-meta">
            <span class="cal-card-client">${esc(post.client_name || '')}</span>
            ${(post.assigned_designer_name || post.assigned_writer_name || post.assigned_sm_name) ? `<span class="cal-card-assignee"><i class="fa-solid fa-user text-indigo-400"></i> ${esc(post.assigned_designer_name || post.assigned_writer_name || post.assigned_sm_name)}</span>` : ''}
        </div>
    </div>`;
}

// === Global Search ===
let _searchTimeout = null;
let _searchResults = null;
let _searchIndex = -1;

function onGlobalSearch(q, variant) {
    clearTimeout(_searchTimeout);
    const panelId = variant === 'mobile' ? 'mobile-search-results' : 'global-search-results';
    const panel = document.getElementById(panelId);
    if (!panel) return;
    if (q.trim().length < 2) { panel.classList.add('hidden'); panel.innerHTML = ''; _searchResults = null; _searchIndex = -1; return; }
    _searchTimeout = setTimeout(async () => {
        const data = await fetch(API_URL + '/search?q=' + encodeURIComponent(q.trim())).then(r => r.json()).catch(() => null);
        if (!data) return;
        _searchResults = data;
        _searchIndex = -1;
        renderSearchResults(data, panel);
    }, 300);
}

function toggleMobileSearch() {
    const bar = document.getElementById('mobile-search-bar');
    if (bar) { bar.classList.toggle('hidden'); if (!bar.classList.contains('hidden')) document.getElementById('mobile-search-input')?.focus(); }
}

function renderSearchResults(data, panel) {
    const { posts, clients, tasks } = data;
    if (!posts.length && !clients.length && !tasks.length) {
        panel.innerHTML = '<div class="search-empty">No results found</div>';
        panel.classList.remove('hidden');
        return;
    }
    let html = '';
    if (clients.length) {
        html += '<div class="search-group-label">Accounts</div>';
        clients.forEach(c => {
            html += `<a href="/clients/${c.id}" class="search-item" data-type="client">
                <i class="fa-solid fa-building text-indigo-400 w-5 text-center"></i>
                <div class="search-item-text"><div class="search-item-title">${esc(c.name)}</div>${c.company ? `<div class="search-item-sub">${esc(c.company)}</div>` : ''}</div>
            </a>`;
        });
    }
    if (posts.length) {
        html += '<div class="search-group-label">Posts</div>';
        posts.forEach(p => {
            const topic = getTopicPreview(p.topic, 50);
            const statusLabel = getPostStatus(p);
            const color = getStatusColor(statusLabel);
            html += `<a href="/clients/${getPostClientLink(p)}" class="search-item" data-type="post" data-post-id="${p.id}">
                <span class="search-status-dot" style="background:${color}"></span>
                <div class="search-item-text"><div class="search-item-title">${topic ? esc(topic) : esc((p.caption || '').substring(0, 50))}</div>
                <div class="search-item-sub">${esc(p.client_name || '')} &middot; ${statusLabel} &middot; ${esc(p.post_type || 'post')}</div></div>
            </a>`;
        });
    }
    if (tasks.length) {
        html += '<div class="search-group-label">Tasks</div>';
        tasks.forEach(t => {
            const pri = t.priority === 'urgent' ? '<span class="text-red-400 text-[10px] font-bold">URGENT</span> ' : '';
            html += `<a href="/" class="search-item" data-type="task">
                <i class="fa-solid fa-clipboard-check text-green-400 w-5 text-center"></i>
                <div class="search-item-text"><div class="search-item-title">${pri}${esc(t.title)}</div>
                <div class="search-item-sub">${esc(t.client_name || '')} &middot; ${t.status}</div></div>
            </a>`;
        });
    }
    panel.innerHTML = html;
    panel.classList.remove('hidden');
}

function getPostClientLink(post) {
    return post.client_id || '';
}

function onSearchKeydown(e, variant) {
    const panelId = variant === 'mobile' ? 'mobile-search-results' : 'global-search-results';
    const panel = document.getElementById(panelId);
    if (!panel || panel.classList.contains('hidden')) return;
    const items = panel.querySelectorAll('.search-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); _searchIndex = Math.min(_searchIndex + 1, items.length - 1); highlightSearchItem(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _searchIndex = Math.max(_searchIndex - 1, 0); highlightSearchItem(items); }
    else if (e.key === 'Enter' && _searchIndex >= 0 && items[_searchIndex]) { e.preventDefault(); items[_searchIndex].click(); }
    else if (e.key === 'Escape') { panel.classList.add('hidden'); _searchIndex = -1; }
}

function highlightSearchItem(items) {
    items.forEach((el, i) => el.classList.toggle('search-item-active', i === _searchIndex));
    if (items[_searchIndex]) items[_searchIndex].scrollIntoView({ block: 'nearest' });
}

// Close search on outside click
document.addEventListener('click', function(e) {
    ['global-search', 'mobile-search'].forEach(prefix => {
        const panel = document.getElementById(prefix + '-results');
        const input = document.getElementById(prefix + '-input');
        if (panel && !panel.contains(e.target) && e.target !== input) {
            panel.classList.add('hidden');
        }
    });
});

// === Designer Reminders ===
let _reminderExpanded = true;

async function loadReminders() {
    if (!currentUser || (currentUser.role !== 'designer' && currentUser.role !== 'motion_designer')) return;
    try {
        const data = await fetch(API_URL + '/reminders?user_id=' + currentUser.id + '&role=' + currentUser.role).then(r => r.json());
        if (!data || !Array.isArray(data)) return;

        const dismissed = JSON.parse(sessionStorage.getItem('dismissedReminders') || '[]');
        const visible = data.filter(r => !dismissed.includes(r.id));

        const ticker = document.getElementById('reminder-ticker');
        const list = document.getElementById('reminder-list');
        const label = document.getElementById('reminder-count-label');
        if (!ticker || !list) return;

        if (visible.length === 0) {
            ticker.classList.add('hidden');
            return;
        }

        const urgentCount = visible.filter(r => r.type === 'urgent').length;
        const countText = visible.length === 1 ? '1 design pending' : visible.length + ' designs pending';
        label.textContent = urgentCount > 0 ? countText + ' (' + urgentCount + ' urgent)' : countText;

        // Set ticker urgency class
        ticker.classList.remove('reminder-has-urgent', 'reminder-has-warning');
        if (urgentCount > 0) ticker.classList.add('reminder-has-urgent');
        else if (visible.some(r => r.type === 'warning')) ticker.classList.add('reminder-has-warning');

        list.innerHTML = visible.map(r => {
            const typeClass = 'reminder-item-' + r.type;
            const icon = r.type === 'urgent' ? 'fa-circle-exclamation' : r.type === 'warning' ? 'fa-clock' : 'fa-info-circle';
            return `<div class="reminder-item ${typeClass}" data-id="${r.id}">
                <a href="/clients" class="reminder-link" title="View post">
                    <i class="fa-solid ${icon} reminder-icon"></i>
                    <span class="reminder-msg">${esc(r.message)}</span>
                </a>
                <button class="reminder-x" onclick="event.stopPropagation(); dismissReminder('${r.id}')" title="Dismiss">&times;</button>
            </div>`;
        }).join('');

        ticker.classList.remove('hidden');
        list.style.display = _reminderExpanded ? 'block' : 'none';
        document.getElementById('reminder-chevron')?.classList.toggle('reminder-chevron-collapsed', !_reminderExpanded);
    } catch (e) { /* silent */ }
}

function dismissReminder(id) {
    const dismissed = JSON.parse(sessionStorage.getItem('dismissedReminders') || '[]');
    if (!dismissed.includes(id)) dismissed.push(id);
    sessionStorage.setItem('dismissedReminders', JSON.stringify(dismissed));
    const el = document.querySelector(`.reminder-item[data-id="${id}"]`);
    if (el) {
        el.classList.add('reminder-dismiss-anim');
        setTimeout(() => { el.remove(); updateReminderCount(); }, 300);
    }
}

function dismissAllReminders() {
    const items = document.querySelectorAll('.reminder-item');
    const dismissed = JSON.parse(sessionStorage.getItem('dismissedReminders') || '[]');
    items.forEach(el => {
        const id = el.dataset.id;
        if (id && !dismissed.includes(id)) dismissed.push(id);
        el.classList.add('reminder-dismiss-anim');
    });
    sessionStorage.setItem('dismissedReminders', JSON.stringify(dismissed));
    setTimeout(() => {
        document.getElementById('reminder-ticker')?.classList.add('hidden');
    }, 300);
}

function updateReminderCount() {
    const remaining = document.querySelectorAll('.reminder-item:not(.reminder-dismiss-anim)');
    const label = document.getElementById('reminder-count-label');
    const ticker = document.getElementById('reminder-ticker');
    if (remaining.length === 0) {
        ticker?.classList.add('hidden');
    } else if (label) {
        label.textContent = remaining.length === 1 ? '1 design pending' : remaining.length + ' designs pending';
    }
}

function toggleReminderExpand() {
    _reminderExpanded = !_reminderExpanded;
    const list = document.getElementById('reminder-list');
    const chevron = document.getElementById('reminder-chevron');
    if (list) list.style.display = _reminderExpanded ? 'block' : 'none';
    chevron?.classList.toggle('reminder-chevron-collapsed', !_reminderExpanded);
}

// === Shift Tracking ===
const SHIFT_HOURS = 6;
let _checkinTimeStr = null; // e.g. "09:05" Cairo time
let _shiftEndNotified = false;

function updateShiftTracker() {
    const tracker = document.getElementById('shift-tracker');
    if (!tracker || !_checkinTimeStr) { if (tracker) tracker.classList.add('hidden'); return; }

    const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const [ch, cm] = _checkinTimeStr.split(':').map(Number);
    const checkinDate = new Date(cairoNow);
    checkinDate.setHours(ch, cm, 0, 0);

    const elapsedMs = cairoNow - checkinDate;
    if (elapsedMs < 0) { tracker.classList.add('hidden'); return; }

    const totalMs = SHIFT_HOURS * 3600000;
    const remainMs = Math.max(0, totalMs - elapsedMs);
    const pct = Math.min(100, (elapsedMs / totalMs) * 100);
    const overtimeMs = Math.max(0, elapsedMs - totalMs);

    const elH = Math.floor(elapsedMs / 3600000);
    const elM = Math.floor((elapsedMs % 3600000) / 60000);
    const remH = Math.floor(remainMs / 3600000);
    const remM = Math.floor((remainMs % 3600000) / 60000);
    const otH = Math.floor(overtimeMs / 3600000);
    const otM = Math.floor((overtimeMs % 3600000) / 60000);

    const fill = document.getElementById('shift-progress-fill');
    const elapsedEl = document.getElementById('shift-elapsed');
    const remainEl = document.getElementById('shift-remaining');

    fill.style.width = pct + '%';
    elapsedEl.textContent = `${elH}h ${elM}m`;

    if (remainMs <= 0) {
        fill.className = 'shift-progress-fill done';
        if (overtimeMs > 60000) {
            remainEl.innerHTML = `<i class="fa-solid fa-fire"></i> +${otH}h ${otM}m overtime`;
            remainEl.className = 'shift-overtime-label';
        } else {
            remainEl.textContent = 'Shift complete!';
            remainEl.className = 'shift-done-label';
        }
        // One-time notification when shift ends
        if (!_shiftEndNotified) {
            _shiftEndNotified = true;
            showToast('Your 6-hour shift is complete! Any extra time counts as overtime.', 'success');
        }
    } else {
        fill.className = 'shift-progress-fill';
        remainEl.textContent = `${remH}h ${remM}m left`;
        remainEl.className = '';
    }

    tracker.classList.remove('hidden');
}

// === Check-in Overlay (global) ===
let _checkinClockInterval = null;

async function loadCheckInStatus() {
    const overlay = document.getElementById('checkin-overlay');
    if (!overlay) return;
    try {
        const data = await fetch(API_URL + '/attendance/my-status').then(r => r.json());
        const w = data.window || { start: 9, ontime_minutes: 20, end: 10 };
        const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
        const h = cairoNow.getHours();

        // Already checked in or outside window → hide overlay, let them through
        if (data.checked_in) {
            _checkinTimeStr = data.check_in_time;
            updateShiftTracker();
        }
        if (data.checked_in || h < w.start || h >= w.end) {
            overlay.classList.add('hidden');
            if (_checkinClockInterval) { clearInterval(_checkinClockInterval); _checkinClockInterval = null; }
            return;
        }

        // Within window and NOT checked in → block the UI
        const m = cairoNow.getMinutes();
        const isOnTime = (h === w.start && m <= w.ontime_minutes);
        const icon = document.getElementById('checkin-icon');
        const title = document.getElementById('checkin-title');
        const subtitle = document.getElementById('checkin-subtitle');
        const btn = document.getElementById('checkin-action-btn');

        if (isOnTime) {
            icon.innerHTML = '<i class="fa-solid fa-sun"></i>';
            icon.className = 'checkin-icon on-time';
            title.textContent = 'Good Morning!';
            subtitle.textContent = "You're on time — check in to start your day";
            btn.className = 'checkin-action-btn on-time';
        } else {
            icon.innerHTML = '<i class="fa-solid fa-clock"></i>';
            icon.className = 'checkin-icon late';
            title.textContent = "You're Late";
            subtitle.textContent = `Check in now — window closes at ${w.end}:00`;
            btn.className = 'checkin-action-btn late';
        }
        btn.classList.remove('hidden');
        document.getElementById('checkin-status-msg').classList.add('hidden');
        overlay.classList.remove('hidden');

        // Live clock on overlay
        updateCheckinClock();
        if (!_checkinClockInterval) {
            _checkinClockInterval = setInterval(updateCheckinClock, 1000);
        }
    } catch (e) {
        overlay.classList.add('hidden');
    }
}

function updateCheckinClock() {
    const el = document.getElementById('checkin-clock');
    if (!el) return;
    const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    el.textContent = cairoNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

async function doCheckIn() {
    const btn = document.getElementById('checkin-action-btn');
    const msg = document.getElementById('checkin-status-msg');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Checking in...';
    try {
        const res = await fetch(API_URL + '/attendance/check-in', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            const label = data.status === 'on_time' ? 'On Time' : 'Late';
            _checkinTimeStr = data.check_in_time;
            updateShiftTracker();
            document.getElementById('checkin-icon').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            document.getElementById('checkin-icon').className = 'checkin-icon done';
            document.getElementById('checkin-title').textContent = 'Checked In!';
            document.getElementById('checkin-subtitle').textContent = `${data.check_in_time} — ${label}`;
            btn.classList.add('hidden');
            msg.classList.add('hidden');
            // Fade out after a moment
            setTimeout(() => {
                const overlay = document.getElementById('checkin-overlay');
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.classList.add('hidden'); overlay.style.opacity = ''; }, 400);
            }, 1200);
        } else {
            msg.textContent = data.error || 'Check-in failed';
            msg.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i>Check In';
        }
    } catch (e) {
        msg.textContent = 'Connection error — try again';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i>Check In';
    }
}

// === Init ===
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    updateTime();
    setInterval(updateTime, 1000);
});
