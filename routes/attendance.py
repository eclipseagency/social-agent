from flask import Blueprint, request, jsonify, session
from datetime import datetime, timezone, timedelta
from routes.auth import require_login, require_role
from models import get_db

attendance_bp = Blueprint('attendance', __name__)

CAIRO_TZ = timezone(timedelta(hours=2))

# Check-in window configuration (Cairo time, 24h format)
CHECKIN_START = 13   # TEMP FOR TESTING — revert to 9
CHECKIN_END = 14     # TEMP FOR TESTING — revert to 10


def _cairo_now():
    return datetime.now(CAIRO_TZ)


@attendance_bp.route('/api/attendance/check-in', methods=['POST'])
@require_login
def check_in():
    now = _cairo_now()
    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    hour, minute = now.hour, now.minute

    # Check window
    if hour < CHECKIN_START:
        return jsonify({'success': False, 'error': f'Check-in opens at {CHECKIN_START}:00 AM'}), 400
    if hour >= CHECKIN_END:
        return jsonify({'success': False, 'error': 'Check-in window closed for today'}), 400

    # Entire window is on-time (9:00-10:00)
    status = 'on_time'

    user_id = session['user_id']
    db = get_db()
    try:
        db.execute(
            "INSERT INTO attendance (user_id, date, check_in_time, status) VALUES (?, ?, ?, ?)",
            (user_id, today, current_time, status)
        )
        db.commit()
    except Exception:
        db.close()
        return jsonify({'success': False, 'error': 'Already checked in today'}), 409
    db.close()

    return jsonify({
        'success': True,
        'status': status,
        'check_in_time': current_time
    })


@attendance_bp.route('/api/attendance/my-status')
@require_login
def my_status():
    now = _cairo_now()
    today = now.strftime('%Y-%m-%d')
    user_id = session['user_id']

    db = get_db()
    row = db.execute(
        "SELECT status, check_in_time FROM attendance WHERE user_id=? AND date=?",
        (user_id, today)
    ).fetchone()
    db.close()

    resp = {
        'checked_in': False,
        'window': {
            'start': CHECKIN_START,
            'end': CHECKIN_END
        }
    }
    if row:
        resp['checked_in'] = True
        resp['status'] = row['status']
        resp['check_in_time'] = row['check_in_time']
    return jsonify(resp)


@attendance_bp.route('/api/attendance/report')
@require_role('admin', 'manager')
def daily_report():
    date = request.args.get('date', _cairo_now().strftime('%Y-%m-%d'))

    db = get_db()
    rows = db.execute("""
        SELECT u.id as user_id, u.username, u.role, u.job_title,
               a.status, a.check_in_time
        FROM users u
        LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
        WHERE u.is_active = 1
        ORDER BY u.username
    """, (date,)).fetchall()
    db.close()

    result = []
    for r in rows:
        result.append({
            'user_id': r['user_id'],
            'username': r['username'],
            'role': r['role'] or '',
            'job_title': r['job_title'] or '',
            'status': r['status'] or 'absent',
            'check_in_time': r['check_in_time'] or ''
        })

    return jsonify(result)


@attendance_bp.route('/api/attendance/weekly')
@require_role('admin', 'manager')
def weekly_report():
    start = request.args.get('start')
    if not start:
        now = _cairo_now()
        # Monday of current week
        weekday = now.weekday()
        monday = now - timedelta(days=weekday)
        start = monday.strftime('%Y-%m-%d')

    start_date = datetime.strptime(start, '%Y-%m-%d')
    dates = [(start_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]

    db = get_db()
    users = db.execute(
        "SELECT id, username, role, job_title FROM users WHERE is_active = 1 ORDER BY username"
    ).fetchall()

    records = db.execute(
        "SELECT user_id, date, status FROM attendance WHERE date >= ? AND date <= ?",
        (dates[0], dates[6])
    ).fetchall()
    db.close()

    # Build lookup
    lookup = {}
    for r in records:
        lookup[(r['user_id'], r['date'])] = r['status']

    grid = {}
    user_list = []
    for u in users:
        uid = u['id']
        user_list.append({
            'user_id': uid,
            'username': u['username'],
            'role': u['role'] or '',
            'job_title': u['job_title'] or ''
        })
        grid[uid] = {}
        for d in dates:
            dt = datetime.strptime(d, '%Y-%m-%d')
            if dt.weekday() in (4, 5):  # Friday & Saturday off
                grid[uid][d] = 'weekend'
            else:
                grid[uid][d] = lookup.get((uid, d), 'absent')

    return jsonify({
        'users': user_list,
        'dates': dates,
        'grid': grid
    })


@attendance_bp.route('/api/attendance/monthly')
@require_role('admin', 'manager')
def monthly_report():
    month = request.args.get('month')  # YYYY-MM
    if not month:
        month = _cairo_now().strftime('%Y-%m')

    db = get_db()
    users = db.execute(
        "SELECT id, username, role, job_title FROM users WHERE is_active = 1 ORDER BY username"
    ).fetchall()

    records = db.execute(
        "SELECT user_id, date, status, check_in_time FROM attendance WHERE date LIKE ?",
        (month + '%',)
    ).fetchall()
    db.close()

    # Build per-user stats
    user_map = {}
    for r in records:
        uid = r['user_id']
        if uid not in user_map:
            user_map[uid] = {'on_time': 0, 'late': 0, 'days_present': 0, 'dates': {}}
        user_map[uid][r['status']] = user_map[uid].get(r['status'], 0) + 1
        user_map[uid]['days_present'] += 1
        user_map[uid]['dates'][r['date']] = {
            'status': r['status'],
            'check_in_time': r['check_in_time']
        }

    # Count working days in month (Mon-Fri)
    import calendar
    year, mon = int(month[:4]), int(month[5:7])
    total_days = calendar.monthrange(year, mon)[1]
    working_days = 0
    for d in range(1, total_days + 1):
        dt = datetime(year, mon, d)
        if dt.weekday() not in (4, 5):  # Friday & Saturday off
            working_days += 1

    result = []
    for u in users:
        uid = u['id']
        stats = user_map.get(uid, {'on_time': 0, 'late': 0, 'days_present': 0, 'dates': {}})
        absent_days = working_days - stats['days_present']
        total_hours = stats['days_present'] * 6
        result.append({
            'user_id': uid,
            'username': u['username'],
            'role': u['role'] or '',
            'job_title': u['job_title'] or '',
            'on_time': stats.get('on_time', 0),
            'late': stats.get('late', 0),
            'absent': max(0, absent_days),
            'days_present': stats['days_present'],
            'total_hours': total_hours,
            'working_days': working_days
        })

    return jsonify(result)
