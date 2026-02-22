import json
from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

briefs_bp = Blueprint('briefs', __name__)


@briefs_bp.route('/api/briefs', methods=['GET'])
def list_briefs():
    db = get_db()
    client_id = request.args.get('client_id')
    status = request.args.get('status')

    query = """
        SELECT cb.*,
               c.name as client_name,
               u_writer.username as assigned_writer_name,
               u_designer.username as assigned_designer_name,
               u_created.username as created_by_name
        FROM content_briefs cb
        LEFT JOIN clients c ON cb.client_id = c.id
        LEFT JOIN users u_writer ON cb.assigned_writer_id = u_writer.id
        LEFT JOIN users u_designer ON cb.assigned_designer_id = u_designer.id
        LEFT JOIN users u_created ON cb.created_by_id = u_created.id
        WHERE 1=1
    """
    params = []

    if client_id:
        query += " AND cb.client_id=?"
        params.append(client_id)
    if status:
        query += " AND cb.status=?"
        params.append(status)

    query += " ORDER BY cb.created_at DESC"

    briefs = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()

    for brief in briefs:
        for field in ('reference_urls', 'reference_files'):
            try:
                brief[field] = json.loads(brief[field]) if brief.get(field) else []
            except (json.JSONDecodeError, TypeError):
                brief[field] = []

    return jsonify(briefs)


@briefs_bp.route('/api/briefs/<int:brief_id>', methods=['GET'])
def get_brief(brief_id):
    db = get_db()
    brief = dict_from_row(db.execute("""
        SELECT cb.*,
               c.name as client_name,
               u_writer.username as assigned_writer_name,
               u_designer.username as assigned_designer_name,
               u_created.username as created_by_name
        FROM content_briefs cb
        LEFT JOIN clients c ON cb.client_id = c.id
        LEFT JOIN users u_writer ON cb.assigned_writer_id = u_writer.id
        LEFT JOIN users u_designer ON cb.assigned_designer_id = u_designer.id
        LEFT JOIN users u_created ON cb.created_by_id = u_created.id
        WHERE cb.id=?
    """, (brief_id,)).fetchone())

    if not brief:
        db.close()
        return jsonify({'error': 'Brief not found'}), 404

    for field in ('reference_urls', 'reference_files'):
        try:
            brief[field] = json.loads(brief[field]) if brief.get(field) else []
        except (json.JSONDecodeError, TypeError):
            brief[field] = []

    # Get linked posts
    linked_posts = dicts_from_rows(db.execute("""
        SELECT sp.id, sp.topic, sp.workflow_status, sp.platforms, sp.scheduled_at,
               c.name as client_name
        FROM brief_posts bp
        JOIN scheduled_posts sp ON bp.post_id = sp.id
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE bp.brief_id=?
        ORDER BY sp.created_at DESC
    """, (brief_id,)).fetchall())

    db.close()
    brief['linked_posts'] = linked_posts
    return jsonify(brief)


