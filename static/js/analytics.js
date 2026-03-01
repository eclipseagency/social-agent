// Analytics page JS — Real engagement data
let postsChart, engagementChart, platformChart, contentTypeChart, hourlyChart, workflowChart;

function pageInit() {
    loadClientsDropdown('analytics-client');
    loadAnalytics();
}

function fmtNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

async function loadAnalytics() {
    const clientId = document.getElementById('analytics-client')?.value || '';
    const period = document.getElementById('analytics-period')?.value || '30';
    let url = `${API_URL}/analytics?period=${period}`;
    if (clientId) url += `&client_id=${clientId}`;

    let data;
    try { data = await fetch(url).then(r => r.json()); } catch (e) { console.error('Analytics load failed:', e); return; }

    // Content KPIs
    document.getElementById('kpi-total').textContent = fmtNum(data.total_posts);
    document.getElementById('kpi-posted').textContent = fmtNum(data.posted);
    document.getElementById('kpi-rate').textContent = data.success_rate + '%';
    document.getElementById('kpi-in-progress').textContent = fmtNum(data.in_progress);
    document.getElementById('kpi-turnaround').textContent = data.avg_turnaround_days > 0 ? data.avg_turnaround_days + 'd' : '-';

    // Engagement KPIs
    const eng = data.engagement || {};
    document.getElementById('kpi-impressions').textContent = fmtNum(eng.impressions || 0);
    document.getElementById('kpi-reach').textContent = fmtNum(eng.reach || 0);
    document.getElementById('kpi-likes').textContent = fmtNum(eng.likes || 0);
    document.getElementById('kpi-comments').textContent = fmtNum(eng.comments || 0);
    document.getElementById('kpi-shares').textContent = fmtNum(eng.shares || 0);
    document.getElementById('kpi-saves').textContent = fmtNum(eng.saves || 0);
    document.getElementById('kpi-clicks').textContent = fmtNum(eng.clicks || 0);
    document.getElementById('kpi-eng-rate').textContent = (eng.avg_engagement_rate || 0) + '%';

    // Show hint if no insights data
    const hint = document.getElementById('no-insights-hint');
    if (hint) {
        if (eng.posts_with_insights === 0 && data.posted > 0) hint.classList.remove('hidden');
        else hint.classList.add('hidden');
    }

    // === CHARTS ===
    renderPostsChart(data.posts_per_day);
    renderEngagementChart(data.engagement_per_day);
    renderPlatformChart(data.platform_distribution);
    renderContentTypeChart(data.content_type_stats);
    renderHourlyChart(data.hourly_distribution);
    renderWorkflowChart(data.workflow_breakdown);

    // === TABLES ===
    renderPlatformEngagement(data.platform_engagement);
    renderTopPosts(data.top_posts);
    renderTopClients(data.top_clients);
    renderTeamPerformance(data.team_performance);
}

// === CHART RENDERERS ===

function renderPostsChart(postsPerDay) {
    if (postsChart) postsChart.destroy();
    postsChart = new Chart(document.getElementById('postsChart'), {
        type: 'line',
        data: {
            labels: postsPerDay.map(d => d.date?.substring(5) || ''),
            datasets: [{
                label: 'Posts',
                data: postsPerDay.map(d => d.count),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.08)',
                tension: 0.4, fill: true, pointRadius: 2
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 10 } } } }
    });
}

function renderEngagementChart(engPerDay) {
    if (engagementChart) engagementChart.destroy();
    if (!engPerDay || engPerDay.length === 0) {
        document.getElementById('engagementChart').parentElement.querySelector('h3').innerHTML += ' <span class="text-gray-400 text-xs font-normal">(no data yet)</span>';
        return;
    }
    engagementChart = new Chart(document.getElementById('engagementChart'), {
        type: 'line',
        data: {
            labels: engPerDay.map(d => d.date?.substring(5) || ''),
            datasets: [
                { label: 'Impressions', data: engPerDay.map(d => d.impressions || 0), borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,0.05)', tension: 0.4, fill: true, pointRadius: 2 },
                { label: 'Reach', data: engPerDay.map(d => d.reach || 0), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.05)', tension: 0.4, fill: true, pointRadius: 2 },
                { label: 'Likes', data: engPerDay.map(d => d.likes || 0), borderColor: '#ef4444', tension: 0.4, pointRadius: 2 },
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 10 } } } }
    });
}

