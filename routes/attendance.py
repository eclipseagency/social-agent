import csv
import io
import random
from flask import Blueprint, request, jsonify, session, make_response
from datetime import datetime, timezone, timedelta
from routes.auth import require_login, require_role
from models import get_db

attendance_bp = Blueprint('attendance', __name__)

CAIRO_TZ = timezone(timedelta(hours=2))

# Check-in window configuration (Cairo time, 24h format)
CHECKIN_START = 9    # Window opens at 9:00 AM Cairo
CHECKIN_END = 10     # Window closes at 10:00 AM Cairo — after that = absent


def _cairo_now():
    return datetime.now(CAIRO_TZ)


@attendance_bp.route('/api/attendance/check-in', methods=['POST'])
@require_login
def check_in():
    # Block mobile devices — only desktop/laptop allowed
    ua = (request.headers.get('User-Agent') or '').lower()
    mobile_keywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'opera mini', 'opera mobi', 'webos']
    if any(kw in ua for kw in mobile_keywords):
        return jsonify({'success': False, 'error': 'Check-in is only allowed from a laptop or desktop'}), 403

    now = _cairo_now()

    # Block weekends (Friday=4, Saturday=5)
    if now.weekday() in (4, 5):
        return jsonify({'success': False, 'error': 'No check-in on weekends'}), 400
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

    # Generate 2-3 random verification pings spread across the 6-hour shift
    _generate_pings(db, user_id, today, hour, minute)
    db.close()

    return jsonify({
        'success': True,
        'status': status,
        'check_in_time': current_time
    })


def _generate_pings(db, user_id, date, checkin_hour, checkin_minute):
    """Generate 2-3 random ping times, 45+ min apart, not in first 30 min of shift."""
    shift_start_min = checkin_hour * 60 + checkin_minute  # minutes since midnight
    shift_end_min = shift_start_min + 360  # 6 hours later
    earliest = shift_start_min + 30  # skip first 30 min
    latest = shift_end_min - 10  # leave 10 min buffer at end

    if latest - earliest < 90:
        # Shift too short for multiple pings
        return

    num_pings = random.randint(2, 3)
    ping_minutes = []
    for _ in range(num_pings * 20):  # max attempts
        if len(ping_minutes) >= num_pings:
            break
        candidate = random.randint(earliest, latest)
        # Ensure 45+ min apart from all existing pings
        if all(abs(candidate - p) >= 45 for p in ping_minutes):
            ping_minutes.append(candidate)

    for m in sorted(ping_minutes):
        h, mi = divmod(m, 60)
        ping_time = f"{h:02d}:{mi:02d}"
        db.execute(
            "INSERT INTO verification_pings (user_id, date, ping_time) VALUES (?, ?, ?)",
            (user_id, date, ping_time)
        )
    db.commit()


@attendance_bp.route('/api/attendance/my-pings')
@require_login
def my_pings():
    """Return today's verification pings for the current user."""
    today = _cairo_now().strftime('%Y-%m-%d')
    user_id = session['user_id']
    db = get_db()
    rows = db.execute(
        "SELECT id, ping_time, responded, responded_at FROM verification_pings WHERE user_id=? AND date=? ORDER BY ping_time",
        (user_id, today)
    ).fetchall()
    db.close()
    return jsonify([{
        'id': r['id'],
        'ping_time': r['ping_time'],
        'responded': r['responded'],
        'responded_at': r['responded_at']
    } for r in rows])