@briefs_bp.route('/api/briefs', methods=['POST'])
def create_brief():
    data = request.json or {}
    title = data.get('title', '').strip()
    client_id = data.get('client_id')

    if not title:
        return jsonify({'error': 'Title required'}), 400
    if not client_id:
        return jsonify({'error': 'Client required'}), 400

    db = get_db()
    cursor = db.execute(
        """INSERT INTO content_briefs
           (client_id, title, description, content_type, platform, target_date,
            reference_urls, reference_files, brand_guidelines, status,
            created_by_id, assigned_writer_id, assigned_designer_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            client_id,
            title,
            data.get('description', ''),
            data.get('content_type', 'post'),
            data.get('platform', ''),
            data.get('target_date'),
            json.dumps(data.get('reference_urls', [])),
            json.dumps(data.get('reference_files', [])),
            data.get('brand_guidelines', ''),
            'new',
            data.get('created_by_id') or 1,
            data.get('assigned_writer_id'),
            data.get('assigned_designer_id'),
        )
    )
    db.commit()
    brief_id = cursor.lastrowid

    # Notify assigned writer
    if data.get('assigned_writer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (data['assigned_writer_id'], 'brief_assigned',
             'محتوى جديد', f'تم تعيينك لكتابة محتوى: {title}', 'brief', brief_id)
        )
        db.commit()

    # Notify assigned designer
    if data.get('assigned_designer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (data['assigned_designer_id'], 'brief_assigned',
             'تصميم جديد', f'تم تعيينك لتصميم: {title}', 'brief', brief_id)
        )
        db.commit()

    db.close()
    return jsonify({'success': True, 'id': brief_id})


@briefs_bp.route('/api/briefs/<int:brief_id>', methods=['PUT'])
def update_brief(brief_id):
    data = request.json or {}
    db = get_db()

    brief = dict_from_row(db.execute("SELECT * FROM content_briefs WHERE id=?", (brief_id,)).fetchone())
    if not brief:
        db.close()
        return jsonify({'error': 'Brief not found'}), 404

    fields = []
    params = []
    updatable = ['title', 'description', 'content_type', 'platform', 'target_date',
                 'brand_guidelines', 'status', 'assigned_writer_id', 'assigned_designer_id']

    for field in updatable:
        if field in data:
            fields.append(f"{field}=?")
            params.append(data[field])

    if 'reference_urls' in data:
        fields.append("reference_urls=?")
        params.append(json.dumps(data['reference_urls']))
    if 'reference_files' in data:
        fields.append("reference_files=?")
        params.append(json.dumps(data['reference_files']))

    if fields:
        fields.append("updated_at=datetime('now')")
        params.append(brief_id)
        db.execute(f"UPDATE content_briefs SET {', '.join(fields)} WHERE id=?", params)
        db.commit()

    db.close()
    return jsonify({'success': True})


@briefs_bp.route('/api/briefs/<int:brief_id>', methods=['DELETE'])
def delete_brief(brief_id):
    db = get_db()
    db.execute("DELETE FROM brief_posts WHERE brief_id=?", (brief_id,))
    db.execute("DELETE FROM content_briefs WHERE id=?", (brief_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@briefs_bp.route('/api/briefs/<int:brief_id>/create-posts', methods=['POST'])
def create_posts_from_brief(brief_id):
    """Create one or more posts pre-filled from a content brief."""
    db = get_db()
    brief = dict_from_row(db.execute("SELECT * FROM content_briefs WHERE id=?", (brief_id,)).fetchone())
    if not brief:
        db.close()
        return jsonify({'error': 'Brief not found'}), 404

    data = request.json or {}
    platforms = data.get('platforms', [brief.get('platform', '')])
    created_by_id = data.get('created_by_id') or brief.get('created_by_id') or 1

    created_ids = []
    for platform in platforms:
        if not platform:
            continue
        cursor = db.execute(
            """INSERT INTO scheduled_posts
               (client_id, topic, caption, platforms, workflow_status, priority,
                assigned_designer_id, assigned_sm_id, created_by_id,
                design_reference_urls, brief_notes, tov)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                brief['client_id'],
                brief['title'],
                brief.get('description', ''),
                platform,
                'draft',
                'normal',
                brief.get('assigned_designer_id'),
                None,
                created_by_id,
                brief.get('reference_files', ''),
                brief.get('brand_guidelines', ''),
                '',
            )
        )
        post_id = cursor.lastrowid
        created_ids.append(post_id)

        # Link post to brief
        db.execute(
            "INSERT INTO brief_posts (brief_id, post_id) VALUES (?,?)",
            (brief_id, post_id)
        )

    # Update brief status
    db.execute(
        "UPDATE content_briefs SET status='in_progress', updated_at=datetime('now') WHERE id=?",
        (brief_id,)
    )
    db.commit()
    db.close()

    return jsonify({'success': True, 'post_ids': created_ids})
