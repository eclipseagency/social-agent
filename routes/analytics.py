import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from models import get_db, dict_from_row, dicts_from_rows
from routes.auth import require_login

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/api/stats', methods=['GET'])
def get_stats():
    db = get_db()
    total_clients = db.execute("SELECT COUNT(*) as c FROM clients").fetchone()['c']
    total_accounts = db.execute("SELECT COUNT(*) as c FROM accounts WHERE is_active=1").fetchone()['c']
    pending_posts = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE status='pending'").fetchone()['c']
    posted_posts = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE status='posted'").fetchone()['c']
    failed_posts = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE status='failed'").fetchone()['c']

    recent_posts = dicts_from_rows(db.execute(
        "SELECT * FROM scheduled_posts ORDER BY created_at DESC LIMIT 5"
    ).fetchall())

    db.close()
    return jsonify({
        'total_clients': total_clients,
        'total_accounts': total_accounts,
        'pending_posts': pending_posts,
        'posted_posts': posted_posts,
        'failed_posts': failed_posts,
        'recent_posts': recent_posts
    })


@analytics_bp.route('/api/analytics', methods=['GET'])
def get_analytics():
    """Comprehensive analytics with real engagement data, date range, and client filtering."""
    db = get_db()
    client_id = request.args.get('client_id', '')
    period = request.args.get('period', '30')  # days: 7, 30, 90, all

    # Build date filter
    if period == 'all':
        date_filter = ''
        date_params = []
    else:
        days = int(period)
        date_filter = f"AND COALESCE(sp.scheduled_at, sp.created_at) >= datetime('now', '-{days} days')"
        date_params = []

    client_filter = ''
    client_params = []
    if client_id:
        client_filter = 'AND sp.client_id = ?'
        client_params = [int(client_id)]

    params = client_params

    # === CONTENT METRICS ===
    total = db.execute(f"SELECT COUNT(*) as c FROM scheduled_posts sp WHERE 1=1 {date_filter} {client_filter}", params).fetchone()['c']
    posted = db.execute(f"SELECT COUNT(*) as c FROM scheduled_posts sp WHERE sp.status='posted' {date_filter} {client_filter}", params).fetchone()['c']
    failed = db.execute(f"SELECT COUNT(*) as c FROM scheduled_posts sp WHERE sp.status='failed' {date_filter} {client_filter}", params).fetchone()['c']
    in_progress = db.execute(f"SELECT COUNT(*) as c FROM scheduled_posts sp WHERE sp.workflow_status NOT IN ('posted','draft') {date_filter} {client_filter}", params).fetchone()['c']
    success_rate = round((posted / total * 100) if total > 0 else 0, 1)

    # === ENGAGEMENT METRICS (from post_insights) ===
    engagement_query = f"""
        SELECT
            COALESCE(SUM(pi.impressions), 0) as total_impressions,
            COALESCE(SUM(pi.reach), 0) as total_reach,
            COALESCE(SUM(pi.likes), 0) as total_likes,
            COALESCE(SUM(pi.comments), 0) as total_comments,
            COALESCE(SUM(pi.shares), 0) as total_shares,
            COALESCE(SUM(pi.saves), 0) as total_saves,
            COALESCE(SUM(pi.clicks), 0) as total_clicks,
            COALESCE(SUM(pi.video_views), 0) as total_video_views,
            COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement_rate,
            COUNT(DISTINCT pi.post_id) as posts_with_insights
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        WHERE 1=1 {date_filter} {client_filter}
    """
    eng = dict_from_row(db.execute(engagement_query, params).fetchone()) or {}

    # === POSTS PER DAY ===
    posts_per_day = dicts_from_rows(db.execute(f"""
        SELECT DATE(COALESCE(sp.scheduled_at, sp.created_at)) as date, COUNT(*) as count
        FROM scheduled_posts sp
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY date ORDER BY date
    """, params).fetchall())

    # === ENGAGEMENT PER DAY ===
    engagement_per_day = dicts_from_rows(db.execute(f"""
        SELECT DATE(COALESCE(sp.scheduled_at, sp.created_at)) as date,
               SUM(pi.impressions) as impressions,
               SUM(pi.reach) as reach,
               SUM(pi.likes) as likes,
               SUM(pi.comments) as comments
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY date ORDER BY date
    """, params).fetchall())

    # === PLATFORM DISTRIBUTION ===
    platform_distribution = dicts_from_rows(db.execute(f"""
        SELECT sp.platforms as platform, COUNT(*) as count
        FROM scheduled_posts sp
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY sp.platforms ORDER BY count DESC
    """, params).fetchall())

    # === PLATFORM ENGAGEMENT ===
    platform_engagement = dicts_from_rows(db.execute(f"""
        SELECT pi.platform,
               SUM(pi.impressions) as impressions,
               SUM(pi.reach) as reach,
               SUM(pi.likes) as likes,
               SUM(pi.comments) as comments,
               SUM(pi.shares) as shares,
               AVG(pi.engagement_rate) as avg_engagement_rate,
               COUNT(*) as posts
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY pi.platform ORDER BY impressions DESC
    """, params).fetchall())

    # === CONTENT TYPE PERFORMANCE ===
    content_type_stats = dicts_from_rows(db.execute(f"""
        SELECT sp.post_type as type, COUNT(*) as count,
               COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement,
               COALESCE(SUM(pi.impressions), 0) as impressions,
               COALESCE(SUM(pi.likes), 0) as likes
        FROM scheduled_posts sp
        LEFT JOIN post_insights pi ON sp.id = pi.post_id
        WHERE sp.post_type IS NOT NULL {date_filter} {client_filter}
        GROUP BY sp.post_type ORDER BY count DESC
    """, params).fetchall())

    # === BEST POSTING HOURS ===
    hourly_distribution = dicts_from_rows(db.execute(f"""
        SELECT CAST(strftime('%H', COALESCE(sp.scheduled_at, sp.created_at)) AS INTEGER) as hour,
               COUNT(*) as count,
               COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement
        FROM scheduled_posts sp
        LEFT JOIN post_insights pi ON sp.id = pi.post_id
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY hour ORDER BY hour
    """, params).fetchall())

    # === TOP CLIENTS BY ENGAGEMENT ===
    top_clients = dicts_from_rows(db.execute(f"""
        SELECT c.id, c.name, c.color, COUNT(sp.id) as posts,
               COALESCE(SUM(pi.impressions), 0) as impressions,
               COALESCE(SUM(pi.reach), 0) as reach,
               COALESCE(SUM(pi.likes), 0) as likes,
               COALESCE(SUM(pi.comments), 0) as comments,
               COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement_rate
        FROM scheduled_posts sp
        JOIN clients c ON sp.client_id = c.id
        LEFT JOIN post_insights pi ON sp.id = pi.post_id
        WHERE 1=1 {date_filter}
        GROUP BY sp.client_id ORDER BY impressions DESC, posts DESC
        LIMIT 10
    """).fetchall())

    # === TOP PERFORMING POSTS ===
    top_posts = dicts_from_rows(db.execute(f"""
        SELECT sp.id, sp.topic, sp.caption, sp.post_type, sp.platforms,
               sp.scheduled_at, sp.design_output_urls, c.name as client_name,
               pi.impressions, pi.reach, pi.likes, pi.comments, pi.shares,
               pi.saves, pi.engagement_rate, pi.video_views
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE 1=1 {date_filter} {client_filter}
        ORDER BY pi.engagement_rate DESC, pi.impressions DESC
        LIMIT 10
    """, params).fetchall())

    # === WORKFLOW STATS ===
    workflow_breakdown = dicts_from_rows(db.execute(f"""
        SELECT sp.workflow_status as status, COUNT(*) as count
        FROM scheduled_posts sp
        WHERE 1=1 {date_filter} {client_filter}
        GROUP BY sp.workflow_status ORDER BY count DESC
    """, params).fetchall())

    # === TEAM PERFORMANCE ===
    team_performance = dicts_from_rows(db.execute(f"""
        SELECT u.username, u.role,
               COUNT(DISTINCT wh.post_id) as actions,
               COUNT(DISTINCT CASE WHEN wh.to_status = 'approved' THEN wh.post_id END) as approvals,
               COUNT(DISTINCT CASE WHEN wh.to_status = 'posted' THEN wh.post_id END) as published
        FROM workflow_history wh
        JOIN users u ON wh.user_id = u.id
        WHERE 1=1 {date_filter.replace('sp.scheduled_at', 'wh.created_at').replace('sp.created_at', 'wh.created_at')}
        GROUP BY wh.user_id ORDER BY actions DESC
    """).fetchall())

    # === AVG TURNAROUND TIME (draft to posted) ===
    turnaround = dict_from_row(db.execute(f"""
        SELECT AVG(
            JULIANDAY(wh_posted.created_at) - JULIANDAY(sp.created_at)
        ) as avg_days
        FROM scheduled_posts sp
        JOIN workflow_history wh_posted ON sp.id = wh_posted.post_id AND wh_posted.to_status = 'posted'
        WHERE sp.status = 'posted' {date_filter} {client_filter}
    """, params).fetchone())

    db.close()

    return jsonify({
        # Content metrics
        'total_posts': total,
        'posted': posted,
        'failed': failed,
        'in_progress': in_progress,
        'success_rate': success_rate,
        # Engagement totals
        'engagement': {
            'impressions': eng.get('total_impressions', 0),
            'reach': eng.get('total_reach', 0),
            'likes': eng.get('total_likes', 0),
            'comments': eng.get('total_comments', 0),
            'shares': eng.get('total_shares', 0),
            'saves': eng.get('total_saves', 0),
            'clicks': eng.get('total_clicks', 0),
            'video_views': eng.get('total_video_views', 0),
            'avg_engagement_rate': round(eng.get('avg_engagement_rate', 0), 2),
            'posts_with_insights': eng.get('posts_with_insights', 0),
        },
        # Charts data
        'posts_per_day': posts_per_day,
        'engagement_per_day': engagement_per_day,
        'platform_distribution': platform_distribution,
        'platform_engagement': platform_engagement,
        'content_type_stats': content_type_stats,
        'hourly_distribution': hourly_distribution,
        # Tables
        'top_clients': top_clients,
        'top_posts': top_posts,
        'workflow_breakdown': workflow_breakdown,
        'team_performance': team_performance,
        'avg_turnaround_days': round(turnaround.get('avg_days', 0) or 0, 1),
    })


