from flask import Blueprint, jsonify
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
