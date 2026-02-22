from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

tasks_bp = Blueprint('tasks', __name__)


@tasks_bp.route('/api/tasks', methods=['GET'])
def list_tasks():
    db = get_db()
    status = request.args.get('status')
    assigned_to = request.args.get('assigned_to_id')
    client_id = request.args.get('client_id')
    priority = request.args.get('priority')
    category = request.args.get('category')
    post_id = request.args.get('post_id')
    brief_id = request.args.get('brief_id')

    query = """
        SELECT t.*,
               u_assigned.username as assigned_to_name,
               u_created.username as created_by_name,
               c.name as client_name,
               sp.topic as post_topic,
               cb.title as brief_title
        FROM tasks t
        LEFT JOIN users u_assigned ON t.assigned_to_id = u_assigned.id
        LEFT JOIN users u_created ON t.created_by_id = u_created.id
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN scheduled_posts sp ON t.post_id = sp.id
        LEFT JOIN content_briefs cb ON t.brief_id = cb.id
        WHERE 1=1
    """
    params = []

    if status:
        query += " AND t.status=?"
        params.append(status)
    if assigned_to:
        query += " AND t.assigned_to_id=?"
        params.append(assigned_to)
    if client_id:
        query += " AND t.client_id=?"
        params.append(client_id)
    if priority:
        query += " AND t.priority=?"
        params.append(priority)
    if category:
        query += " AND t.category=?"
        params.append(category)
    if post_id:
        query += " AND t.post_id=?"
        params.append(post_id)
    if brief_id:
        query += " AND t.brief_id=?"
        params.append(brief_id)

    query += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.created_at DESC"

    tasks = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()
    return jsonify(tasks)


@tasks_bp.route('/api/tasks/my-tasks', methods=['GET'])
def my_tasks():
    """Get tasks assigned to a specific user."""
    user_id = request.args.get('user_id', 1, type=int)
    include_done = request.args.get('include_done', 'false').lower() == 'true'

    db = get_db()
    query = """
        SELECT t.*,
               u_assigned.username as assigned_to_name,
               u_created.username as created_by_name,
               c.name as client_name,
               sp.topic as post_topic,
               cb.title as brief_title
        FROM tasks t
        LEFT JOIN users u_assigned ON t.assigned_to_id = u_assigned.id
        LEFT JOIN users u_created ON t.created_by_id = u_created.id
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN scheduled_posts sp ON t.post_id = sp.id
        LEFT JOIN content_briefs cb ON t.brief_id = cb.id
        WHERE t.assigned_to_id=?
    """
    params = [user_id]

    if not include_done:
        query += " AND t.status != 'done'"

    query += " ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.created_at DESC"

    tasks = dicts_from_rows(db.execute(query, params).fetchall())
    db.close()
    return jsonify(tasks)


@tasks_bp.route('/api/tasks/board', methods=['GET'])
def task_board():
    db = get_db()
    query = """
        SELECT t.*,
               u_assigned.username as assigned_to_name,
               u_created.username as created_by_name,
               c.name as client_name
        FROM tasks t
        LEFT JOIN users u_assigned ON t.assigned_to_id = u_assigned.id
        LEFT JOIN users u_created ON t.created_by_id = u_created.id
        LEFT JOIN clients c ON t.client_id = c.id
        ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.created_at DESC
    """
    tasks = dicts_from_rows(db.execute(query).fetchall())
    db.close()

    board = {
        'todo': [],
        'in_progress': [],
        'in_review': [],
        'done': []
    }
    for task in tasks:
        s = task.get('status', 'todo')
        if s in board:
            board[s].append(task)
        elif s == 'cancelled':
            pass  # Skip cancelled tasks
        else:
            board['todo'].append(task)

    return jsonify(board)


