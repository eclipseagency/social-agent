from flask import Blueprint, request, jsonify
from models import get_db, dicts_from_rows

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/api/notifications', methods=['GET'])
def list_notifications():
    user_id = request.args.get('user_id', 1)
    unread_only = request.args.get('unread_only', '').lower() == 'true'

    db = get_db()
    query = "SELECT * FROM notifications WHERE user_id=?"
    params = [user_id]

    if unread_only:
        query += " AND is_read=0"

    query += " ORDER BY created_at DESC LIMIT 50"
    notifs = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()
    return jsonify(notifs)


@notifications_bp.route('/api/notifications/count', methods=['GET'])
def notification_count():
    user_id = request.args.get('user_id', 1)
    db = get_db()
    count = db.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND is_read=0",
        (user_id,)
    ).fetchone()['c']
    db.close()
    return jsonify({'count': count})


@notifications_bp.route('/api/notifications/<int:notif_id>/read', methods=['PUT'])
def mark_read(notif_id):
    db = get_db()
    db.execute("UPDATE notifications SET is_read=1 WHERE id=?", (notif_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@notifications_bp.route('/api/notifications/read-all', methods=['PUT'])
def mark_all_read():
    user_id = request.args.get('user_id') or (request.json or {}).get('user_id', 1)
    db = get_db()
    db.execute("UPDATE notifications SET is_read=1 WHERE user_id=?", (user_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})
