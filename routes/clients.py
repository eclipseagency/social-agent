from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

clients_bp = Blueprint('clients', __name__)


@clients_bp.route('/api/clients', methods=['GET'])
def list_clients():
    db = get_db()
    clients = dicts_from_rows(db.execute("""
        SELECT c.*,
               u_writer.username as assigned_writer_name,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_motion.username as assigned_motion_name,
               u_manager.username as assigned_manager_name
        FROM clients c
        LEFT JOIN users u_writer ON c.assigned_writer_id = u_writer.id
        LEFT JOIN users u_designer ON c.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON c.assigned_sm_id = u_sm.id
        LEFT JOIN users u_motion ON c.assigned_motion_id = u_motion.id
        LEFT JOIN users u_manager ON c.assigned_manager_id = u_manager.id
        ORDER BY c.id DESC
    """).fetchall())
    db.close()
    return jsonify(clients)


@clients_bp.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    db = get_db()
    client = dict_from_row(db.execute("""
        SELECT c.*,
               u_writer.username as assigned_writer_name,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_motion.username as assigned_motion_name,
               u_manager.username as assigned_manager_name
        FROM clients c
        LEFT JOIN users u_writer ON c.assigned_writer_id = u_writer.id
        LEFT JOIN users u_designer ON c.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON c.assigned_sm_id = u_sm.id
        LEFT JOIN users u_motion ON c.assigned_motion_id = u_motion.id
        LEFT JOIN users u_manager ON c.assigned_manager_id = u_manager.id
        WHERE c.id=?
    """, (client_id,)).fetchone())
    if not client:
        db.close()
        return jsonify({'error': 'Client not found'}), 404
    accounts = dicts_from_rows(db.execute(
        "SELECT * FROM accounts WHERE client_id=?", (client_id,)
    ).fetchall())
    db.close()
    client['accounts'] = accounts
    return jsonify(client)


@clients_bp.route('/api/clients', methods=['POST'])
def create_client():
    data = request.json or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    company = data.get('company', '').strip()

    if not name:
        return jsonify({'error': 'Client name required'}), 400

    brief_text = data.get('brief_text', '').strip()
    content_requirements = data.get('content_requirements', '').strip()

    db = get_db()
    cursor = db.execute(
        "INSERT INTO clients (name, email, company, brief_text, content_requirements) VALUES (?,?,?,?,?)",
        (name, email or None, company or None, brief_text, content_requirements)
    )
    db.commit()
    client_id = cursor.lastrowid
    db.close()
    return jsonify({'success': True, 'id': client_id})


@clients_bp.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    data = request.json or {}
    db = get_db()
    client = dict_from_row(db.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone())
    if not client:
        db.close()
        return jsonify({'error': 'Client not found'}), 404

    updatable = ['name', 'email', 'company', 'color', 'brief_text', 'content_requirements',
                 'assigned_writer_id', 'assigned_designer_id',
                 'assigned_sm_id', 'assigned_motion_id', 'assigned_manager_id']
    fields = []
    params = []
    for field in updatable:
        if field in data:
            fields.append(f"{field}=?")
            val = data[field]
            # Convert empty strings to None for integer FK fields
            if field.endswith('_id') and (val == '' or val is None):
                val = None
            params.append(val)

    if fields:
        params.append(client_id)
        db.execute(f"UPDATE clients SET {', '.join(fields)} WHERE id=?", params)
        db.commit()

    db.close()
    return jsonify({'success': True})


