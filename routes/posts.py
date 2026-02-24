from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session
from models import get_db, dict_from_row, dicts_from_rows
from services.scheduler import publish_post, run_scheduler, force_publish_all
from services.cloudinary_service import upload_image
from routes.auth import require_role, require_login

posts_bp = Blueprint('posts', __name__)

VALID_WORKFLOW_STATUSES = ['draft', 'in_design', 'design_review', 'approved', 'scheduled', 'posted']

# Valid workflow transitions: from_status -> list of allowed to_statuses
VALID_TRANSITIONS = {
    'draft': ['in_design'],
    'in_design': ['design_review', 'draft'],
    'design_review': ['approved', 'in_design', 'draft'],
    'approved': ['scheduled'],
    'scheduled': ['posted', 'approved'],
}


@posts_bp.route('/api/all-posts', methods=['GET'])
def all_posts():
    db = get_db()
    status = request.args.get('status')
    platform = request.args.get('platform')
    client_id = request.args.get('client_id')

    query = """
        SELECT sp.*, c.name as client_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE 1=1
    """
    params = []

    if status:
        query += " AND sp.status=?"
        params.append(status)
    if platform:
        query += " AND sp.platforms LIKE ?"
        params.append(f'%{platform}%')
    if client_id:
        query += " AND sp.client_id=?"
        params.append(client_id)

    query += " ORDER BY sp.scheduled_at DESC, sp.created_at DESC"

    posts = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()
    return jsonify(posts)


# ============ SINGLE POST DETAIL ============

@posts_bp.route('/api/posts/<int:post_id>', methods=['GET'])
def get_post(post_id):
    db = get_db()
    post = dict_from_row(db.execute("""
        SELECT sp.*,
               c.name as client_name,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_motion.username as assigned_motion_name,
               u_created.username as created_by_name,
               u_writer.username as assigned_writer_name,
               u_manager.username as assigned_manager_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        LEFT JOIN users u_designer ON sp.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON sp.assigned_sm_id = u_sm.id
        LEFT JOIN users u_motion ON sp.assigned_motion_id = u_motion.id
        LEFT JOIN users u_created ON sp.created_by_id = u_created.id
        LEFT JOIN users u_writer ON sp.assigned_writer_id = u_writer.id
        LEFT JOIN users u_manager ON sp.assigned_manager_id = u_manager.id
        WHERE sp.id=?
    """, (post_id,)).fetchone())

    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    db.close()
    return jsonify(post)


# ============ UPDATE POST ============

@posts_bp.route('/api/posts/<int:post_id>', methods=['PUT'])
@require_login
def update_post(post_id):
    data = request.json or {}
    db = get_db()

    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    updatable = [
        'topic', 'caption', 'tov', 'brief_notes', 'priority',
        'assigned_designer_id', 'assigned_motion_id', 'assigned_sm_id',
        'assigned_writer_id', 'assigned_manager_id', 'design_reference_urls',
        'design_output_urls', 'platforms', 'scheduled_at', 'image_url',
        'image_size', 'post_type'
    ]

    # Role-based field restrictions
    user_role = session.get('user_role', '')
    if user_role in ('designer', 'motion_editor'):
        # Designers can only update design output
        updatable = ['design_output_urls']
    elif user_role == 'copywriter':
        # Copywriters can only update caption
        updatable = ['caption']
    elif user_role == 'sm_specialist':
        # Moderators cannot edit post fields (read-only)
        updatable = []
    fields = []
    params = []
    for field in updatable:
        if field in data:
            fields.append(f"{field}=?")
            params.append(data[field])

    if fields:
        fields.append("updated_at=datetime('now')")
        params.append(post_id)
        db.execute(f"UPDATE scheduled_posts SET {', '.join(fields)} WHERE id=?", params)
        db.commit()

    db.close()
    return jsonify({'success': True})


# ============ WORKFLOW STATUS ============

