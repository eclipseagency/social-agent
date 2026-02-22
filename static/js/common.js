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
            // Hide admin-only nav items for non-admins
            if (currentUser.role !== 'admin') {
                const usersNav = document.getElementById('users-nav');
                if (usersNav) usersNav.classList.add('hidden');
            }
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

// === Init ===
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    updateTime();
    setInterval(updateTime, 1000);
});
