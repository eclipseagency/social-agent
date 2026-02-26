import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from models import get_db, dicts_from_rows

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
    db = get_db()

    # Total posts
    total = db.execute("SELECT COUNT(*) as c FROM scheduled_posts").fetchone()['c']
    posted = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE status='posted'").fetchone()['c']
    failed = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE status='failed'").fetchone()['c']
    success_rate = round((posted / total * 100) if total > 0 else 0, 1)

    # Posts per day (last 30 days)
    posts_per_day = dicts_from_rows(db.execute("""
        SELECT DATE(COALESCE(scheduled_at, created_at)) as date, COUNT(*) as count
        FROM scheduled_posts
        WHERE COALESCE(scheduled_at, created_at) >= datetime('now', '-30 days')
        GROUP BY date
        ORDER BY date
    """).fetchall())

    # Platform distribution
    platform_distribution = dicts_from_rows(db.execute("""
        SELECT platforms as platform, COUNT(*) as count
        FROM scheduled_posts
        GROUP BY platforms
        ORDER BY count DESC
    """).fetchall())

    # Hourly distribution
    hourly_distribution = dicts_from_rows(db.execute("""
        SELECT CAST(strftime('%H', COALESCE(scheduled_at, created_at)) AS INTEGER) as hour, COUNT(*) as count
        FROM scheduled_posts
        GROUP BY hour
        ORDER BY hour
    """).fetchall())

    # Top clients
    top_clients = dicts_from_rows(db.execute("""
        SELECT c.name, COUNT(sp.id) as posts
        FROM scheduled_posts sp
        JOIN clients c ON sp.client_id = c.id
        GROUP BY sp.client_id
        ORDER BY posts DESC
        LIMIT 5
    """).fetchall())

    db.close()
    return jsonify({
        'total_posts': total,
        'posted': posted,
        'failed': failed,
        'success_rate': success_rate,
        'posts_per_day': posts_per_day,
        'platform_distribution': platform_distribution,
        'hourly_distribution': hourly_distribution,
        'top_clients': top_clients
    })


@analytics_bp.route('/api/users/stats', methods=['GET'])
def user_stats():
    """Return monthly performance stats for all users.

    For each user, based on role:
    - sm_specialist: posts created this month, required from assigned clients
    - designer: designs completed (post/story), required from assigned clients
    - motion_designer: designs completed (video/reel), required from assigned clients
    - moderator: posts approved + scheduled this month
    """
    db = get_db()
    now = datetime.now()
    month_start = now.strftime('%Y-%m-01')
    month_end = now.strftime('%Y-%m-') + str(now.day).zfill(2) + 'T23:59:59'

    users = dicts_from_rows(db.execute(
        "SELECT id, username, role FROM users WHERE is_active=1"
    ).fetchall())

    # Pre-load all clients with their content_requirements and assignments
    clients = dicts_from_rows(db.execute(
        "SELECT id, content_requirements, assigned_designer_id, assigned_motion_id, assigned_sm_id, assigned_writer_id FROM clients"
    ).fetchall())

    result = {}

    for user in users:
        uid = user['id']
        role = user['role']
        stats = {'completed': 0, 'required': 0, 'label': ''}

        if role == 'sm_specialist':
            # Count posts created by this SMM this month
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE created_by_id=? AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']

            # Required: sum all content reqs from clients assigned to this SMM
            for c in clients:
                if c.get('assigned_sm_id') == uid or c.get('assigned_writer_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs)
            stats['label'] = 'posts created'

        elif role == 'designer':
            # Count designs completed: workflow_history transitions from in_design -> design_review by this user
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND from_status='in_design' AND to_status='design_review'
                AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']

            # Also count posts assigned to them that have design_output_urls (past in_design)
            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE assigned_designer_id=?
                AND design_output_urls IS NOT NULL AND design_output_urls != ''
                AND post_type IN ('post', 'story')
                AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = max(stats['completed'], row2['c'])

            # Required: sum post/story reqs from assigned clients
            for c in clients:
                if c.get('assigned_designer_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs if r.get('type') in ('post', 'story'))
            stats['label'] = 'designs uploaded'

        elif role == 'motion_designer':
            # Count motion designs completed
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND from_status='in_design' AND to_status='design_review'
                AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']

            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE assigned_motion_id=?
                AND design_output_urls IS NOT NULL AND design_output_urls != ''
                AND post_type IN ('video', 'reel')
                AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = max(stats['completed'], row2['c'])

            # Required: sum video/reel reqs from assigned clients
            for c in clients:
                if c.get('assigned_motion_id') == uid:
                    reqs = _parse_reqs(c.get('content_requirements'))
                    stats['required'] += sum(r.get('count', 0) for r in reqs if r.get('type') in ('video', 'reel'))
            stats['label'] = 'motion designs'

        elif role == 'moderator':
            # Count posts approved or scheduled by this moderator this month
            row = db.execute("""
                SELECT COUNT(*) as c FROM workflow_history
                WHERE user_id=? AND to_status IN ('approved', 'scheduled')
                AND created_at >= ?
            """, (uid, month_start)).fetchone()
            stats['completed'] = row['c']

            # Required: total posts in design_review or later this month
            row2 = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE workflow_status IN ('design_review', 'approved', 'scheduled', 'posted')
                AND created_at >= ?
            """, (month_start,)).fetchone()
            stats['required'] = row2['c']
            stats['label'] = 'posts approved'

        elif role == 'admin':
            # Total posts and accounts for admin overview
            row = db.execute("SELECT COUNT(*) as c FROM scheduled_posts WHERE created_at >= ?", (month_start,)).fetchone()
            stats['completed'] = row['c']
            stats['required'] = 0
            stats['label'] = 'total posts'

        result[str(uid)] = stats

    db.close()
    return jsonify(result)


def _parse_reqs(json_str):
    """Parse content_requirements JSON safely."""
    if not json_str:
        return []
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return []
