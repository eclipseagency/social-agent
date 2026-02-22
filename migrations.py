"""Database migration system for social_agent.

Extends the existing SQLite schema with new tables and columns for
the agency workflow management features.
"""
from models import get_db
from werkzeug.security import generate_password_hash


def get_schema_version(db):
    try:
        row = db.execute("SELECT MAX(version) as v FROM schema_version").fetchone()
        return row['v'] if row['v'] is not None else 0
    except Exception:
        return 0


def set_schema_version(db, version):
    db.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (?)", (version,))
    db.commit()


def column_exists(db, table, column):
    cols = db.execute(f"PRAGMA table_info({table})").fetchall()
    return any(c['name'] == column for c in cols)


def table_exists(db, table):
    row = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _create_base_tables(db):
    """Create core tables if they don't exist (originally created by the exe)."""
    db.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        dark_mode INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        company TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        platform TEXT NOT NULL,
        account_name TEXT,
        access_token TEXT,
        refresh_token TEXT,
        account_id TEXT,
        token_expires_at TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients (id)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS scheduled_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        topic TEXT,
        caption TEXT,
        image_url TEXT,
        platforms TEXT,
        scheduled_at TIMESTAMP,
        status TEXT DEFAULT 'pending',
        image_size TEXT DEFAULT '1080x1080',
        post_type TEXT DEFAULT 'post',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients (id)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS post_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        platform TEXT,
        status TEXT,
        response TEXT,
        posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES scheduled_posts (id)
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS notification_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email_on_post INTEGER DEFAULT 1,
        email_on_fail INTEGER DEFAULT 1,
        email_daily_report INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )""")
    db.commit()
    print("Base tables verified.")


def run_migrations():
    db = get_db()

    # Create base tables if they don't exist
    _create_base_tables(db)

    # Create schema_version table
    db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)")
    db.commit()

    version = get_schema_version(db)
    print(f"Current schema version: {version}")

    if version < 1:
        print("Running migration 1: Extend users table...")
        _migration_1_extend_users(db)
        set_schema_version(db, 1)

    if version < 2:
        print("Running migration 2: Extend posts table for content briefs...")
        _migration_2_extend_posts(db)
        set_schema_version(db, 2)

    if version < 3:
        print("Running migration 3: Create tasks tables...")
        _migration_3_create_tasks(db)
        set_schema_version(db, 3)

    if version < 4:
        print("Running migration 4: Create posting rules table...")
        _migration_4_create_posting_rules(db)
        set_schema_version(db, 4)

    if version < 5:
        print("Running migration 5: Create notifications table...")
        _migration_5_create_notifications(db)
        set_schema_version(db, 5)

    if version < 6:
        print("Running migration 6: Create post comments and workflow history...")
        _migration_6_create_workflow(db)
        set_schema_version(db, 6)

    if version < 7:
        print("Running migration 7: Migrate existing post statuses...")
        _migration_7_migrate_statuses(db)
        set_schema_version(db, 7)

    if version < 8:
        print("Running migration 8: Add color to clients...")
        _migration_8_client_color(db)
        set_schema_version(db, 8)

    if version < 9:
        print("Running migration 9: Create content briefs table...")
        _migration_9_content_briefs(db)
        set_schema_version(db, 9)

    if version < 10:
        print("Running migration 10: Create brief_posts table...")
        _migration_10_brief_posts(db)
        set_schema_version(db, 10)

    if version < 11:
        print("Running migration 11: Add post_id to tasks...")
        _migration_11_task_post_id(db)
        set_schema_version(db, 11)

    if version < 12:
        print("Running migration 12: Add brief_id to tasks...")
        _migration_12_task_brief_id(db)
        set_schema_version(db, 12)

    if version < 13:
        print("Running migration 13: Ensure default admin user exists...")
        _migration_13_ensure_admin(db)
        set_schema_version(db, 13)


    final_version = get_schema_version(db)
    print(f"Migrations complete. Schema version: {final_version}")
    db.close()


def _migration_1_extend_users(db):
    if not column_exists(db, 'users', 'job_title'):
        db.execute("ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''")
    if not column_exists(db, 'users', 'phone'):
        db.execute("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''")
    if not column_exists(db, 'users', 'avatar_url'):
        db.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''")
    db.commit()


def _migration_2_extend_posts(db):
    new_cols = [
        ("tov", "TEXT DEFAULT ''"),
        ("design_reference_urls", "TEXT DEFAULT ''"),
        ("design_output_urls", "TEXT DEFAULT ''"),
        ("video_output_url", "TEXT DEFAULT ''"),
        ("workflow_status", "TEXT DEFAULT 'draft'"),
        ("assigned_designer_id", "INTEGER"),
        ("assigned_motion_id", "INTEGER"),
        ("assigned_sm_id", "INTEGER"),
        ("created_by_id", "INTEGER"),
        ("approved_by_id", "INTEGER"),
        ("approved_at", "TEXT"),
        ("priority", "TEXT DEFAULT 'normal'"),
        ("brief_notes", "TEXT DEFAULT ''"),
        ("revision_count", "INTEGER DEFAULT 0"),
        ("updated_at", "TEXT"),
    ]
    for col_name, col_def in new_cols:
        if not column_exists(db, 'scheduled_posts', col_name):
            db.execute(f"ALTER TABLE scheduled_posts ADD COLUMN {col_name} {col_def}")
    db.commit()


def _migration_3_create_tasks(db):
    if not table_exists(db, 'tasks'):
        db.execute("""
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                client_id INTEGER REFERENCES clients(id),
                assigned_to_id INTEGER REFERENCES users(id),
                created_by_id INTEGER NOT NULL REFERENCES users(id),
                status TEXT DEFAULT 'todo',
                priority TEXT DEFAULT 'normal',
                due_date TEXT,
                category TEXT DEFAULT 'general',
                attachment_urls TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                completed_at TEXT
            )
        """)

    if not table_exists(db, 'task_comments'):
        db.execute("""
            CREATE TABLE task_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                attachment_urls TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
    db.commit()