function renderPlatformChart(platDist) {
    if (platformChart) platformChart.destroy();
    const colors = { instagram: '#ec4899', facebook: '#3b82f6', linkedin: '#0a66c2', web: '#22c55e' };
    platformChart = new Chart(document.getElementById('platformChart'), {
        type: 'doughnut',
        data: {
            labels: platDist.map(p => (p.platform || 'other').charAt(0).toUpperCase() + (p.platform || 'other').slice(1)),
            datasets: [{ data: platDist.map(p => p.count), backgroundColor: platDist.map(p => colors[p.platform] || '#94a3b8') }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
}

function renderContentTypeChart(stats) {
    if (contentTypeChart) contentTypeChart.destroy();
    const typeColors = { post: '#3b82f6', story: '#ec4899', reel: '#8b5cf6', video: '#ef4444', carousel: '#6366f1', banner: '#14b8a6', brochure: '#f59e0b' };
    contentTypeChart = new Chart(document.getElementById('contentTypeChart'), {
        type: 'bar',
        data: {
            labels: stats.map(s => (s.type || 'post').charAt(0).toUpperCase() + (s.type || 'post').slice(1)),
            datasets: [
                { label: 'Count', data: stats.map(s => s.count), backgroundColor: stats.map(s => typeColors[s.type] || '#94a3b8'), borderRadius: 6 },
            ]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderHourlyChart(hourly) {
    if (hourlyChart) hourlyChart.destroy();
    // Fill all 24 hours
    const hourData = Array(24).fill(0);
    const hourEng = Array(24).fill(0);
    hourly.forEach(h => { hourData[h.hour] = h.count; hourEng[h.hour] = h.avg_engagement || 0; });

    hourlyChart = new Chart(document.getElementById('hourlyChart'), {
        type: 'bar',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => i + ':00'),
            datasets: [
                { label: 'Posts', data: hourData, backgroundColor: 'rgba(99,102,241,0.6)', borderRadius: 4, yAxisID: 'y' },
                { label: 'Avg Eng %', data: hourEng, type: 'line', borderColor: '#ef4444', pointRadius: 0, tension: 0.4, yAxisID: 'y1' },
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: {
                y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Posts', font: { size: 10 } } },
                y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Eng %', font: { size: 10 } } },
                x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } }
            }
        }
    });
}

function renderWorkflowChart(breakdown) {
    if (workflowChart) workflowChart.destroy();
    const statusColors = { draft: '#94a3b8', pending_review: '#eab308', in_design: '#f97316', approved: '#22c55e', scheduled: '#3b82f6', posted: '#10b981' };
    const labels = { draft: 'Draft', pending_review: 'Pending Review', in_design: 'In Design', approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted' };
    workflowChart = new Chart(document.getElementById('workflowChart'), {
        type: 'doughnut',
        data: {
            labels: breakdown.map(b => labels[b.status] || b.status),
            datasets: [{ data: breakdown.map(b => b.count), backgroundColor: breakdown.map(b => statusColors[b.status] || '#94a3b8') }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
}

// === TABLE RENDERERS ===

function renderPlatformEngagement(platEng) {
    const tbody = document.querySelector('#platform-engagement-table tbody');
    if (!tbody) return;
    if (!platEng || platEng.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-4">No engagement data — sync insights to populate</td></tr>';
        return;
    }
    tbody.innerHTML = platEng.map(p => `
        <tr class="border-b last:border-0">
            <td class="py-2 pr-4 font-medium">${getPlatformIcon(p.platform)} ${esc(p.platform)}</td>
            <td class="py-2 pr-4">${p.posts}</td>
            <td class="py-2 pr-4">${fmtNum(p.impressions || 0)}</td>
            <td class="py-2 pr-4">${fmtNum(p.reach || 0)}</td>
            <td class="py-2 pr-4">${fmtNum(p.likes || 0)}</td>
            <td class="py-2 pr-4">${fmtNum(p.comments || 0)}</td>
            <td class="py-2 pr-4">${fmtNum(p.shares || 0)}</td>
            <td class="py-2 font-semibold ${(p.avg_engagement_rate || 0) > 3 ? 'text-green-600' : 'text-gray-600'}">${(p.avg_engagement_rate || 0).toFixed(1)}%</td>
        </tr>
    `).join('');
}

function renderTopPosts(posts) {
    const el = document.getElementById('top-posts');
    if (!el) return;
    if (!posts || posts.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-center py-4">No published posts with engagement data</p>';
        return;
    }
    el.innerHTML = posts.map((p, i) => {
        const thumb = (p.design_output_urls || '').split(',')[0].trim();
        const topic = getTopicPreview(p.topic, 40) || (p.caption || '').substring(0, 40);
        return `<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-sm font-bold text-gray-400 w-5">#${i + 1}</span>
            ${thumb ? `<img src="${thumb}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="">` : '<div class="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0"></div>'}
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold truncate">${esc(topic)}</p>
                <p class="text-xs text-gray-500">${esc(p.client_name || '')} &middot; ${getPlatformIcon(p.platforms)} ${esc(p.post_type || '')}</p>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-sm font-bold text-indigo-600">${(p.engagement_rate || 0).toFixed(1)}%</p>
                <p class="text-[10px] text-gray-400">${fmtNum(p.impressions || 0)} imp &middot; ${fmtNum(p.likes || 0)} <i class="fa-solid fa-heart text-red-400"></i></p>
            </div>
        </div>`;
    }).join('');
}

function renderTopClients(clients) {
    const el = document.getElementById('top-clients');
    if (!el) return;
    if (!clients || clients.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-center py-4">No data yet</p>';
        return;
    }
    el.innerHTML = clients.map((c, i) => {
        const bar = c.impressions > 0;
        return `<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-sm font-bold text-gray-400 w-5">#${i + 1}</span>
            <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:${c.color || '#6366f1'}"></div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">${esc(c.name)}</p>
                <p class="text-xs text-gray-500">${c.posts} posts</p>
            </div>
            <div class="text-right flex-shrink-0">
                ${bar ? `<p class="text-sm font-bold text-indigo-600">${fmtNum(c.impressions)} imp</p>
                <p class="text-[10px] text-gray-400">${fmtNum(c.likes)} <i class="fa-solid fa-heart text-red-400"></i> &middot; ${(c.avg_engagement_rate || 0).toFixed(1)}%</p>` :
                `<p class="text-sm font-bold text-gray-600">${c.posts} posts</p>`}
            </div>
        </div>`;
    }).join('');
}

function renderTeamPerformance(team) {
    const el = document.getElementById('team-performance');
    if (!el) return;
    if (!team || team.length === 0) {
        el.innerHTML = '<p class="text-gray-400 text-center py-4">No team activity</p>';
        return;
    }
    const roleLabels = { admin: 'Admin', sm_specialist: 'SMM', designer: 'Designer', motion_designer: 'Motion', moderator: 'Moderator', copywriter: 'Writer' };
    const roleColors = { admin: 'bg-red-100 text-red-700', sm_specialist: 'bg-green-100 text-green-700', designer: 'bg-purple-100 text-purple-700', motion_designer: 'bg-orange-100 text-orange-700', moderator: 'bg-blue-100 text-blue-700', copywriter: 'bg-yellow-100 text-yellow-700' };
    el.innerHTML = team.map(t => `
        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">${esc(t.username)}</p>
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${roleColors[t.role] || 'bg-gray-100 text-gray-700'}">${roleLabels[t.role] || t.role}</span>
            </div>
            <div class="text-right flex-shrink-0 text-xs text-gray-600">
                <span title="Total actions">${t.actions} actions</span> &middot;
                <span class="text-green-600" title="Approvals">${t.approvals} <i class="fa-solid fa-check"></i></span> &middot;
                <span class="text-blue-600" title="Published">${t.published} <i class="fa-solid fa-rocket"></i></span>
            </div>
        </div>
    `).join('');
}

// === SYNC ===

async function syncInsights() {
    const btn = document.getElementById('sync-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Syncing...'; }
    const res = await apiFetch(`${API_URL}/insights/sync`, { method: 'POST' });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i> Sync Insights'; }
    if (res && res.success) {
        showToast(`Synced insights for ${res.synced} of ${res.total} posts`, 'success');
        loadAnalytics();
    } else {
        showToast('Sync failed: ' + (res?.error || 'Unknown error'), 'error');
    }
}
