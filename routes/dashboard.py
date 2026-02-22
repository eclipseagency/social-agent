from flask import Blueprint, render_template

dashboard_bp = Blueprint('dashboard', __name__, template_folder='../templates', static_folder='../static')


@dashboard_bp.route('/')
def overview():
    return render_template('dashboard/overview.html', active_page='overview')


@dashboard_bp.route('/clients')
def clients():
    return render_template('dashboard/clients.html', active_page='clients')


@dashboard_bp.route('/clients/<int:client_id>')
def client_detail(client_id):
    return render_template('dashboard/client_detail.html', active_page='clients', client_id=client_id)


@dashboard_bp.route('/new-post')
def new_post():
    return render_template('dashboard/new_post.html', active_page='new-post')


@dashboard_bp.route('/pipeline')
def pipeline():
    return render_template('dashboard/pipeline.html', active_page='pipeline')


@dashboard_bp.route('/tasks')
def tasks():
    return render_template('dashboard/tasks.html', active_page='tasks')


@dashboard_bp.route('/calendar')
def calendar():
    return render_template('dashboard/calendar.html', active_page='calendar')


@dashboard_bp.route('/analytics')
def analytics():
    return render_template('dashboard/analytics.html', active_page='analytics')


@dashboard_bp.route('/scheduled')
def scheduled():
    return render_template('dashboard/scheduled.html', active_page='scheduled')


@dashboard_bp.route('/team')
def team():
    return render_template('dashboard/team.html', active_page='team')


@dashboard_bp.route('/settings')
def settings():
    return render_template('dashboard/settings.html', active_page='settings')


@dashboard_bp.route('/notifications')
def notifications():
    return render_template('dashboard/notifications.html', active_page='notifications')


@dashboard_bp.route('/briefs')
def briefs():
    return render_template('dashboard/briefs.html', active_page='briefs')


@dashboard_bp.route('/reports')
def reports():
    return render_template('dashboard/reports.html', active_page='reports')


@dashboard_bp.route('/login')
def login_page():
    return render_template('auth/login.html')


@dashboard_bp.route('/story-designer')
def story_designer():
    from flask import send_from_directory
    import os
    dashboard_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dashboard')
    return send_from_directory(dashboard_dir, 'story-designer.html')