@posts_bp.route('/api/posts/<int:post_id>/workflow', methods=['PUT'])
@require_login
def change_workflow(post_id):
    data = request.json or {}
    new_status = data.get('status', '')
    user_id = data.get('user_id', 1)
    comment = data.get('comment', '')

    if new_status not in VALID_WORKFLOW_STATUSES:
        return jsonify({'error': f'Invalid status. Must be one of: {VALID_WORKFLOW_STATUSES}'}), 400

    db = get_db()
    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    old_status = post.get('workflow_status', 'draft') or 'draft'

    # Update workflow_status
    db.execute(
        "UPDATE scheduled_posts SET workflow_status=?, updated_at=datetime('now') WHERE id=?",
        (new_status, post_id)
    )

    # Log to workflow_history
    db.execute(
        """INSERT INTO workflow_history (post_id, user_id, from_status, to_status, comment)
           VALUES (?,?,?,?,?)""",
        (post_id, user_id, old_status, new_status, comment)
    )

    topic = post.get('topic', 'Untitled')

    # Notify designer when moving to in_design
    if new_status == 'in_design' and post.get('assigned_designer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_designer_id'], 'design_assigned',
             'New Design Task', f'You have a new design to work on: {topic}',
             'post', post_id)
        )

    # Notify manager when moving to design_review
    if new_status == 'design_review' and post.get('assigned_manager_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_manager_id'], 'design_review_ready',
             'Design Ready for Review', f'Design submitted for your review: {topic}',
             'post', post_id)
        )

    # Notify SM specialist when moving to approved
    if new_status == 'approved' and post.get('assigned_sm_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_sm_id'], 'post_approved',
             'Post Approved - Ready to Schedule', f'Post approved and ready to schedule: {topic}',
             'post', post_id)
        )

    # Notify post creator when moving to scheduled
    if new_status == 'scheduled' and post.get('created_by_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['created_by_id'], 'post_scheduled',
             'Post Scheduled', f'Your post has been scheduled: {topic}',
             'post', post_id)
        )

    db.commit()
    db.close()
    return jsonify({'success': True})


# ============ UPLOAD DESIGN ============

@posts_bp.route('/api/posts/<int:post_id>/upload-design', methods=['POST'])
@require_role('designer', 'motion_editor')
def upload_design(post_id):
    db = get_db()
    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    files = request.files.getlist('images')
    if not files or (len(files) == 1 and files[0].filename == ''):
        db.close()
        return jsonify({'error': 'No images provided'}), 400

    # Upload files
    urls = []
    errors = []
    for f in files:
        try:
            result = upload_image(f, folder='social_agent/designs')
            urls.append(result['url'])
        except Exception as e:
            errors.append({'filename': f.filename, 'error': str(e)})

    if not urls and errors:
        db.close()
        error_detail = '; '.join([f"{e['filename']}: {e['error']}" for e in errors])
        return jsonify({'success': False, 'error': f'Upload failed: {error_detail}', 'urls': [], 'errors': errors}), 500

    if urls:
        # Append to existing design_output_urls
        existing = post.get('design_output_urls', '') or ''
        existing_list = [u.strip() for u in existing.split(',') if u.strip()] if existing else []
        all_urls = existing_list + urls
        design_output_str = ','.join(all_urls)

        db.execute(
            "UPDATE scheduled_posts SET design_output_urls=?, updated_at=datetime('now') WHERE id=?",
            (design_output_str, post_id)
        )

        # Auto-advance to design_review if currently in_design
        current_workflow = post.get('workflow_status', '') or ''
        if current_workflow == 'in_design':
            user_id = request.form.get('user_id', 1)
            db.execute(
                "UPDATE scheduled_posts SET workflow_status='design_review', updated_at=datetime('now') WHERE id=?",
                (post_id,)
            )
            db.execute(
                """INSERT INTO workflow_history (post_id, user_id, from_status, to_status, comment)
                   VALUES (?,?,?,?,?)""",
                (post_id, user_id, 'in_design', 'design_review', 'Design uploaded')
            )
            # Notify manager when design is ready for review
            if post.get('assigned_manager_id'):
                db.execute(
                    """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
                       VALUES (?,?,?,?,?,?)""",
                    (post['assigned_manager_id'], 'design_review_ready',
                     'Design Ready for Review', f'Design submitted for your review: {post.get("topic", "Untitled")}',
                     'post', post_id)
                )

        db.commit()

    db.close()
    return jsonify({'success': True, 'urls': urls, 'errors': errors})