@tasks_bp.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    db = get_db()
    task = dict_from_row(db.execute("""
        SELECT t.*,
               u_assigned.username as assigned_to_name,
               u_created.username as created_by_name,
               c.name as client_name
        FROM tasks t
        LEFT JOIN users u_assigned ON t.assigned_to_id = u_assigned.id
        LEFT JOIN users u_created ON t.created_by_id = u_created.id
        LEFT JOIN clients c ON t.client_id = c.id
        WHERE t.id=?
    """, (task_id,)).fetchone())

    if not task:
        db.close()
        return jsonify({'error': 'Task not found'}), 404

    comments = dicts_from_rows(db.execute("""
        SELECT tc.*, u.username as user_name
        FROM task_comments tc
        LEFT JOIN users u ON tc.user_id = u.id
        WHERE tc.task_id=?
        ORDER BY tc.created_at ASC
    """, (task_id,)).fetchall())

    db.close()
    task['comments'] = comments
    return jsonify(task)


@tasks_bp.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title required'}), 400

    created_by_id = data.get('created_by_id', 1)

    db = get_db()
    cursor = db.execute(
        """INSERT INTO tasks (title, description, client_id, assigned_to_id, created_by_id,
           status, priority, due_date, category, attachment_urls, post_id, brief_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            title,
            data.get('description', ''),
            data.get('client_id'),
            data.get('assigned_to_id'),
            created_by_id,
            'todo',
            data.get('priority', 'normal'),
            data.get('due_date'),
            data.get('category', 'general'),
            data.get('attachment_urls', ''),
            data.get('post_id'),
            data.get('brief_id'),
        )
    )
    db.commit()
    task_id = cursor.lastrowid

    # Create notification for assignee
    assigned_to = data.get('assigned_to_id')
    if assigned_to:
        db.execute(
            """INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?,?,?,?,?,?)""",
            (assigned_to, 'task_assigned', 'مهمة جديدة', f'تم تعيينك لمهمة: {title}', 'task', task_id)
        )
        db.commit()

    db.close()
    return jsonify({'success': True, 'id': task_id})


@tasks_bp.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.json or {}
    db = get_db()

    task = dict_from_row(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())
    if not task:
        db.close()
        return jsonify({'error': 'Task not found'}), 404

    fields = []
    params = []
    updatable = ['title', 'description', 'client_id', 'assigned_to_id', 'priority', 'due_date', 'category', 'attachment_urls']
    for field in updatable:
        if field in data:
            fields.append(f"{field}=?")
            params.append(data[field])

    if fields:
        fields.append("updated_at=datetime('now')")
        params.append(task_id)
        db.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=?", params)
        db.commit()

    db.close()
    return jsonify({'success': True})


@tasks_bp.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    db = get_db()
    db.execute("DELETE FROM task_comments WHERE task_id=?", (task_id,))
    db.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@tasks_bp.route('/api/tasks/<int:task_id>/status', methods=['PUT'])
def update_task_status(task_id):
    data = request.json or {}
    new_status = data.get('status', '')
    valid_statuses = ['todo', 'in_progress', 'in_review', 'done', 'cancelled']

    if new_status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400

    db = get_db()
    completed_at = "datetime('now')" if new_status == 'done' else 'NULL'
    db.execute(
        f"UPDATE tasks SET status=?, updated_at=datetime('now'), completed_at={completed_at} WHERE id=?",
        (new_status, task_id)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@tasks_bp.route('/api/tasks/<int:task_id>/comments', methods=['GET'])
def get_task_comments(task_id):
    db = get_db()
    comments = dicts_from_rows(db.execute("""
        SELECT tc.*, u.username as user_name
        FROM task_comments tc
        LEFT JOIN users u ON tc.user_id = u.id
        WHERE tc.task_id=?
        ORDER BY tc.created_at ASC
    """, (task_id,)).fetchall())
    db.close()
    return jsonify(comments)


@tasks_bp.route('/api/tasks/<int:task_id>/comments', methods=['POST'])
def add_task_comment(task_id):
    data = request.json or {}
    content = data.get('content', '').strip()
    user_id = data.get('user_id', 1)

    if not content:
        return jsonify({'error': 'Content required'}), 400

    db = get_db()
    db.execute(
        "INSERT INTO task_comments (task_id, user_id, content, attachment_urls) VALUES (?,?,?,?)",
        (task_id, user_id, content, data.get('attachment_urls', ''))
    )
    db.commit()
    db.close()
    return jsonify({'success': True})