def _migration_4_create_posting_rules(db):
    if not table_exists(db, 'client_posting_rules'):
        db.execute("""
            CREATE TABLE client_posting_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                platform TEXT NOT NULL,
                posting_days TEXT NOT NULL,
                posting_hours TEXT NOT NULL,
                posts_per_day INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
    db.commit()


def _migration_5_create_notifications(db):
    if not table_exists(db, 'notifications'):
        db.execute("""
            CREATE TABLE notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT DEFAULT '',
                reference_type TEXT,
                reference_id INTEGER,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
    db.commit()


def _migration_6_create_workflow(db):
    if not table_exists(db, 'post_comments'):
        db.execute("""
            CREATE TABLE post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                comment_type TEXT DEFAULT 'comment',
                attachment_urls TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

    if not table_exists(db, 'workflow_history'):
        db.execute("""
            CREATE TABLE workflow_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER REFERENCES scheduled_posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                from_status TEXT,
                to_status TEXT NOT NULL,
                comment TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
    db.commit()


def _migration_7_migrate_statuses(db):
    """Migrate existing post statuses to workflow_status."""
    db.execute("UPDATE scheduled_posts SET workflow_status='posted' WHERE status='posted' AND (workflow_status IS NULL OR workflow_status='draft')")
    db.execute("UPDATE scheduled_posts SET workflow_status='scheduled' WHERE status='pending' AND (workflow_status IS NULL OR workflow_status='draft')")
    db.execute("UPDATE scheduled_posts SET workflow_status='failed' WHERE status='failed' AND (workflow_status IS NULL OR workflow_status='draft')")
    db.commit()


def _migration_8_client_color(db):
    if not column_exists(db, 'clients', 'color'):
        db.execute("ALTER TABLE clients ADD COLUMN color VARCHAR(7) DEFAULT '#6366f1'")
    db.commit()


def _migration_9_content_briefs(db):
    if not table_exists(db, 'content_briefs'):
        db.execute("""
            CREATE TABLE content_briefs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL REFERENCES clients(id),
                title VARCHAR(200) NOT NULL,
                description TEXT DEFAULT '',
                content_type VARCHAR(50) DEFAULT 'post',
                platform VARCHAR(50) DEFAULT '',
                target_date TEXT,
                reference_urls TEXT DEFAULT '[]',
                reference_files TEXT DEFAULT '[]',
                brand_guidelines TEXT DEFAULT '',
                status VARCHAR(30) DEFAULT 'new',
                created_by_id INTEGER REFERENCES users(id),
                assigned_writer_id INTEGER REFERENCES users(id),
                assigned_designer_id INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
    db.commit()


def _migration_10_brief_posts(db):
    if not table_exists(db, 'brief_posts'):
        db.execute("""
            CREATE TABLE brief_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                brief_id INTEGER NOT NULL REFERENCES content_briefs(id) ON DELETE CASCADE,
                post_id INTEGER NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE
            )
        """)
    db.commit()


def _migration_11_task_post_id(db):
    if not column_exists(db, 'tasks', 'post_id'):
        db.execute("ALTER TABLE tasks ADD COLUMN post_id INTEGER REFERENCES scheduled_posts(id)")
    db.commit()


def _migration_12_task_brief_id(db):
    if not column_exists(db, 'tasks', 'brief_id'):
        db.execute("ALTER TABLE tasks ADD COLUMN brief_id INTEGER REFERENCES content_briefs(id)")
    db.commit()


def _migration_13_ensure_admin(db):
    """Create a default admin user if no admin exists."""
    admin = db.execute("SELECT id FROM users WHERE role='admin'").fetchone()
    if not admin:
        import os
        admin_email = os.getenv('ADMIN_EMAIL', 'admin@eclipseagency.com')
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
        pw_hash = generate_password_hash(admin_password)
        db.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?,?,?,?)",
            ('admin', admin_email, pw_hash, 'admin')
        )
        db.commit()
        print(f"Default admin created: {admin_email}")
    else:
        print("Admin user already exists, skipping.")


if __name__ == '__main__':
    run_migrations()