@posts_bp.route('/api/posts/<int:post_id>/upload-reference', methods=['POST'])
@require_role('manager', 'sm_specialist', 'copywriter')
def upload_reference(post_id):
    """Upload design reference images for a post."""
    db = get_db()
    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    files = request.files.getlist('images')
    if not files or (len(files) == 1 and files[0].filename == ''):
        db.close()
        return jsonify({'error': 'No images provided'}), 400

    urls = []
    errors = []
    for f in files:
        try:
            result = upload_image(f, folder='social_agent/references')
            urls.append(result['url'])
        except Exception as e:
            errors.append({'filename': f.filename, 'error': str(e)})

    if urls:
        existing = post.get('design_reference_urls', '') or ''
        existing_list = [u.strip() for u in existing.split(',') if u.strip()] if existing else []
        all_urls = existing_list + urls
        ref_str = ','.join(all_urls)

        db.execute(
            "UPDATE scheduled_posts SET design_reference_urls=?, updated_at=datetime('now') WHERE id=?",
            (ref_str, post_id)
        )
        db.commit()

    db.close()

    if not urls and errors:
        error_detail = '; '.join([f"{e['filename']}: {e['error']}" for e in errors])
        return jsonify({'success': False, 'error': f'Upload failed: {error_detail}', 'urls': [], 'errors': errors}), 500

    return jsonify({'success': True, 'urls': urls, 'errors': errors})


# ============ PIPELINE BOARD ============

@posts_bp.route('/api/pipeline', methods=['GET'])
def pipeline():
    db = get_db()
    client_id = request.args.get('client_id')
    assigned_to = request.args.get('assigned_to')

    query = """
        SELECT sp.*,
               c.name as client_name,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_writer.username as assigned_writer_name,
               u_created.username as created_by_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        LEFT JOIN users u_designer ON sp.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON sp.assigned_sm_id = u_sm.id
        LEFT JOIN users u_writer ON sp.assigned_writer_id = u_writer.id
        LEFT JOIN users u_created ON sp.created_by_id = u_created.id
        WHERE sp.workflow_status IS NOT NULL AND sp.workflow_status != ''
    """
    params = []

    if client_id:
        query += " AND sp.client_id=?"
        params.append(client_id)
    if assigned_to:
        query += " AND (sp.assigned_designer_id=? OR sp.assigned_sm_id=? OR sp.assigned_motion_id=? OR sp.assigned_writer_id=? OR sp.created_by_id=?)"
        params.extend([assigned_to, assigned_to, assigned_to, assigned_to, assigned_to])

    query += " ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, sp.created_at DESC"

    posts = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()

    board = {
        'draft': [],
        'in_design': [],
        'design_review': [],
        'approved': [],
        'scheduled': []
    }
    for post in posts:
        s = post.get('workflow_status', 'draft') or 'draft'
        if s == 'needs_caption':
            s = 'draft'  # Migrate old needs_caption posts to draft
        if s in board:
            board[s].append(post)
        elif s == 'posted':
            pass  # Skip posted
        else:
            board['draft'].append(post)

    return jsonify(board)


# ============ POST COMMENTS ============

@posts_bp.route('/api/posts/<int:post_id>/comments', methods=['GET'])
def get_post_comments(post_id):
    db = get_db()
    comments = dicts_from_rows(db.execute("""
        SELECT pc.*, u.username as user_name
        FROM post_comments pc
        LEFT JOIN users u ON pc.user_id = u.id
        WHERE pc.post_id=?
        ORDER BY pc.created_at ASC
    """, (post_id,)).fetchall())
    db.close()
    return jsonify(comments)


