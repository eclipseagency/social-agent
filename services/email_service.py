import os
import smtplib
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _get_smtp_config():
    return {
        'host': os.getenv('SMTP_HOST', ''),
        'port': int(os.getenv('SMTP_PORT', '587')),
        'user': os.getenv('SMTP_USER', ''),
        'password': os.getenv('SMTP_PASSWORD', ''),
        'from_name': os.getenv('SMTP_FROM_NAME', 'Eclipse Agency'),
        'from_email': os.getenv('SMTP_FROM_EMAIL', ''),
    }


def is_email_configured():
    cfg = _get_smtp_config()
    return bool(cfg['host'] and cfg['user'] and cfg['password'])


def send_email(to_email, subject, html_body):
    """Send an email in a background thread to avoid blocking the request."""
    if not is_email_configured() or not to_email:
        return

    def _send():
        try:
            cfg = _get_smtp_config()
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{cfg['from_name']} <{cfg['from_email'] or cfg['user']}>"
            msg['To'] = to_email
            msg.attach(MIMEText(html_body, 'html'))

            with smtplib.SMTP(cfg['host'], cfg['port']) as server:
                server.starttls()
                server.login(cfg['user'], cfg['password'])
                server.sendmail(msg['From'], [to_email], msg.as_string())
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send to {to_email}: {e}")

    threading.Thread(target=_send, daemon=True).start()


def notify_workflow_change(post, from_status, to_status, actor_name, db):
    """Send email notifications for workflow transitions to relevant users."""
    if not is_email_configured():
        return

    topic = post.get('topic', 'Untitled')
    if len(topic) > 60:
        topic = topic[:57] + '...'
    client_name = post.get('client_name', '')

    status_labels = {
        'draft': 'Draft', 'pending_review': 'Pending Review',
        'in_design': 'In Design', 'approved': 'Approved',
        'scheduled': 'Scheduled', 'posted': 'Posted'
    }
    to_label = status_labels.get(to_status, to_status)

    subject = f"[Eclipse] Post moved to {to_label} — {client_name}"
    body = f"""
    <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2 style="color:#6366f1;margin-bottom:16px">Post Status Update</h2>
        <p><strong>{actor_name}</strong> moved a post to <strong>{to_label}</strong></p>
        <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0 0 8px"><strong>Account:</strong> {client_name}</p>
            <p style="margin:0 0 8px"><strong>Post:</strong> {topic}</p>
            <p style="margin:0"><strong>Status:</strong> {from_status} → {to_label}</p>
        </div>
        <p style="color:#64748b;font-size:12px">Eclipse Agency Platform</p>
    </div>
    """

    # Determine who to notify based on the transition
    notify_user_ids = set()

    if to_status == 'in_design':
        # Notify designer
        if post.get('assigned_designer_id'):
            notify_user_ids.add(post['assigned_designer_id'])
        if post.get('assigned_motion_id'):
            notify_user_ids.add(post['assigned_motion_id'])

    elif to_status == 'pending_review':
        # Notify manager
        if post.get('assigned_manager_id'):
            notify_user_ids.add(post['assigned_manager_id'])

    elif to_status == 'approved':
        # Notify SM specialist and manager
        if post.get('assigned_sm_id'):
            notify_user_ids.add(post['assigned_sm_id'])
        if post.get('assigned_manager_id'):
            notify_user_ids.add(post['assigned_manager_id'])

    elif to_status == 'posted':
        # Notify SM specialist
        if post.get('assigned_sm_id'):
            notify_user_ids.add(post['assigned_sm_id'])

    # Fetch emails and send
    if notify_user_ids:
        from models import dicts_from_rows
        placeholders = ','.join(['?'] * len(notify_user_ids))
        users = dicts_from_rows(
            db.execute(f"SELECT email FROM users WHERE id IN ({placeholders}) AND email IS NOT NULL",
                       list(notify_user_ids)).fetchall()
        )
        for u in users:
            if u.get('email'):
                send_email(u['email'], subject, body)
