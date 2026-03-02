from flask import Blueprint, request, jsonify
from models import get_db, dicts_from_rows, dict_from_row
from routes.auth import require_super_admin

billing_bp = Blueprint('billing', __name__)


@billing_bp.route('/api/billing', methods=['GET'])
@require_super_admin
def list_billing():
    """List all clients with billing info + invoices for a given month."""
    month = request.args.get('month', '')
    if not month:
        from datetime import datetime
        month = datetime.now().strftime('%Y-%m')

    db = get_db()
    clients = dicts_from_rows(db.execute(
        "SELECT id, name, logo_url, monthly_value, billing_start_date FROM clients ORDER BY name"
    ).fetchall())

    invoices = dicts_from_rows(db.execute(
        "SELECT * FROM invoices WHERE month=? ORDER BY client_id", (month,)
    ).fetchall())
    db.close()

    invoice_map = {inv['client_id']: inv for inv in invoices}

    result = []
    for c in clients:
        inv = invoice_map.get(c['id'])
        result.append({
            'client_id': c['id'],
            'client_name': c['name'],
            'logo_url': c.get('logo_url', ''),
            'monthly_value': c.get('monthly_value', 0) or 0,
            'billing_start_date': c.get('billing_start_date', ''),
            'invoice': inv,
        })

    total_revenue = sum(r['monthly_value'] for r in result)
    total_paid = sum(r['monthly_value'] for r in result if r['invoice'] and r['invoice']['paid'])
    total_unpaid = sum(r['monthly_value'] for r in result if r['invoice'] and not r['invoice']['paid'])
    total_sent = sum(1 for r in result if r['invoice'] and r['invoice']['invoice_sent'])

    return jsonify({
        'month': month,
        'clients': result,
        'summary': {
            'total_revenue': total_revenue,
            'total_paid': total_paid,
            'total_unpaid': total_unpaid,
            'total_sent': total_sent,
            'total_clients': len(result),
        }
    })


@billing_bp.route('/api/billing/client/<int:client_id>', methods=['PUT'])
@require_super_admin
def update_client_billing(client_id):
    """Update monthly_value and billing_start_date for a client."""
    data = request.json or {}
    db = get_db()

    client = db.execute("SELECT id FROM clients WHERE id=?", (client_id,)).fetchone()
    if not client:
        db.close()
        return jsonify({'success': False, 'error': 'Client not found'}), 404

    fields = []
    values = []
    if 'monthly_value' in data:
        fields.append("monthly_value=?")
        values.append(float(data['monthly_value']))
    if 'billing_start_date' in data:
        fields.append("billing_start_date=?")
        values.append(data['billing_start_date'])

    if not fields:
        db.close()
        return jsonify({'success': False, 'error': 'No fields to update'}), 400

    values.append(client_id)
    db.execute(f"UPDATE clients SET {', '.join(fields)} WHERE id=?", values)
    db.commit()
    db.close()
    return jsonify({'success': True})


@billing_bp.route('/api/billing/invoice', methods=['POST'])
@require_super_admin
def create_or_update_invoice():
    """Create or update an invoice for a client+month."""
    data = request.json or {}
    client_id = data.get('client_id')
    month = data.get('month')

    if not client_id or not month:
        return jsonify({'success': False, 'error': 'client_id and month required'}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM invoices WHERE client_id=? AND month=?", (client_id, month)
    ).fetchone()

    if existing:
        fields = []
        values = []
        for col in ('amount', 'invoice_sent', 'paid', 'notes'):
            if col in data:
                fields.append(f"{col}=?")
                values.append(data[col])
        if 'paid' in data and data['paid']:
            from datetime import datetime
            fields.append("paid_at=?")
            values.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        if fields:
            values.append(existing['id'])
            db.execute(f"UPDATE invoices SET {', '.join(fields)} WHERE id=?", values)
            db.commit()
        invoice_id = existing['id']
    else:
        amount = data.get('amount', 0)
        # Default amount to client's monthly value
        if not amount:
            client = db.execute(
                "SELECT monthly_value FROM clients WHERE id=?", (client_id,)
            ).fetchone()
            if client:
                amount = client['monthly_value'] or 0
        cur = db.execute(
            "INSERT INTO invoices (client_id, amount, month, invoice_sent, paid, notes) VALUES (?,?,?,?,?,?)",
            (client_id, amount, month, data.get('invoice_sent', 0), data.get('paid', 0), data.get('notes', ''))
        )
        db.commit()
        invoice_id = cur.lastrowid

    invoice = dict_from_row(db.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone())
    db.close()
    return jsonify({'success': True, 'invoice': invoice})


@billing_bp.route('/api/billing/invoice/<int:invoice_id>', methods=['PUT'])
@require_super_admin
def update_invoice(invoice_id):
    """Toggle sent/paid status or update notes for an invoice."""
    data = request.json or {}
    db = get_db()

    invoice = db.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if not invoice:
        db.close()
        return jsonify({'success': False, 'error': 'Invoice not found'}), 404

    fields = []
    values = []
    for col in ('invoice_sent', 'paid', 'notes', 'amount'):
        if col in data:
            fields.append(f"{col}=?")
            values.append(data[col])

    if 'paid' in data:
        if data['paid']:
            from datetime import datetime
            fields.append("paid_at=?")
            values.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        else:
            fields.append("paid_at=?")
            values.append('')

    if not fields:
        db.close()
        return jsonify({'success': False, 'error': 'No fields to update'}), 400

    values.append(invoice_id)
    db.execute(f"UPDATE invoices SET {', '.join(fields)} WHERE id=?", values)
    db.commit()

    updated = dict_from_row(db.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone())
    db.close()
    return jsonify({'success': True, 'invoice': updated})


@billing_bp.route('/api/billing/generate', methods=['POST'])
@require_super_admin
def generate_invoices():
    """Auto-generate invoices for all active clients for a given month."""
    data = request.json or {}
    month = data.get('month')
    if not month:
        from datetime import datetime
        month = datetime.now().strftime('%Y-%m')

    db = get_db()
    clients = dicts_from_rows(db.execute(
        "SELECT id, monthly_value, billing_start_date FROM clients ORDER BY name"
    ).fetchall())

    created = 0
    skipped = 0
    for c in clients:
        # Skip if no monthly value set
        if not c.get('monthly_value'):
            skipped += 1
            continue

        # Skip if billing hasn't started yet
        start = c.get('billing_start_date', '')
        if start and start > month + '-31':
            skipped += 1
            continue

        # Check if invoice already exists
        existing = db.execute(
            "SELECT id FROM invoices WHERE client_id=? AND month=?", (c['id'], month)
        ).fetchone()
        if existing:
            skipped += 1
            continue

        db.execute(
            "INSERT INTO invoices (client_id, amount, month) VALUES (?,?,?)",
            (c['id'], c['monthly_value'], month)
        )
        created += 1

    db.commit()
    db.close()
    return jsonify({'success': True, 'created': created, 'skipped': skipped})
