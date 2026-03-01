import os
import re
import uuid
import requests as http_requests
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

clients_bp = Blueprint('clients', __name__)


def _slugify(name, db, exclude_id=None):
    """Generate a unique slug from a client name."""
    base = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-') or 'client'
    slug = base
    counter = 2
    while True:
        q = "SELECT id FROM clients WHERE slug=?"
        params = [slug]
        if exclude_id is not None:
            q += " AND id!=?"
            params.append(exclude_id)
        if not db.execute(q, params).fetchone():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


@clients_bp.route('/api/clients', methods=['GET'])
def list_clients():
    db = get_db()
    user_id = request.args.get('user_id')
    role = request.args.get('role', '')

    base = """
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
    """

    # Admin and moderator see all clients; others see only assigned
    if user_id and role not in ('admin', 'moderator'):
        query = base + """
        WHERE (c.assigned_writer_id = ? OR c.assigned_designer_id = ?
               OR c.assigned_sm_id = ? OR c.assigned_motion_id = ?
               OR c.assigned_manager_id = ?)
        ORDER BY c.id DESC
        """
        clients = dicts_from_rows(db.execute(query,
            (user_id, user_id, user_id, user_id, user_id)).fetchall())
    else:
        clients = dicts_from_rows(db.execute(base + " ORDER BY c.id DESC").fetchall())

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