@posts_bp.route('/api/posts/<int:post_id>/comments', methods=['POST'])
def add_post_comment(post_id):
    data = request.json or {}
    content = data.get('content', '').strip()
    user_id = data.get('user_id', 1)

    if not content:
        return jsonify({'error': 'Content required'}), 400

    db = get_db()
    db.execute(
        """INSERT INTO post_comments (post_id, user_id, content, comment_type, attachment_urls)
           VALUES (?,?,?,?,?)""",
        (post_id, user_id, content, data.get('comment_type', 'comment'), data.get('attachment_urls', ''))
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


# ============ CREATE POST (expanded with brief fields) ============

@posts_bp.route('/api/clients/<int:client_id>/posts', methods=['POST'])
@require_role('manager', 'sm_specialist', 'copywriter')
def create_post(client_id):
    data = request.json or {}
    db = get_db()

    # Auto-fill assignments from client if not provided in the request
    assigned_designer_id = data.get('assigned_designer_id') or None
    assigned_sm_id = data.get('assigned_sm_id') or None
    assigned_motion_id = data.get('assigned_motion_id') or None
    assigned_writer_id = data.get('assigned_writer_id') or None
    assigned_manager_id = data.get('assigned_manager_id') or None

    if not any([assigned_designer_id, assigned_sm_id, assigned_motion_id, assigned_writer_id, assigned_manager_id]):
        client = dict_from_row(db.execute(
            """SELECT assigned_writer_id, assigned_designer_id, assigned_sm_id,
                      assigned_motion_id, assigned_manager_id FROM clients WHERE id=?""",
            (client_id,)
        ).fetchone())
        if client:
            assigned_writer_id = client.get('assigned_writer_id') or None
            assigned_designer_id = client.get('assigned_designer_id') or None
            assigned_sm_id = client.get('assigned_sm_id') or None
            assigned_motion_id = client.get('assigned_motion_id') or None
            assigned_manager_id = client.get('assigned_manager_id') or None

    cursor = db.execute(
        """INSERT INTO scheduled_posts
           (client_id, topic, caption, image_url, platforms, scheduled_at, image_size, post_type,
            tov, brief_notes, design_reference_urls, assigned_designer_id, assigned_sm_id,
            assigned_motion_id, assigned_writer_id, assigned_manager_id, priority, workflow_status, created_by_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            client_id,
            data.get('topic', ''),
            data.get('caption', ''),
            data.get('image_url', ''),
            data.get('platforms', ''),
            data.get('scheduled_at', ''),
            data.get('image_size', '1080x1080'),
            data.get('post_type', 'post'),
            data.get('tov', ''),
            data.get('brief_notes', ''),
            data.get('design_reference_urls', ''),
            assigned_designer_id,
            assigned_sm_id,
            assigned_motion_id,
            assigned_writer_id,
            assigned_manager_id,
            data.get('priority', 'normal'),
            data.get('workflow_status', 'draft'),
            data.get('created_by_id') or None,
        )
    )
    db.commit()
    post_id = cursor.lastrowid

    # Log workflow history and send notifications
    wf_status = data.get('workflow_status', 'draft')
    user_id = data.get('created_by_id') or 1
    db.execute(
        """INSERT INTO workflow_history (post_id, user_id, from_status, to_status, comment)
           VALUES (?,?,?,?,?)""",
        (post_id, user_id, '', wf_status, 'Post created')
    )
    # Notify designer if assigned and status is in_design
    if wf_status == 'in_design' and assigned_designer_id:
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (assigned_designer_id, 'design_assigned',
             'New Design Task', f'You have a new design to work on: {data.get("topic", "Untitled")}',
             'post', post_id)
        )
    db.commit()

    db.close()
    return jsonify({'success': True, 'id': post_id})


# ============ EXISTING ENDPOINTS ============

# ============ MY WORK (role-aware action items) ============

@posts_bp.route('/api/posts/my-work', methods=['GET'])
def my_work():
    """Return posts that need the current user's attention, based on their role."""
    user_id = request.args.get('user_id', 1, type=int)
    role = request.args.get('role', 'user')

    db = get_db()
    items = []

    if role == 'copywriter':
        # Posts assigned to this copywriter in draft status (need writing)
        rows = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.assigned_writer_id=? AND sp.workflow_status='draft'
            ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        """, (user_id,)).fetchall())
        for r in rows:
            r['action'] = 'needs_writing'
            r['action_label'] = 'Needs Writing'
        items.extend(rows)

        # Posts returned from review back to draft
        returned = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.assigned_writer_id=? AND sp.workflow_status='draft' AND sp.revision_count > 0
            ORDER BY sp.updated_at DESC
        """, (user_id,)).fetchall())
        for r in returned:
            r['action'] = 'returned_for_edits'
            r['action_label'] = 'Returned for Edits'
        existing_ids = {i['id'] for i in items}
        items.extend([r for r in returned if r['id'] not in existing_ids])

    elif role in ('designer', 'motion_editor'):
        # Posts assigned to this designer that are in_design
        rows = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.assigned_designer_id=? AND sp.workflow_status='in_design'
            ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        """, (user_id,)).fetchall())
        for r in rows:
            r['action'] = 'needs_design'
            r['action_label'] = 'يحتاج تصميم'
        items.extend(rows)

        # Posts returned from review back to in_design
        returned = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.assigned_designer_id=? AND sp.workflow_status='in_design' AND sp.revision_count > 0
            ORDER BY sp.updated_at DESC
        """, (user_id,)).fetchall())
        for r in returned:
            r['action'] = 'returned_for_edits'
            r['action_label'] = 'مرتجع للتعديل'
        # Don't duplicate - only add ones not already in items
        existing_ids = {i['id'] for i in items}
        items.extend([r for r in returned if r['id'] not in existing_ids])

    elif role == 'manager':
        # Manager reviews posts in design_review stage
        rows = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE (sp.assigned_manager_id=? OR sp.assigned_manager_id IS NULL) AND sp.workflow_status='design_review'
            ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        """, (user_id,)).fetchall())
        for r in rows:
            r['action'] = 'needs_review'
            r['action_label'] = 'Needs Review'
        items.extend(rows)

        # Draft posts waiting for team (created but not sent to design yet)
        drafts = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.workflow_status='draft' AND sp.assigned_designer_id IS NULL
            ORDER BY sp.created_at DESC LIMIT 10
        """).fetchall())
        for r in drafts:
            r['action'] = 'unassigned'
            r['action_label'] = 'Unassigned Draft'
        existing_ids = {i['id'] for i in items}
        items.extend([r for r in drafts if r['id'] not in existing_ids])

    elif role == 'sm_specialist':
        # SM Specialist schedules approved posts
        approved = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE (sp.assigned_sm_id=? OR sp.assigned_sm_id IS NULL) AND sp.workflow_status='approved'
              AND (sp.scheduled_at IS NULL OR sp.scheduled_at='')
            ORDER BY CASE sp.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        """, (user_id,)).fetchall())
        for r in approved:
            r['action'] = 'ready_to_schedule'
            r['action_label'] = 'Ready to Schedule'
        items.extend(approved)

        # Scheduled posts to monitor
        scheduled = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE (sp.assigned_sm_id=? OR sp.assigned_sm_id IS NULL) AND sp.workflow_status='scheduled'
            ORDER BY sp.scheduled_at ASC LIMIT 10
        """, (user_id,)).fetchall())
        for r in scheduled:
            r['action'] = 'scheduled'
            r['action_label'] = 'Scheduled'
        existing_ids = {i['id'] for i in items}
        items.extend([r for r in scheduled if r['id'] not in existing_ids])

    elif role == 'admin':
        # All posts needing attention: unassigned drafts, overdue, etc.
        unassigned = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.workflow_status='draft' AND sp.assigned_designer_id IS NULL
            ORDER BY sp.created_at DESC LIMIT 20
        """).fetchall())
        for r in unassigned:
            r['action'] = 'unassigned'
            r['action_label'] = 'غير معين'
        items.extend(unassigned)

        # Overdue scheduled posts
        overdue = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.status='pending' AND sp.scheduled_at < datetime('now') AND sp.scheduled_at != ''
            ORDER BY sp.scheduled_at ASC LIMIT 20
        """).fetchall())
        for r in overdue:
            r['action'] = 'overdue'
            r['action_label'] = 'متأخر'
        items.extend(overdue)

        # Posts in review
        in_review = dicts_from_rows(db.execute("""
            SELECT sp.*, c.name as client_name
            FROM scheduled_posts sp
            LEFT JOIN clients c ON sp.client_id = c.id
            WHERE sp.workflow_status='design_review'
            ORDER BY sp.updated_at DESC LIMIT 20
        """).fetchall())
        for r in in_review:
            r['action'] = 'needs_review'
            r['action_label'] = 'يحتاج مراجعة'
        existing_ids = {i['id'] for i in items}
        items.extend([r for r in in_review if r['id'] not in existing_ids])

    db.close()
    return jsonify(items)


