from flask import Blueprint, request, jsonify
from models import get_db, dict_from_row, dicts_from_rows

clients_bp = Blueprint('clients', __name__)


@clients_bp.route('/api/clients', methods=['GET'])
def list_clients():
    db = get_db()
    clients = dicts_from_rows(db.execute("SELECT * FROM clients ORDER BY id DESC").fetchall())
    db.close()
    return jsonify(clients)


@clients_bp.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    db = get_db()
    client = dict_from_row(db.execute("SELECT * FROM clients WHERE id=?", (client_id,)).fetchone())
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

    db = get_db()
    cursor = db.execute(
        "INSERT INTO clients (name, email, company) VALUES (?,?,?)",
        (name, email or None, company or None)
    )
    db.commit()
    client_id = cursor.lastrowid
    db.close()
    return jsonify({'success': True, 'id': client_id})


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