@clients_bp.route('/api/clients/by-slug/<slug>', methods=['GET'])
def get_client_by_slug(slug):
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
        WHERE c.slug=?
    """, (slug,)).fetchone())
    if not client:
        db.close()
        return jsonify({'error': 'Client not found'}), 404
    accounts = dicts_from_rows(db.execute(
        "SELECT * FROM accounts WHERE client_id=?", (client['id'],)
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
    brief_url = data.get('brief_url', '').strip()
    brief_file_url = data.get('brief_file_url', '').strip()
    content_requirements = data.get('content_requirements', '').strip()
    website = data.get('website', '').strip()
    logo_url = data.get('logo_url', '').strip()

    db = get_db()
    slug = _slugify(name, db)
    cursor = db.execute(
        "INSERT INTO clients (name, email, company, brief_text, brief_url, brief_file_url, content_requirements, slug, website, logo_url) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (name, email or None, company or None, brief_text, brief_url or None, brief_file_url or None, content_requirements, slug, website, logo_url)
    )
    db.commit()
    client_id = cursor.lastrowid
    db.close()
    return jsonify({'success': True, 'id': client_id, 'slug': slug})


@clients_bp.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    data = request.json or {}
    db = get_db()
    client = dict_from_row(db.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone())
    if not client:
        db.close()
        return jsonify({'error': 'Client not found'}), 404

    updatable = ['name', 'email', 'company', 'color', 'brief_text', 'brief_url', 'brief_file_url',
                 'content_requirements', 'assigned_writer_id', 'assigned_designer_id',
                 'assigned_sm_id', 'assigned_motion_id', 'assigned_manager_id',
                 'website', 'logo_url']
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

    # Regenerate slug if name changed
    if 'name' in data and data['name'].strip():
        new_slug = _slugify(data['name'].strip(), db, exclude_id=client_id)
        fields.append("slug=?")
        params.append(new_slug)

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


@clients_bp.route('/api/accounts/<int:account_id>/check-status', methods=['GET'])
def check_account_status(account_id):
    """Verify if an account's API token is still valid by making a simple API call."""
    db = get_db()
    account = dict_from_row(db.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone())
    db.close()

    if not account:
        return jsonify({'error': 'Account not found'}), 404

    platform = account.get('platform', '')
    token = account.get('access_token', '')
    acct_id = account.get('account_id', '')

    if not token:
        return jsonify({'status': 'no_token', 'message': 'No access token configured'})

    try:
        if platform in ('instagram', 'facebook'):
            # Meta Graph API debug token or simple me query
            resp = http_requests.get(
                f"https://graph.facebook.com/v18.0/{acct_id or 'me'}",
                params={'access_token': token, 'fields': 'id,name'},
                timeout=10
            )
            data = resp.json()
            if 'error' in data:
                err = data['error']
                return jsonify({
                    'status': 'error',
                    'message': err.get('message', 'Token invalid'),
                    'code': err.get('code'),
                    'needs_reauth': err.get('code') in (190, 102)
                })
            return jsonify({
                'status': 'active',
                'message': f'Connected as {data.get("name", acct_id)}',
                'account_name': data.get('name', '')
            })

        elif platform == 'linkedin':
            resp = http_requests.get(
                'https://api.linkedin.com/v2/userinfo',
                headers={'Authorization': f'Bearer {token}'},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                return jsonify({
                    'status': 'active',
                    'message': f'Connected as {data.get("name", "LinkedIn User")}'
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Token expired or invalid',
                    'needs_reauth': True
                })

        else:
            return jsonify({'status': 'unknown', 'message': f'Status check not supported for {platform}'})

    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Connection failed: {str(e)}'})


@clients_bp.route('/api/clients/<int:client_id>/check-all-accounts', methods=['GET'])
def check_all_accounts(client_id):
    """Check status of all accounts for a client."""
    db = get_db()
    accounts = dicts_from_rows(db.execute(
        "SELECT id, platform, account_name, account_id FROM accounts WHERE client_id=?",
        (client_id,)
    ).fetchall())
    db.close()

    results = []
    for acct in accounts:
        try:
            # Call our own check endpoint internally
            from flask import current_app
            with current_app.test_request_context():
                status_resp = check_account_status(acct['id'])
                status_data = status_resp[0].get_json() if isinstance(status_resp, tuple) else status_resp.get_json()
        except Exception:
            status_data = {'status': 'error', 'message': 'Check failed'}
        results.append({
            'account_id': acct['id'],
            'platform': acct['platform'],
            'account_name': acct.get('account_name', ''),
            'account_api_id': acct.get('account_id', ''),
            **status_data
        })

    return jsonify(results)


@clients_bp.route('/api/clients/overview', methods=['GET'])
def clients_overview():
    """Return all clients with coverage data and pipeline stats."""
    db = get_db()
    user_id = request.args.get('user_id')
    role = request.args.get('role', '')

    base = """
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
    """

    if user_id and role not in ('admin', 'moderator'):
        query = base + """
        WHERE (c.assigned_writer_id = ? OR c.assigned_designer_id = ?
               OR c.assigned_sm_id = ? OR c.assigned_motion_id = ?
               OR c.assigned_manager_id = ?)
        ORDER BY c.id DESC
        """
        clients = dicts_from_rows(db.execute(query,
            (user_id, user_id, user_id, user_id, user_id)).fetchall())
    else:
        clients = dicts_from_rows(db.execute(base + " ORDER BY c.id DESC").fetchall())

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


def _fetch_logo_from_url(url):
    """Fetch a logo from a website URL. Returns local path or None."""
    if not url:
        return None

    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split('/')[0]
    except Exception:
        return None

    logo_src = None

    # Try fetching the page and parsing for logo tags
    try:
        resp = http_requests.get(url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        resp.raise_for_status()
        html = resp.text

        # Priority 1: apple-touch-icon
        match = re.search(r'<link[^>]*rel=["\']apple-touch-icon["\'][^>]*href=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if not match:
            match = re.search(r'<link[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']apple-touch-icon["\']', html, re.IGNORECASE)
        if match:
            logo_src = match.group(1)

        # Priority 2: og:image
        if not logo_src:
            match = re.search(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if not match:
                match = re.search(r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', html, re.IGNORECASE)
            if match:
                logo_src = match.group(1)

        # Priority 3: PNG favicon
        if not logo_src:
            match = re.search(r'<link[^>]*rel=["\']icon["\'][^>]*href=["\']([^"\']+\.png[^"\']*)["\']', html, re.IGNORECASE)
            if not match:
                match = re.search(r'<link[^>]*href=["\']([^"\']+\.png[^"\']*)["\'][^>]*rel=["\']icon["\']', html, re.IGNORECASE)
            if match:
                logo_src = match.group(1)

        # Priority 4: any favicon
        if not logo_src:
            match = re.search(r'<link[^>]*rel=["\'](?:shortcut )?icon["\'][^>]*href=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if not match:
                match = re.search(r'<link[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\'](?:shortcut )?icon["\']', html, re.IGNORECASE)
            if match:
                logo_src = match.group(1)

    except Exception:
        pass

    # Resolve relative URL
    if logo_src and not logo_src.startswith(('http://', 'https://', '//')):
        logo_src = urljoin(url, logo_src)
    elif logo_src and logo_src.startswith('//'):
        logo_src = 'https:' + logo_src

    # Fallback: Google Favicon API
    if not logo_src:
        logo_src = f'https://www.google.com/s2/favicons?domain={domain}&sz=128'

    # Download the logo image and save locally
    try:
        img_resp = http_requests.get(logo_src, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        img_resp.raise_for_status()

        content_type = img_resp.headers.get('Content-Type', '')
        if 'png' in content_type:
            ext = '.png'
        elif 'svg' in content_type:
            ext = '.svg'
        elif 'gif' in content_type:
            ext = '.gif'
        elif 'webp' in content_type:
            ext = '.webp'
        elif 'ico' in content_type or 'x-icon' in content_type:
            ext = '.ico'
        else:
            ext = '.png'

        logos_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'logos')
        os.makedirs(logos_dir, exist_ok=True)

        filename = f"{uuid.uuid4().hex[:12]}{ext}"
        filepath = os.path.join(logos_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(img_resp.content)

        return f'/uploads/logos/{filename}'

    except Exception:
        fallback = f'https://www.google.com/s2/favicons?domain={domain}&sz=128'
        return fallback


@clients_bp.route('/api/fetch-logo', methods=['POST'])
def fetch_logo():
    """Fetch a company logo from a website URL."""
    data = request.json or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'URL required'}), 400

    logo_url = _fetch_logo_from_url(url)
    if logo_url:
        return jsonify({'success': True, 'logo_url': logo_url})
    return jsonify({'error': 'Could not fetch logo'}), 400


@clients_bp.route('/api/clients/bulk-fetch-logos', methods=['POST'])
def bulk_fetch_logos():
    """Fetch logos for all clients that have a website set."""
    db = get_db()
    clients = dicts_from_rows(db.execute(
        "SELECT id, name, website, logo_url FROM clients WHERE website IS NOT NULL AND website != ''"
    ).fetchall())

    results = []
    for client in clients:
        try:
            logo_url = _fetch_logo_from_url(client['website'])
            if logo_url:
                db.execute("UPDATE clients SET logo_url=? WHERE id=?", (logo_url, client['id']))
                db.commit()
                results.append({'id': client['id'], 'name': client['name'], 'logo_url': logo_url, 'status': 'ok'})
            else:
                results.append({'id': client['id'], 'name': client['name'], 'status': 'no_logo'})
        except Exception as e:
            results.append({'id': client['id'], 'name': client['name'], 'status': 'error', 'error': str(e)})

    db.close()
    return jsonify({'success': True, 'results': results})