@clients_bp.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    db = get_db()
    db.execute("DELETE FROM accounts WHERE client_id=?", (client_id,))
    db.execute("DELETE FROM scheduled_posts WHERE client_id=?", (client_id,))
    db.execute("DELETE FROM clients WHERE id=?", (client_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@clients_bp.route('/api/clients/<int:client_id>/accounts', methods=['POST'])
def add_account(client_id):
    data = request.json or {}
    platform = data.get('platform', '')
    account_name = data.get('account_name', '')
    access_token = data.get('access_token', '')
    account_id = data.get('account_id', '')

    if not platform:
        return jsonify({'error': 'Platform required'}), 400

    db = get_db()
    db.execute(
        """INSERT INTO accounts (client_id, platform, account_name, access_token, account_id)
           VALUES (?,?,?,?,?)""",
        (client_id, platform, account_name, access_token, account_id)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@clients_bp.route('/api/accounts/<int:account_id>', methods=['DELETE'])
def delete_account(account_id):
    db = get_db()
    db.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@clients_bp.route('/api/clients/overview', methods=['GET'])
def clients_overview():
    """Return all clients with coverage data and pipeline stats."""
    db = get_db()
    clients = dicts_from_rows(db.execute("""
        SELECT c.*,
               u_writer.username as assigned_writer_name,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_motion.username as assigned_motion_name,
               u_manager.username as assigned_manager_name
        FROM clients c
        LEFT JOIN users u_writer ON c.assigned_writer_id = u_writer.id
        LEFT JOIN users u_designer ON c.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON c.assigned_sm_id = u_sm.id
        LEFT JOIN users u_motion ON c.assigned_motion_id = u_motion.id
        LEFT JOIN users u_manager ON c.assigned_manager_id = u_manager.id
        ORDER BY c.id DESC
    """).fetchall())

    today = datetime.now().date()
    this_week_start = today - timedelta(days=today.weekday())
    this_week_end = this_week_start + timedelta(days=6)
    next_week_start = this_week_end + timedelta(days=1)
    next_week_end = next_week_start + timedelta(days=6)

    for client in clients:
        cid = client['id']

        # This week's posts
        this_week_posts = db.execute("""
            SELECT scheduled_at FROM scheduled_posts
            WHERE client_id=? AND scheduled_at >= ? AND scheduled_at <= ?
              AND scheduled_at IS NOT NULL AND scheduled_at != ''
        """, (cid, this_week_start.isoformat(), this_week_end.isoformat() + 'T23:59:59')).fetchall()

        # Next week's posts
        next_week_posts = db.execute("""
            SELECT scheduled_at FROM scheduled_posts
            WHERE client_id=? AND scheduled_at >= ? AND scheduled_at <= ?
              AND scheduled_at IS NOT NULL AND scheduled_at != ''
        """, (cid, next_week_start.isoformat(), next_week_end.isoformat() + 'T23:59:59')).fetchall()

        # Coverage: which days of the week have posts
        this_week_days = set()
        for row in this_week_posts:
            sa = row['scheduled_at'] or ''
            if len(sa) >= 10:
                try:
                    dt = datetime.strptime(sa[:10], '%Y-%m-%d').date()
                    this_week_days.add((dt - this_week_start).days)
                except ValueError:
                    pass

        next_week_days = set()
        for row in next_week_posts:
            sa = row['scheduled_at'] or ''
            if len(sa) >= 10:
                try:
                    dt = datetime.strptime(sa[:10], '%Y-%m-%d').date()
                    next_week_days.add((dt - next_week_start).days)
                except ValueError:
                    pass

        client['this_week_coverage'] = len(this_week_days)
        client['next_week_coverage'] = len(next_week_days)
        client['this_week_total'] = len(this_week_posts)
        client['next_week_total'] = len(next_week_posts)

        # Pipeline stats
        pipeline = db.execute("""
            SELECT workflow_status, COUNT(*) as c
            FROM scheduled_posts
            WHERE client_id=? AND workflow_status IS NOT NULL AND workflow_status != '' AND workflow_status != 'posted'
            GROUP BY workflow_status
        """, (cid,)).fetchall()
        client['pipeline'] = {row['workflow_status']: row['c'] for row in pipeline}

        # Accounts
        accounts = dicts_from_rows(db.execute(
            "SELECT platform, account_name FROM accounts WHERE client_id=?", (cid,)
        ).fetchall())
        client['accounts'] = accounts

    db.close()

    # Alerts
    alerts = []
    for client in clients:
        if client['next_week_coverage'] == 0:
            alerts.append({
                'type': 'no_coverage',
                'client_id': client['id'],
                'client_name': client['name'],
                'message': f'{client["name"]} ليس لديه منشورات مجدولة الأسبوع القادم'
            })

    return jsonify({'clients': clients, 'alerts': alerts})


@clients_bp.route('/api/clients/<int:client_id>/coverage', methods=['GET'])
def client_coverage(client_id):
    """Return weekly coverage arrays for a specific client."""
    weeks = int(request.args.get('weeks', 4))
    db = get_db()

    today = datetime.now().date()
    start_date = today - timedelta(days=today.weekday())

    coverage = []
    for week_offset in range(weeks):
        week_start = start_date + timedelta(weeks=week_offset)
        week_end = week_start + timedelta(days=6)

        posts = db.execute("""
            SELECT scheduled_at FROM scheduled_posts
            WHERE client_id=? AND scheduled_at >= ? AND scheduled_at <= ?
              AND scheduled_at IS NOT NULL AND scheduled_at != ''
        """, (client_id, week_start.isoformat(), week_end.isoformat() + 'T23:59:59')).fetchall()

        days_covered = [False] * 7
        for row in posts:
            sa = row['scheduled_at'] or ''
            if len(sa) >= 10:
                try:
                    dt = datetime.strptime(sa[:10], '%Y-%m-%d').date()
                    day_idx = (dt - week_start).days
                    if 0 <= day_idx < 7:
                        days_covered[day_idx] = True
                except ValueError:
                    pass

        coverage.append({
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'days': days_covered,
            'post_count': len(posts),
        })

    db.close()
    return jsonify({'coverage': coverage})
