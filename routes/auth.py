from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import hashlib
from models import get_db, dict_from_row

auth_bp = Blueprint('auth', __name__)


def _check_legacy_hash(password, stored_hash):
    """Check against legacy SHA256 hash from the old exe."""
    return hashlib.sha256(password.encode()).hexdigest() == stored_hash


def require_login(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Login required'}), 401
        if session.get('user_role') != 'admin':
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


def require_role(*roles):
    """Allow only specific roles (admin always passes)."""
    def wrapper(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'success': False, 'error': 'Login required'}), 401
            if session.get('user_role') not in list(roles) + ['admin']:
                return jsonify({'success': False, 'error': 'Permission denied'}), 403
            return f(*args, **kwargs)
        return decorated
    return wrapper


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password required'}), 400

    db = get_db()
    user = dict_from_row(db.execute(
        "SELECT * FROM users WHERE email=? AND is_active=1", (email,)
    ).fetchone())
    db.close()

    if not user:
        return jsonify({'success': False, 'error': 'Invalid credentials'})

    # Check password: try werkzeug hash first, then legacy SHA256
    pw_ok = False
    if user['password_hash'].startswith(('pbkdf2:', 'scrypt:')):
        pw_ok = check_password_hash(user['password_hash'], password)
    else:
        pw_ok = _check_legacy_hash(password, user['password_hash'])

    if not pw_ok:
        return jsonify({'success': False, 'error': 'Invalid credentials'})

    # Set session
    session['user_id'] = user['id']
    session['user_role'] = user['role']

    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'name': user['username'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'dark_mode': user['dark_mode'],
            'job_title': user.get('job_title', ''),
            'phone': user.get('phone', ''),
            'avatar_url': user.get('avatar_url', '')
        }
    })


@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({'success': False, 'error': 'All fields required'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email=? OR username=?", (email, name)).fetchone()
    if existing:
        db.close()
        return jsonify({'success': False, 'error': 'Email or username already exists'}), 400

    pw_hash = generate_password_hash(password)
    db.execute(
        "INSERT INTO users (username, email, password_hash, role) VALUES (?,?,?,?)",
        (name, email, pw_hash, 'user')
    )
    db.commit()
    db.close()

    return jsonify({'success': True, 'message': 'Account created'})


@auth_bp.route('/api/users/<int:user_id>/dark-mode', methods=['PUT'])
@require_login
def toggle_dark_mode(user_id):
    if session['user_id'] != user_id:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 403
    data = request.json or {}
    dark_mode = data.get('dark_mode', 0)
    db = get_db()
    db.execute("UPDATE users SET dark_mode=? WHERE id=?", (dark_mode, user_id))
    db.commit()
    db.close()
    return jsonify({'success': True})


@auth_bp.route('/api/users', methods=['GET'])
@require_login
def list_users():
    db = get_db()
    role_filter = request.args.get('role')
    if role_filter:
        users = db.execute("SELECT id, username, email, role, is_active, dark_mode, job_title, phone, avatar_url FROM users WHERE role=?", (role_filter,)).fetchall()
    else:
        users = db.execute("SELECT id, username, email, role, is_active, dark_mode, job_title, phone, avatar_url FROM users").fetchall()
    db.close()
    return jsonify([dict(u) for u in users])


@auth_bp.route('/api/users', methods=['POST'])
@require_admin
def create_user():
    data = request.json or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')
    job_title = data.get('job_title', '')
    phone = data.get('phone', '')

    if not username or not email or not password:
        return jsonify({'success': False, 'error': 'All fields required'}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email=? OR username=?", (email, username)).fetchone()
    if existing:
        db.close()
        return jsonify({'success': False, 'error': 'Username or email already exists'}), 400

    pw_hash = generate_password_hash(password)
    db.execute(
        "INSERT INTO users (username, email, password_hash, role, job_title, phone) VALUES (?,?,?,?,?,?)",
        (username, email, pw_hash, role, job_title, phone)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@auth_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@require_admin
def update_user(user_id):
    data = request.json or {}
    db = get_db()
    fields = []
    values = []
    for col in ('username', 'email', 'role', 'job_title', 'phone'):
        if col in data:
            fields.append(f"{col}=?")
            values.append(data[col])
    if not fields:
        db.close()
        return jsonify({'success': False, 'error': 'No fields to update'}), 400
    values.append(user_id)
    db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", values)
    db.commit()
    db.close()
    return jsonify({'success': True})


@auth_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id):
    if session['user_id'] == user_id:
        return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400
    db = get_db()
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})