@attendance_bp.route('/api/attendance/ping-response', methods=['POST'])
@require_login
def ping_response():
    """Mark a ping as responded."""
    data = request.get_json() or {}
    ping_id = data.get('ping_id')
    if not ping_id:
        return jsonify({'success': False, 'error': 'ping_id required'}), 400

    now = _cairo_now().strftime('%Y-%m-%d %H:%M:%S')
    user_id = session['user_id']
    db = get_db()
    db.execute(
        "UPDATE verification_pings SET responded=1, responded_at=? WHERE id=? AND user_id=?",
        (now, ping_id, user_id)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@attendance_bp.route('/api/attendance/ping-missed', methods=['POST'])
@require_login
def ping_missed():
    """Mark a ping as missed (responded = -1)."""
    data = request.get_json() or {}
    ping_id = data.get('ping_id')
    if not ping_id:
        return jsonify({'success': False, 'error': 'ping_id required'}), 400

    user_id = session['user_id']
    db = get_db()
    db.execute(
        "UPDATE verification_pings SET responded=-1 WHERE id=? AND user_id=?",
        (ping_id, user_id)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@attendance_bp.route('/api/attendance/check-out', methods=['POST'])
@require_login
def check_out():
    """Manual check-out — requires a work summary."""
    now = _cairo_now()

    if now.weekday() in (4, 5):
        return jsonify({'success': False, 'error': 'No check-out on weekends'}), 400

    data = request.get_json() or {}
    summary = (data.get('summary') or '').strip()
    if not summary or len(summary) < 10:
        return jsonify({'success': False, 'error': 'Please write what you accomplished today (at least 10 characters)'}), 400

    today = now.strftime('%Y-%m-%d')
    current_time = now.strftime('%H:%M')
    user_id = session['user_id']

    db = get_db()
    row = db.execute(
        "SELECT id, check_in_time, check_out_time FROM attendance WHERE user_id=? AND date=?",
        (user_id, today)
    ).fetchone()
    if not row:
        db.close()
        return jsonify({'success': False, 'error': 'You haven\'t checked in today'}), 400
    if row['check_out_time']:
        db.close()
        return jsonify({'success': False, 'error': 'Already checked out'}), 409

    db.execute(
        "UPDATE attendance SET check_out_time=?, work_summary=? WHERE id=?",
        (current_time, summary, row['id'])
    )
    db.commit()

    # Calculate hours worked
    ci_h, ci_m = map(int, row['check_in_time'].split(':'))
    co_h, co_m = now.hour, now.minute
    worked_min = (co_h * 60 + co_m) - (ci_h * 60 + ci_m)
    hours = worked_min // 60
    mins = worked_min % 60

    db.close()
    return jsonify({
        'success': True,
        'check_out_time': current_time,
        'hours_worked': f'{hours}h {mins}m'
    })


@attendance_bp.route('/api/attendance/my-status')
@require_login
def my_status():
    now = _cairo_now()
    today = now.strftime('%Y-%m-%d')
    user_id = session['user_id']

    # Weekend — no check-in needed
    is_weekend = now.weekday() in (4, 5)

    db = get_db()
    row = db.execute(
        "SELECT status, check_in_time, check_out_time FROM attendance WHERE user_id=? AND date=?",
        (user_id, today)
    ).fetchone()
    db.close()

    resp = {
        'checked_in': False,
        'checked_out': False,
        'is_weekend': is_weekend,
        'window': {
            'start': CHECKIN_START,
            'end': CHECKIN_END
        }
    }
    if row:
        resp['checked_in'] = True
        resp['status'] = row['status']
        resp['check_in_time'] = row['check_in_time']
        if row['check_out_time']:
            resp['checked_out'] = True
            resp['check_out_time'] = row['check_out_time']
    return jsonify(resp)


@attendance_bp.route('/api/attendance/report')
@require_role('admin', 'manager')
def daily_report():
    date = request.args.get('date', _cairo_now().strftime('%Y-%m-%d'))

    db = get_db()
    rows = db.execute("""
        SELECT u.id as user_id, u.username, u.role, u.job_title,
               a.status, a.check_in_time, a.check_out_time, a.work_summary
        FROM users u
        LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
        WHERE u.is_active = 1
        ORDER BY u.username
    """, (date,)).fetchall()

    # Missed pings per user
    ping_rows = db.execute("""
        SELECT user_id, COUNT(*) as missed
        FROM verification_pings
        WHERE date=? AND responded=-1
        GROUP BY user_id
    """, (date,)).fetchall()
    missed_map = {r['user_id']: r['missed'] for r in ping_rows}

    # Total pings per user
    total_ping_rows = db.execute("""
        SELECT user_id, COUNT(*) as total
        FROM verification_pings
        WHERE date=?
        GROUP BY user_id
    """, (date,)).fetchall()
    total_pings_map = {r['user_id']: r['total'] for r in total_ping_rows}

    # Last activity per user
    activity_rows = db.execute("""
        SELECT user_id, MAX(created_at) as last_active, COUNT(*) as activity_count
        FROM user_activity
        WHERE date=?
        GROUP BY user_id
    """, (date,)).fetchall()
    activity_map = {r['user_id']: {'last_active': r['last_active'], 'count': r['activity_count']} for r in activity_rows}

    db.close()

    result = []
    for r in rows:
        uid = r['user_id']
        act = activity_map.get(uid, {})
        # Calculate hours worked if both check-in and check-out exist
        hours_worked = ''
        if r['check_in_time'] and r['check_out_time']:
            ci_h, ci_m = map(int, r['check_in_time'].split(':'))
            co_h, co_m = map(int, r['check_out_time'].split(':'))
            worked_min = (co_h * 60 + co_m) - (ci_h * 60 + ci_m)
            hours_worked = f"{worked_min // 60}h {worked_min % 60}m"
        result.append({
            'user_id': uid,
            'username': r['username'],
            'role': r['role'] or '',
            'job_title': r['job_title'] or '',
            'status': r['status'] or 'absent',
            'check_in_time': r['check_in_time'] or '',
            'check_out_time': r['check_out_time'] or '',
            'hours_worked': hours_worked,
            'missed_pings': missed_map.get(uid, 0),
            'total_pings': total_pings_map.get(uid, 0),
            'last_active': act.get('last_active', ''),
            'activity_count': act.get('count', 0),
            'work_summary': r['work_summary'] or ''
        })

    return jsonify(result)


@attendance_bp.route('/api/attendance/report/download')
@require_role('admin', 'manager')
def download_report():
    """Download attendance report as Excel-compatible CSV."""
    date = request.args.get('date', _cairo_now().strftime('%Y-%m-%d'))

    db = get_db()
    rows = db.execute("""
        SELECT u.id as user_id, u.username, u.role, u.job_title,
               a.status, a.check_in_time, a.check_out_time, a.work_summary
        FROM users u
        LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
        WHERE u.is_active = 1
        ORDER BY u.username
    """, (date,)).fetchall()

    ping_rows = db.execute("""
        SELECT user_id, COUNT(*) as missed
        FROM verification_pings WHERE date=? AND responded=-1
        GROUP BY user_id
    """, (date,)).fetchall()
    missed_map = {r['user_id']: r['missed'] for r in ping_rows}

    activity_rows = db.execute("""
        SELECT user_id, MAX(created_at) as last_active
        FROM user_activity WHERE date=?
        GROUP BY user_id
    """, (date,)).fetchall()
    activity_map = {r['user_id']: r['last_active'] for r in activity_rows}
    db.close()

    output = io.StringIO()
    output.write('\ufeff')  # BOM for Arabic in Excel
    writer = csv.writer(output)
    writer.writerow(['Name', 'Role', 'Status', 'Check In', 'Check Out', 'Hours Worked', 'Missed Pings', 'Last Active', 'Work Summary'])

    for r in rows:
        status = r['status'] or 'absent'
        hours_worked = ''
        if r['check_in_time'] and r['check_out_time']:
            ci_h, ci_m = map(int, r['check_in_time'].split(':'))
            co_h, co_m = map(int, r['check_out_time'].split(':'))
            worked_min = (co_h * 60 + co_m) - (ci_h * 60 + ci_m)
            hours_worked = f"{worked_min // 60}h {worked_min % 60}m"
        last_active = activity_map.get(r['user_id'], '')
        if last_active:
            last_active = last_active.split(' ')[1][:5] if ' ' in last_active else last_active[:5]
        writer.writerow([
            r['username'],
            r['job_title'] or r['role'] or '',
            status.replace('_', ' ').title(),
            r['check_in_time'] or '',
            r['check_out_time'] or '',
            hours_worked,
            missed_map.get(r['user_id'], 0),
            last_active,
            r['work_summary'] or ''
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    response.headers['Content-Disposition'] = f'attachment; filename=attendance_{date}.csv'
    return response


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