# ============ WORKFLOW TRANSITION (enforced) ============

@posts_bp.route('/api/posts/<int:post_id>/transition', methods=['POST'])
@require_login
def transition_post(post_id):
    """Transition a post through the workflow with validation."""
    data = request.json or {}
    new_status = data.get('status', '')
    user_id = data.get('user_id', 1)
    comment = data.get('comment', '')

    if new_status not in VALID_WORKFLOW_STATUSES:
        return jsonify({'error': f'Invalid status. Must be one of: {VALID_WORKFLOW_STATUSES}'}), 400

    # Role-based transition guards
    user_role = session.get('user_role', '')
    if user_role != 'admin':
        if user_role in ('designer', 'motion_editor'):
            # Designers can only submit for review (in_design -> design_review)
            if new_status != 'design_review':
                return jsonify({'error': 'Permission denied'}), 403
        elif user_role == 'copywriter':
            # Copywriters can only send to design (draft -> in_design)
            if new_status != 'in_design':
                return jsonify({'error': 'Permission denied'}), 403
        elif user_role == 'sm_specialist':
            # SM Specialists can only schedule (approved -> scheduled)
            if new_status != 'scheduled':
                return jsonify({'error': 'Permission denied'}), 403
        elif user_role == 'manager':
            pass  # Managers have same access as admin for transitions

    db = get_db()
    post = dict_from_row(db.execute("""
        SELECT sp.*, c.name as client_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        WHERE sp.id=?
    """, (post_id,)).fetchone())

    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    old_status = post.get('workflow_status', 'draft') or 'draft'

    # Validate transition
    allowed = VALID_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        db.close()
        return jsonify({'error': f'Cannot transition from {old_status} to {new_status}. Allowed: {allowed}'}), 400

    # Validate requirements
    if new_status == 'in_design' and not post.get('assigned_designer_id'):
        db.close()
        return jsonify({'error': 'Designer must be assigned before moving to design'}), 400

    if new_status == 'design_review':
        design_urls = post.get('design_output_urls', '') or ''
        if not design_urls.strip():
            db.close()
            return jsonify({'error': 'Design must be uploaded before submitting for review'}), 400

    if old_status == 'design_review' and new_status == 'in_design' and not comment:
        db.close()
        return jsonify({'error': 'Feedback comment is required when returning to design'}), 400

    if old_status == 'design_review' and new_status == 'draft' and not comment:
        db.close()
        return jsonify({'error': 'Feedback comment is required when returning to copywriter'}), 400

    if new_status == 'scheduled':
        scheduled_at = data.get('scheduled_at') or post.get('scheduled_at', '')
        if not scheduled_at:
            db.close()
            return jsonify({'error': 'Schedule date/time required'}), 400

    # Perform the transition
    update_fields = ["workflow_status=?", "updated_at=datetime('now')"]
    update_params = [new_status]

    if new_status == 'approved':
        update_fields.extend(["approved_by_id=?", "approved_at=datetime('now')"])
        update_params.append(user_id)

    if new_status == 'scheduled' and data.get('scheduled_at'):
        update_fields.append("scheduled_at=?")
        update_params.append(data['scheduled_at'])
        update_fields.append("status=?")
        update_params.append('pending')

    if old_status == 'design_review' and new_status in ('in_design', 'draft'):
        update_fields.append("revision_count=revision_count+1")

    update_params.append(post_id)
    db.execute(f"UPDATE scheduled_posts SET {', '.join(update_fields)} WHERE id=?", update_params)

    # Log to workflow_history
    db.execute(
        """INSERT INTO workflow_history (post_id, user_id, from_status, to_status, comment)
           VALUES (?,?,?,?,?)""",
        (post_id, user_id, old_status, new_status, comment)
    )

    # Add feedback as a comment if returning to design or copywriter
    if old_status == 'design_review' and new_status in ('in_design', 'draft') and comment:
        db.execute(
            """INSERT INTO post_comments (post_id, user_id, content, comment_type)
               VALUES (?,?,?,?)""",
            (post_id, user_id, comment, 'revision_feedback')
        )

    # Create notifications for the next person in the chain
    topic = post.get('topic', 'Untitled')

    # Notify designer when moving to in_design
    if new_status == 'in_design' and post.get('assigned_designer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_designer_id'], 'design_assigned',
             'New Design Task', f'You have a new design to work on: {topic}', 'post', post_id)
        )

    # Notify motion editor when moving to in_design
    if new_status == 'in_design' and post.get('assigned_motion_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_motion_id'], 'motion_assigned',
             'New Motion Task', f'You have a new video/motion design to work on: {topic}', 'post', post_id)
        )

    # Notify designer when design is returned for revision
    if old_status == 'design_review' and new_status == 'in_design' and post.get('assigned_designer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_designer_id'], 'design_returned',
             'Design Returned for Revision', f'The manager has returned your design for revision: {topic}', 'post', post_id)
        )

    # Notify copywriter when post is returned to draft for edits
    if old_status == 'design_review' and new_status == 'draft' and post.get('assigned_writer_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_writer_id'], 'caption_returned',
             'Post Returned for Edits', f'The manager returned this post for copywriter edits: {topic}', 'post', post_id)
        )

    # Notify manager when design is submitted for review
    if new_status == 'design_review' and post.get('assigned_manager_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_manager_id'], 'design_review_ready',
             'Design Ready for Review', f'Design submitted for your review: {topic}', 'post', post_id)
        )

    # Notify SM specialist when post is approved
    if new_status == 'approved' and post.get('assigned_sm_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['assigned_sm_id'], 'post_approved',
             'Post Approved - Ready to Schedule', f'Post approved and ready to schedule: {topic}', 'post', post_id)
        )

    # Notify post creator when scheduled
    if new_status == 'scheduled' and post.get('created_by_id'):
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (post['created_by_id'], 'post_scheduled',
             'Post Scheduled', f'Your post has been scheduled: {topic}', 'post', post_id)
        )

    # Auto-create task for designer when moving to in_design
    if new_status == 'in_design' and post.get('assigned_designer_id'):
        db.execute(
            """INSERT INTO tasks (title, description, client_id, assigned_to_id, created_by_id,
                                  status, priority, category, post_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (f'Design: {topic}', f'Execute design for post: {topic}', post.get('client_id'),
             post['assigned_designer_id'], user_id, 'todo', post.get('priority', 'normal'),
             'design', post_id)
        )

    # Auto-create task for motion editor when moving to in_design
    if new_status == 'in_design' and post.get('assigned_motion_id'):
        db.execute(
            """INSERT INTO tasks (title, description, client_id, assigned_to_id, created_by_id,
                                  status, priority, category, post_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (f'Motion: {topic}', f'Create video/motion content for post: {topic}', post.get('client_id'),
             post['assigned_motion_id'], user_id, 'todo', post.get('priority', 'normal'),
             'design', post_id)
        )

    # Auto-create task for manager when moving to design_review
    if new_status == 'design_review' and post.get('assigned_manager_id'):
        db.execute(
            """INSERT INTO tasks (title, description, client_id, assigned_to_id, created_by_id,
                                  status, priority, category, post_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (f'Review: {topic}', f'Review design for post: {topic}', post.get('client_id'),
             post['assigned_manager_id'], user_id, 'todo', post.get('priority', 'normal'),
             'review', post_id)
        )

    # Auto-create task for SM specialist when post is approved
    if new_status == 'approved' and post.get('assigned_sm_id'):
        db.execute(
            """INSERT INTO tasks (title, description, client_id, assigned_to_id, created_by_id,
                                  status, priority, category, post_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (f'Schedule: {topic}', f'Schedule and publish post: {topic}', post.get('client_id'),
             post['assigned_sm_id'], user_id, 'todo', post.get('priority', 'normal'),
             'general', post_id)
        )

    db.commit()
    db.close()
    return jsonify({'success': True})


# ============ CALENDAR VIEW ============

@posts_bp.route('/api/posts/calendar', methods=['GET'])
def calendar_posts():
    """Get posts organized for calendar display."""
    month = request.args.get('month', type=int)
    year = request.args.get('year', type=int)
    client_id = request.args.get('client_id')

    if not month or not year:
        now = datetime.now()
        month = month or now.month
        year = year or now.year

    # Get first and last day of the month
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"

    include_unscheduled = request.args.get('include_unscheduled', '')

    db = get_db()
    query = """
        SELECT sp.*, c.name as client_name, c.color as client_color,
               u_designer.username as assigned_designer_name,
               u_sm.username as assigned_sm_name,
               u_motion.username as assigned_motion_name,
               u_writer.username as assigned_writer_name,
               u_manager.username as assigned_manager_name
        FROM scheduled_posts sp
        LEFT JOIN clients c ON sp.client_id = c.id
        LEFT JOIN users u_designer ON sp.assigned_designer_id = u_designer.id
        LEFT JOIN users u_sm ON sp.assigned_sm_id = u_sm.id
        LEFT JOIN users u_motion ON sp.assigned_motion_id = u_motion.id
        LEFT JOIN users u_writer ON sp.assigned_writer_id = u_writer.id
        LEFT JOIN users u_manager ON sp.assigned_manager_id = u_manager.id
        WHERE (
            (sp.scheduled_at >= ? AND sp.scheduled_at < ? AND sp.scheduled_at IS NOT NULL AND sp.scheduled_at != '')
    """
    params = [start_date, end_date]

    if include_unscheduled == '1':
        query += """
            OR ((sp.scheduled_at IS NULL OR sp.scheduled_at = '')
                AND sp.created_at >= ? AND sp.created_at < ?)
        """
        params.extend([start_date, end_date])

    query += ")"

    if client_id:
        query += " AND sp.client_id=?"
        params.append(client_id)

    assigned_to = request.args.get('assigned_to')
    if assigned_to:
        query += " AND (sp.assigned_designer_id=? OR sp.assigned_sm_id=? OR sp.assigned_motion_id=? OR sp.assigned_writer_id=? OR sp.created_by_id=?)"
        params.extend([assigned_to, assigned_to, assigned_to, assigned_to, assigned_to])

    query += " ORDER BY COALESCE(sp.scheduled_at, sp.created_at) ASC"

    posts = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()

    # Group by date
    by_date = {}
    for post in posts:
        sa = post.get('scheduled_at', '') or ''
        date_key = sa[:10] if len(sa) >= 10 else ''
        if date_key:
            if date_key not in by_date:
                by_date[date_key] = []
            by_date[date_key].append(post)

    return jsonify({'posts': posts, 'by_date': by_date, 'month': month, 'year': year})


# ============ RESCHEDULE (drag-and-drop) ============

@posts_bp.route('/api/posts/<int:post_id>/reschedule', methods=['PUT'])
@require_role('manager', 'sm_specialist')
def reschedule_post(post_id):
    """Reschedule a post to a new date/time (for calendar drag-and-drop)."""
    data = request.json or {}
    new_datetime = data.get('scheduled_at', '')

    if not new_datetime:
        return jsonify({'error': 'New schedule datetime required'}), 400

    db = get_db()
    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    if not post:
        db.close()
        return jsonify({'error': 'Post not found'}), 404

    # Only scheduled and approved posts can be rescheduled
    wf_status = post.get('workflow_status', '') or ''
    if wf_status not in ('scheduled', 'approved'):
        db.close()
        return jsonify({'error': 'Only scheduled or approved posts can be rescheduled'}), 400

    db.execute(
        "UPDATE scheduled_posts SET scheduled_at=?, updated_at=datetime('now') WHERE id=?",
        (new_datetime, post_id)
    )

    # If approved post is being scheduled, also update workflow_status
    if wf_status == 'approved':
        db.execute(
            "UPDATE scheduled_posts SET workflow_status='scheduled', status='pending' WHERE id=?",
            (post_id,)
        )

    db.commit()
    db.close()
    return jsonify({'success': True})


# ============ EXISTING ENDPOINTS ============

@posts_bp.route('/api/post-now-single', methods=['POST'])
def post_now_single():
    data = request.json or {}
    client_id = data.get('client_id')
    topic = data.get('topic', '')
    caption = data.get('caption', '') or topic
    platform = data.get('platform', '')
    image_urls = data.get('image_urls', [])
    video_url = data.get('video_url', '')
    post_type = data.get('post_type', 'post')
    image_size = data.get('image_size', '1080x1080')

    # Build image_url string
    if video_url:
        image_url_str = video_url
    elif image_urls:
        image_url_str = ','.join(image_urls)
    else:
        image_url_str = ''

    # Save to DB first
    db = get_db()
    cursor = db.execute(
        """INSERT INTO scheduled_posts
           (client_id, topic, caption, image_url, platforms, scheduled_at, status, image_size, post_type)
           VALUES (?,?,?,?,?,datetime('now'),?,?,?)""",
        (client_id, topic, caption, image_url_str, platform, 'pending', image_size, post_type)
    )
    db.commit()
    post_id = cursor.lastrowid

    post = dict_from_row(db.execute("SELECT * FROM scheduled_posts WHERE id=?", (post_id,)).fetchone())
    db.close()

    # Publish immediately
    results = publish_post(post)
    platform_result = results.get(platform, {})

    return jsonify(platform_result)


@posts_bp.route('/api/posts/<int:post_id>', methods=['DELETE'])
@require_role('manager')
def delete_post(post_id):
    db = get_db()
    db.execute("DELETE FROM post_comments WHERE post_id=?", (post_id,))
    db.execute("DELETE FROM workflow_history WHERE post_id=?", (post_id,))
    db.execute("DELETE FROM post_logs WHERE post_id=?", (post_id,))
    db.execute("DELETE FROM scheduled_posts WHERE id=?", (post_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@posts_bp.route('/api/bulk-schedule', methods=['POST'])
def bulk_schedule():
    data = request.json or {}
    posts = data.get('posts', [])
    success_count = 0

    db = get_db()
    for p in posts:
        try:
            db.execute(
                """INSERT INTO scheduled_posts
                   (client_id, topic, caption, image_url, platforms, scheduled_at, image_size, post_type)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    p.get('client_id'),
                    p.get('topic', ''),
                    p.get('caption', ''),
                    p.get('image_url', ''),
                    p.get('platforms', ''),
                    p.get('scheduled_at', ''),
                    p.get('image_size', '1080x1080'),
                    p.get('post_type', 'post')
                )
            )
            success_count += 1
        except Exception as e:
            print(f"Error scheduling post: {e}")
    db.commit()
    db.close()

    return jsonify({'success': True, 'success_count': success_count, 'total': len(posts)})


@posts_bp.route('/api/run-scheduler', methods=['POST'])
def run_scheduler_now():
    try:
        results = run_scheduler()
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@posts_bp.route('/api/force-publish-all', methods=['POST'])
def force_publish():
    try:
        result = force_publish_all()
        msg = f"Published: {result['published']}, Failed: {result['failed']}, Total: {result['total']}"
        return jsonify({'success': True, 'message': msg, **result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