# === INSIGHTS SYNC ===

@analytics_bp.route('/api/insights/sync', methods=['POST'])
@require_login
def sync_insights():
    """Trigger a sync of engagement metrics from platform APIs."""
    from services.insights import sync_all_recent_insights
    try:
        result = sync_all_recent_insights()
        return jsonify({'success': True, **result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@analytics_bp.route('/api/posts/<int:post_id>/insights', methods=['GET'])
def get_post_insights(post_id):
    """Get stored insights for a specific post."""
    db = get_db()
    insights = dicts_from_rows(db.execute(
        "SELECT * FROM post_insights WHERE post_id=?", (post_id,)
    ).fetchall())
    db.close()
    return jsonify(insights)


@analytics_bp.route('/api/posts/<int:post_id>/insights/sync', methods=['POST'])
@require_login
def sync_single_post_insights(post_id):
    """Fetch latest insights for a single post."""
    from services.insights import sync_post_insights
    try:
        result = sync_post_insights(post_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# === USER STATS ===

@analytics_bp.route('/api/users/stats', methods=['GET'])
def user_stats():
    """Return monthly performance stats for all users."""
    db = get_db()
    now = datetime.now()
    month_start = now.strftime('%Y-%m-01')

    users = dicts_from_rows(db.execute(
        "SELECT id, username, role FROM users WHERE is_active=1"
    ).fetchall())

    clients = dicts_from_rows(db.execute(
        "SELECT id, content_requirements, assigned_designer_id, assigned_motion_id, assigned_sm_id, assigned_writer_id FROM clients"
    ).fetchall())

    result = {}

    for user in users:
        uid = user['id']
        role = user['role']
        stats = {'completed': 0, 'required': 0, 'label': ''}

        if role == 'sm_specialist':
            row = db.execute(
                "SELECT COUNT(*) as c FROM scheduled_posts WHERE created_by_id=? AND created_at >= ?",
                (uid, month_start)).fetchone()
            stats['completed'] = row['c']
            for c in clients:
                if c.get('assigned_sm_id') == uid or c.get('assigned_writer_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs)
            stats['label'] = 'posts created'

        elif role == 'designer':
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND from_status='in_design' AND to_status='approved' AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']
            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE assigned_designer_id=? AND design_output_urls IS NOT NULL AND design_output_urls != ''
                AND post_type IN ('post', 'story') AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = max(stats['completed'], row2['c'])
            for c in clients:
                if c.get('assigned_designer_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs if r.get('type') in ('post', 'story'))
            stats['label'] = 'designs uploaded'

        elif role == 'motion_designer':
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND from_status='in_design' AND to_status='approved' AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']
            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE assigned_motion_id=? AND design_output_urls IS NOT NULL AND design_output_urls != ''
                AND post_type IN ('video', 'reel') AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = max(stats['completed'], row2['c'])
            for c in clients:
                if c.get('assigned_motion_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs if r.get('type') in ('video', 'reel'))
            stats['label'] = 'motion designs'

        elif role == 'moderator':
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND to_status IN ('approved', 'scheduled') AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']
            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE workflow_status IN ('approved', 'scheduled', 'posted') AND created_at >= ?
            """, (month_start,)).fetchone()
            stats['required'] = row2['c']
            stats['label'] = 'posts approved'

        elif role == 'admin':
            row = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE created_at >= ?", (month_start,)).fetchone()
            stats['completed'] = row['c']
            stats['required'] = 0
            stats['label'] = 'total posts'

        result[str(uid)] = stats

    db.close()
    return jsonify(result)


@analytics_bp.route('/api/suggestions', methods=['GET'])
def get_suggestions():
    """Compute data-driven content recommendations from historical engagement data."""
    db = get_db()
    client_id = request.args.get('client_id', '')
    client_filter = ''
    client_params = []
    if client_id:
        client_filter = 'AND sp.client_id = ?'
        client_params = [int(client_id)]
    params = client_params

    # Best posting hours (top 5 by avg engagement)
    best_hours = dicts_from_rows(db.execute(f"""
        SELECT CAST(strftime('%H', COALESCE(sp.scheduled_at, sp.created_at)) AS INTEGER) as hour,
               COUNT(*) as post_count,
               COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement,
               COALESCE(SUM(pi.impressions), 0) as total_impressions
        FROM scheduled_posts sp
        LEFT JOIN post_insights pi ON sp.id = pi.post_id
        WHERE sp.status='posted' {client_filter}
        GROUP BY hour
        HAVING COUNT(*) >= 1
        ORDER BY avg_engagement DESC
        LIMIT 5
    """, params).fetchall())

    # Best content types
    best_content_types = dicts_from_rows(db.execute(f"""
        SELECT sp.post_type as type, COUNT(*) as post_count,
               COALESCE(AVG(pi.engagement_rate), 0) as avg_engagement,
               COALESCE(SUM(pi.impressions), 0) as total_impressions
        FROM scheduled_posts sp
        LEFT JOIN post_insights pi ON sp.id = pi.post_id
        WHERE sp.status='posted' AND sp.post_type IS NOT NULL {client_filter}
        GROUP BY sp.post_type
        ORDER BY avg_engagement DESC
    """, params).fetchall())

    # Best platforms
    best_platforms = dicts_from_rows(db.execute(f"""
        SELECT pi.platform, COUNT(*) as post_count,
               AVG(pi.engagement_rate) as avg_engagement,
               SUM(pi.impressions) as total_impressions,
               SUM(pi.likes) as total_likes
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        WHERE 1=1 {client_filter}
        GROUP BY pi.platform
        ORDER BY avg_engagement DESC
    """, params).fetchall())

    # Posting frequency: avg posts/day over last 30 days vs total posted
    freq_row = db.execute(f"""
        SELECT COUNT(*) as total_posted,
               COUNT(DISTINCT DATE(COALESCE(sp.scheduled_at, sp.created_at))) as active_days
        FROM scheduled_posts sp
        WHERE sp.status='posted'
          AND COALESCE(sp.scheduled_at, sp.created_at) >= datetime('now', '-30 days')
          {client_filter}
    """, params).fetchone()
    total_posted = freq_row['total_posted'] or 0
    active_days = freq_row['active_days'] or 1
    avg_posts_per_day = round(total_posted / 30, 1)

    # Content mix: current % per type
    content_mix = dicts_from_rows(db.execute(f"""
        SELECT sp.post_type as type, COUNT(*) as count
        FROM scheduled_posts sp
        WHERE sp.status='posted' AND sp.post_type IS NOT NULL {client_filter}
        GROUP BY sp.post_type ORDER BY count DESC
    """, params).fetchall())
    total_mix = sum(c['count'] for c in content_mix) or 1
    for c in content_mix:
        c['percentage'] = round(c['count'] / total_mix * 100, 1)

    # Per-platform best times
    platform_best_times = {}
    plat_hours = dicts_from_rows(db.execute(f"""
        SELECT pi.platform,
               CAST(strftime('%H', COALESCE(sp.scheduled_at, sp.created_at)) AS INTEGER) as hour,
               AVG(pi.engagement_rate) as avg_engagement,
               COUNT(*) as post_count
        FROM post_insights pi
        JOIN scheduled_posts sp ON pi.post_id = sp.id
        WHERE 1=1 {client_filter}
        GROUP BY pi.platform, hour
        HAVING COUNT(*) >= 1
        ORDER BY pi.platform, avg_engagement DESC
    """, params).fetchall())
    for row in plat_hours:
        plat = row['platform']
        if plat not in platform_best_times:
            platform_best_times[plat] = {'hour': row['hour'], 'avg_engagement': row['avg_engagement'], 'post_count': row['post_count']}

    db.close()
    return jsonify({
        'best_hours': best_hours,
        'best_content_types': best_content_types,
        'best_platforms': best_platforms,
        'posting_frequency': {
            'avg_posts_per_day': avg_posts_per_day,
            'total_last_30_days': total_posted,
            'active_days': active_days,
            'optimal_per_day': max(1, round(total_posted / max(active_days, 1), 1))
        },
        'content_mix': content_mix,
        'platform_best_times': platform_best_times
    })


def _parse_reqs(json_str):
    if not json_str:
        return []
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return []
