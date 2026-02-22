import csv
import io
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from models import get_db, dicts_from_rows

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/api/reports/generate', methods=['POST'])
def generate_report():
    """Generate a client report for a date range."""
    data = request.json or {}
    client_id = data.get('client_id')
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    if not client_id:
        return jsonify({'error': 'Client required'}), 400
    if not start_date or not end_date:
        return jsonify({'error': 'Date range required'}), 400

    db = get_db()

    # Get client info
    client = db.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone()
    if not client:
        db.close()
        return jsonify({'error': 'Client not found'}), 404
    client_name = client['name']

    # Get posts in date range
    posts = dicts_from_rows(db.execute("""
        SELECT sp.*, c.name as client_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE sp.client_id=?
          AND sp.created_at >= ?
          AND sp.created_at <= ?
        ORDER BY sp.created_at DESC
    """, (client_id, start_date, end_date + ' 23:59:59')).fetchall())

    # Summary stats
    total_posts = len(posts)
    posted_count = sum(1 for p in posts if p.get('status') == 'posted' or p.get('workflow_status') == 'posted')
    scheduled_count = sum(1 for p in posts if p.get('status') == 'pending' or p.get('workflow_status') == 'scheduled')
    draft_count = sum(1 for p in posts if p.get('workflow_status') in ('draft', 'in_design', 'design_review', 'approved'))

    # Platform breakdown
    platform_counts = {}
    for post in posts:
        platforms_str = post.get('platforms', '') or ''
        for plat in platforms_str.split(','):
            plat = plat.strip()
            if plat:
                platform_counts[plat] = platform_counts.get(plat, 0) + 1

    # Weekly breakdown
    weekly = {}
    for post in posts:
        created = post.get('created_at', '') or post.get('scheduled_at', '')
        if created:
            try:
                dt = datetime.strptime(created[:10], '%Y-%m-%d')
                week_start = dt - timedelta(days=dt.weekday())
                week_key = week_start.strftime('%Y-%m-%d')
                weekly[week_key] = weekly.get(week_key, 0) + 1
            except (ValueError, TypeError):
                pass

    # Upcoming scheduled posts (next 7 days)
    now = datetime.now().strftime('%Y-%m-%d')
    next_week = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    upcoming = dicts_from_rows(db.execute("""
        SELECT sp.id, sp.topic, sp.platforms, sp.scheduled_at, sp.workflow_status
        FROM scheduled_posts sp
        WHERE sp.client_id=?
          AND sp.scheduled_at >= ?
          AND sp.scheduled_at <= ?
          AND sp.status='pending'
        ORDER BY sp.scheduled_at ASC
    """, (client_id, now, next_week + ' 23:59:59')).fetchall())

    db.close()

    # Sort weekly by date
    weekly_sorted = [{'week': k, 'count': v} for k, v in sorted(weekly.items())]

    report = {
        'client_name': client_name,
        'client_id': client_id,
        'start_date': start_date,
        'end_date': end_date,
        'summary': {
            'total_posts': total_posts,
            'posted': posted_count,
            'scheduled': scheduled_count,
            'in_progress': draft_count,
        },
        'platform_breakdown': platform_counts,
        'weekly_breakdown': weekly_sorted,
        'posts': posts,
        'upcoming': upcoming,
    }

    return jsonify(report)


@reports_bp.route('/api/reports/export/csv', methods=['POST'])
def export_csv():
    """Export client report as CSV."""
    data = request.json or {}
    client_id = data.get('client_id')
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    if not client_id or not start_date or not end_date:
        return jsonify({'error': 'Client and date range required'}), 400

    db = get_db()
    client = db.execute("SELECT name FROM clients WHERE id=?", (client_id,)).fetchone()
    client_name = client['name'] if client else 'Unknown'

    posts = dicts_from_rows(db.execute("""
        SELECT sp.id, sp.topic, sp.caption, sp.platforms, sp.scheduled_at,
               sp.status, sp.workflow_status, sp.post_type, sp.created_at
        FROM scheduled_posts sp
        WHERE sp.client_id=?
          AND sp.created_at >= ?
          AND sp.created_at <= ?
        ORDER BY sp.created_at DESC
    """, (client_id, start_date, end_date + ' 23:59:59')).fetchall())
    db.close()

    output = io.StringIO()
    # Add BOM for Arabic text support in Excel
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow(['ID', 'Topic', 'Caption', 'Platforms', 'Scheduled At',
                     'Status', 'Workflow Status', 'Post Type', 'Created At'])

    for post in posts:
        writer.writerow([
            post.get('id', ''),
            post.get('topic', ''),
            post.get('caption', ''),
            post.get('platforms', ''),
            post.get('scheduled_at', ''),
            post.get('status', ''),
            post.get('workflow_status', ''),
            post.get('post_type', ''),
            post.get('created_at', ''),
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    safe_name = client_name.replace(' ', '_')
    response.headers['Content-Disposition'] = f'attachment; filename=report_{safe_name}_{start_date}_{end_date}.csv'
    return response
