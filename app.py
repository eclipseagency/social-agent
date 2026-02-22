"""
Social Agent - Agency Workflow Management System
Flask backend replacing the original AI-Social-Agent.exe
"""
import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# Initialize Cloudinary
from services.cloudinary_service import init_cloudinary
init_cloudinary()

# Run database migrations
from migrations import run_migrations
run_migrations()

# Create Flask app
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.secret_key = os.getenv('SECRET_KEY', 'social-agent-secret-key-change-in-production')
CORS(app)

# Register API blueprints
from routes.auth import auth_bp
from routes.clients import clients_bp
from routes.posts import posts_bp
from routes.upload import upload_bp
from routes.analytics import analytics_bp
from routes.tasks import tasks_bp
from routes.posting_rules import posting_rules_bp
from routes.notifications import notifications_bp
from routes.briefs import briefs_bp
from routes.reports import reports_bp

app.register_blueprint(auth_bp)
app.register_blueprint(clients_bp)
app.register_blueprint(posts_bp)
app.register_blueprint(upload_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(posting_rules_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(briefs_bp)
app.register_blueprint(reports_bp)

# Register page-rendering blueprint
from routes.dashboard import dashboard_bp
app.register_blueprint(dashboard_bp)

# Serve legacy dashboard files and uploads
DASHBOARD_DIR = os.path.join(BASE_DIR, 'dashboard')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')


@app.route('/dashboard/<path:filename>')
def serve_dashboard(filename):
    return send_from_directory(DASHBOARD_DIR, filename)


@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOADS_DIR, filename)


# APScheduler - check for due posts every 60 seconds
def scheduled_job():
    from services.scheduler import run_scheduler
    try:
        results = run_scheduler()
        if results:
            print(f"[Scheduler] Published {len(results)} posts")
    except Exception as e:
        print(f"[Scheduler] Error: {e}")


scheduler = BackgroundScheduler()
scheduler.add_job(scheduled_job, 'interval', seconds=60)
scheduler.start()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"\n{'='*50}")
    print(f"  Social Agent - Agency Workflow System")
    print(f"  Running on http://localhost:{port}")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
