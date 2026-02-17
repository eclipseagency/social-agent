import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

posting_rules_bp = Blueprint('posting_rules', __name__)


@posting_rules_bp.route('/api/clients/<int:client_id>/posting-rules', methods=['GET'])
def get_posting_rules(client_id):
    db = get_db()
    rules = dicts_from_rows(db.execute(
        "SELECT * FROM client_posting_rules WHERE client_id=? ORDER BY platform",
        (client_id,)
    ).fetchall())
    db.close()

    # Parse JSON fields
    for rule in rules:
        try:
            rule['posting_days'] = json.loads(rule['posting_days'])
        except (json.JSONDecodeError, TypeError):
            rule['posting_days'] = []
        try:
            rule['posting_hours'] = json.loads(rule['posting_hours'])
        except (json.JSONDecodeError, TypeError):
            rule['posting_hours'] = []

    return jsonify(rules)


@posting_rules_bp.route('/api/clients/<int:client_id>/posting-rules', methods=['POST'])
def create_posting_rule(client_id):
    data = request.json or {}
    platform = data.get('platform', '').strip()
    posting_days = data.get('posting_days', [])
    posting_hours = data.get('posting_hours', [])
    posts_per_day = data.get('posts_per_day', 1)

    if not platform:
        return jsonify({'error': 'Platform required'}), 400
    if not posting_days:
        return jsonify({'error': 'Posting days required'}), 400
    if not posting_hours:
        return jsonify({'error': 'Posting hours required'}), 400

    db = get_db()
    cursor = db.execute(
        """INSERT INTO client_posting_rules (client_id, platform, posting_days, posting_hours, posts_per_day)
           VALUES (?,?,?,?,?)""",
        (client_id, platform, json.dumps(posting_days), json.dumps(posting_hours), posts_per_day)
    )
    db.commit()
    rule_id = cursor.lastrowid
    db.close()
    return jsonify({'success': True, 'id': rule_id})


@posting_rules_bp.route('/api/posting-rules/<int:rule_id>', methods=['PUT'])
def update_posting_rule(rule_id):
    data = request.json or {}
    db = get_db()

    fields = []
    params = []
    if 'posting_days' in data:
        fields.append("posting_days=?")
        params.append(json.dumps(data['posting_days']))
    if 'posting_hours' in data:
        fields.append("posting_hours=?")
        params.append(json.dumps(data['posting_hours']))
    if 'posts_per_day' in data:
        fields.append("posts_per_day=?")
        params.append(data['posts_per_day'])
    if 'is_active' in data:
        fields.append("is_active=?")
        params.append(data['is_active'])

    if fields:
        params.append(rule_id)
        db.execute(f"UPDATE client_posting_rules SET {', '.join(fields)} WHERE id=?", params)
        db.commit()

    db.close()
    return jsonify({'success': True})


@posting_rules_bp.route('/api/posting-rules/<int:rule_id>', methods=['DELETE'])
def delete_posting_rule(rule_id):
    db = get_db()
    db.execute("DELETE FROM client_posting_rules WHERE id=?", (rule_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@posting_rules_bp.route('/api/clients/<int:client_id>/suggest-schedule', methods=['GET'])
def suggest_schedule(client_id):
    """Auto-suggest next available scheduling slots based on posting rules."""
    count = int(request.args.get('count', 10))
    db = get_db()

    # Get active rules
    rules = dicts_from_rows(db.execute(
        "SELECT * FROM client_posting_rules WHERE client_id=? AND is_active=1",
        (client_id,)
    ).fetchall())

    # Get already scheduled posts for this client
    existing = dicts_from_rows(db.execute(
        "SELECT scheduled_at, platforms FROM scheduled_posts WHERE client_id=? AND status='pending'",
        (client_id,)
    ).fetchall())

    db.close()

    existing_slots = set()
    for post in existing:
        if post.get('scheduled_at'):
            existing_slots.add(post['scheduled_at'][:16])  # YYYY-MM-DDTHH:MM

    day_map = {
        'sun': 6, 'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5
    }

    suggestions = []
    today = datetime.now()

    for day_offset in range(60):  # Look ahead 60 days
        check_date = today + timedelta(days=day_offset)
        weekday = check_date.weekday()

        for rule in rules:
            try:
                posting_days = json.loads(rule['posting_days']) if isinstance(rule['posting_days'], str) else rule['posting_days']
                posting_hours = json.loads(rule['posting_hours']) if isinstance(rule['posting_hours'], str) else rule['posting_hours']
            except (json.JSONDecodeError, TypeError):
                continue

            for day_code in posting_days:
                if day_map.get(day_code) == weekday:
                    for hour_str in posting_hours:
                        slot_dt = check_date.replace(
                            hour=int(hour_str.split(':')[0]),
                            minute=int(hour_str.split(':')[1]) if ':' in hour_str else 0,
                            second=0, microsecond=0
                        )
                        if slot_dt <= today:
                            continue

                        slot_key = slot_dt.strftime('%Y-%m-%dT%H:%M')
                        if slot_key not in existing_slots:
                            day_names = {
                                'sun': 'الأحد', 'mon': 'الاثنين', 'tue': 'الثلاثاء',
                                'wed': 'الأربعاء', 'thu': 'الخميس', 'fri': 'الجمعة', 'sat': 'السبت'
                            }
                            suggestions.append({
                                'date': slot_dt.strftime('%Y-%m-%d'),
                                'day': day_code,
                                'day_name': day_names.get(day_code, day_code),
                                'time': hour_str,
                                'datetime': slot_key,
                                'platform': rule['platform']
                            })
                            if len(suggestions) >= count:
                                return jsonify({'suggested_slots': suggestions})

    return jsonify({'suggested_slots': suggestions})
