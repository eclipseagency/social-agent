import json
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from models import get_db, dict_from_row, dicts_from_rows

capacity_bp = Blueprint('capacity', __name__)


@capacity_bp.route('/api/capacity', methods=['GET'])
def get_capacity():
    """Return team capacity data: heatmap, bars, role summary, unassigned, deadlines."""
    db = get_db()
    role_filter = request.args.get('role', '')
    now = datetime.now()
    month_start = now.strftime('%Y-%m-01')

    # Get all active users
    user_query = "SELECT id, username, role, job_title FROM users WHERE is_active=1"
    user_params = []
    if role_filter:
        user_query += " AND role=?"
        user_params = [role_filter]
    users = dicts_from_rows(db.execute(user_query, user_params).fetchall())

    # Get all clients with content requirements
    clients = dicts_from_rows(db.execute(
        "SELECT id, name, content_requirements, assigned_designer_id, assigned_motion_id, assigned_sm_id, assigned_writer_id, assigned_manager_id FROM clients"
    ).fetchall())

    # === CAPACITY BARS ===
    capacity_bars = []
    for user in users:
        uid = user['id']
        role = user['role']

        # Count active posts assigned to this user this month (not posted/failed)
        active_count = 0
        if role in ('designer', 'motion_designer'):
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE (assigned_designer_id=? OR assigned_motion_id=?)
                  AND workflow_status NOT IN ('posted', 'failed')
                  AND created_at >= ?
            """, (uid, uid, month_start)).fetchone()
            active_count = row['c']
        elif role == 'sm_specialist':
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE (assigned_sm_id=? OR created_by_id=?)
                  AND workflow_status NOT IN ('posted', 'failed')
                  AND created_at >= ?
            """, (uid, uid, month_start)).fetchone()
            active_count = row['c']
        elif role == 'moderator':
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE workflow_status IN ('approved', 'scheduled')
                  AND created_at >= ?
            """, (month_start,)).fetchone()
            active_count = row['c']
        elif role == 'admin':
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE workflow_status NOT IN ('posted', 'failed')
                  AND created_at >= ?
            """, (month_start,)).fetchone()
            active_count = row['c']

        # Calculate required from client content_requirements
        required = 0
        for c in clients:
            assigned = False
            if role == 'designer' and c.get('assigned_designer_id') == uid:
                assigned = True
            elif role == 'motion_designer' and c.get('assigned_motion_id') == uid:
                assigned = True
            elif role == 'sm_specialist' and (c.get('assigned_sm_id') == uid or c.get('assigned_writer_id') == uid):
                assigned = True
            elif role == 'moderator':
                assigned = True

            if assigned:
                reqs = _parse_reqs(c.get('content_requirements'))
                for r in reqs:
                    if role == 'designer' and r.get('type') in ('post', 'story', 'carousel', 'banner', 'brochure'):
                        required += r.get('count', 0)
                    elif role == 'motion_designer' and r.get('type') in ('video', 'reel'):
                        required += r.get('count', 0)
                    elif role in ('sm_specialist', 'moderator', 'admin'):
                        required += r.get('count', 0)

        utilization = round((active_count / required * 100) if required > 0 else 0, 1)
        capacity_bars.append({
            'user_id': uid,
            'username': user['username'],
            'role': role,
            'job_title': user.get('job_title', ''),
            'active': active_count,
            'required': required,
            'utilization': utilization
        })

    # === HEATMAP: users x dates (next 14 days from month start) ===
    heatmap_start = now - timedelta(days=6)
    heatmap_end = now + timedelta(days=7)
    heatmap_data = []
    for user in users:
        uid = user['id']
        days = []
        for i in range(14):
            day = heatmap_start + timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            row = db.execute("""
                SELECT COUNT(*) as c FROM scheduled_posts
                WHERE (assigned_designer_id=? OR assigned_sm_id=? OR assigned_motion_id=? OR created_by_id=?)
                  AND DATE(COALESCE(scheduled_at, created_at)) = ?
                  AND workflow_status NOT IN ('posted', 'failed')
            """, (uid, uid, uid, uid, day_str)).fetchone()
            days.append({'date': day_str, 'count': row['c']})
        heatmap_data.append({
            'user_id': uid,
            'username': user['username'],
            'role': user['role'],
            'days': days
        })

    # === ROLE SUMMARY ===
    role_summary = {}
    for bar in capacity_bars:
        r = bar['role']
        if r not in role_summary:
            role_summary[r] = {'role': r, 'users': 0, 'active': 0, 'required': 0}
        role_summary[r]['users'] += 1
        role_summary[r]['active'] += bar['active']
        role_summary[r]['required'] += bar['required']
    for rs in role_summary.values():
        rs['utilization'] = round((rs['active'] / rs['required'] * 100) if rs['required'] > 0 else 0, 1)

    # === UNASSIGNED POSTS ===
    unassigned = dicts_from_rows(db.execute("""
        SELECT sp.id, sp.topic, sp.caption, sp.post_type, sp.platforms, sp.workflow_status,
               sp.scheduled_at, sp.priority, c.name as client_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE sp.workflow_status NOT IN ('posted', 'failed', 'draft')
          AND (
            (sp.workflow_status = 'in_design' AND sp.assigned_designer_id IS NULL)
            OR (sp.workflow_status = 'pending_review' AND sp.assigned_manager_id IS NULL)
            OR (sp.workflow_status IN ('approved', 'scheduled') AND sp.assigned_sm_id IS NULL)
          )
        ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, sp.created_at DESC
        LIMIT 20
    """).fetchall())

    # === UPCOMING DEADLINES (7 days) ===
    deadline_end = (now + timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
    deadlines = dicts_from_rows(db.execute("""
        SELECT sp.id, sp.topic, sp.post_type, sp.platforms, sp.scheduled_at, sp.workflow_status,
               sp.priority, c.name as client_name,
               u_d.username as designer_name, u_s.username as sm_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        LEFT JOIN users u_d ON sp.assigned_designer_id = u_d.id
        LEFT JOIN users u_s ON sp.assigned_sm_id = u_s.id
        WHERE sp.scheduled_at IS NOT NULL AND sp.scheduled_at != ''
          AND sp.scheduled_at <= ?
          AND sp.scheduled_at >= datetime('now')
          AND sp.workflow_status NOT IN ('posted', 'failed')
        ORDER BY sp.scheduled_at ASC
    """, (deadline_end,)).fetchall())

    # Get distinct roles for filter
    roles = list(set(u['role'] for u in users))

    db.close()
    return jsonify({
        'capacity_bars': capacity_bars,
        'heatmap': heatmap_data,
        'role_summary': list(role_summary.values()),
        'unassigned': unassigned,
        'deadlines': deadlines,
        'roles': sorted(roles)
    })


def _parse_reqs(json_str):
    if not json_str:
        return []
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return []
