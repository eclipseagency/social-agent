// Analytics page JS
let postsChart, platformChart, hourlyChart;

function pageInit() { loadAnalytics(); }

async function loadAnalytics() {
    let data;
    try { data = await fetch(API_URL + '/analytics').then(r => r.json()); } catch (e) { console.error('Failed to load analytics:', e); return; }

    document.getElementById('analytics-total').textContent = data.total_posts;
    document.getElementById('analytics-rate').textContent = data.success_rate + '%';
    document.getElementById('analytics-posted').textContent = data.posted;
    document.getElementById('analytics-failed').textContent = data.failed;

    // Posts per day chart
    if (postsChart) postsChart.destroy();
    postsChart = new Chart(document.getElementById('postsChart'), {
        type: 'line',
        data: {
            labels: data.posts_per_day.map(d => d.date),
            datasets: [{
                label: 'Posts',
                data: data.posts_per_day.map(d => d.count),
                borderColor: '#6366f1',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(99,102,241,0.1)'
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Platform distribution
    if (platformChart) platformChart.destroy();
    platformChart = new Chart(document.getElementById('platformChart'), {
        type: 'doughnut',
        data: {
            labels: data.platform_distribution.map(p => p.platform),
            datasets: [{ data: data.platform_distribution.map(p => p.count), backgroundColor: ['#ec4899', '#3b82f6', '#6366f1'] }]
        }
    });

    // Hourly distribution
    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(document.getElementById('hourlyChart'), {
        type: 'bar',
        data: {
            labels: data.hourly_distribution.map(h => h.hour + ':00'),
            datasets: [{ label: 'Posts', data: data.hourly_distribution.map(h => h.count), backgroundColor: '#6366f1' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Top clients
    document.getElementById('top-clients').innerHTML = data.top_clients.map((c, i) =>
        `<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span>${i + 1}. ${esc(c.name)}</span><span class="font-bold text-indigo-600">${c.posts} posts</span></div>`
    ).join('') || '<p class="text-gray-500">No data yet</p>';
}
