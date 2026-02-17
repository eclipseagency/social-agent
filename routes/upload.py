from flask import Blueprint, request, jsonify
from services.cloudinary_service import upload_image, upload_video

upload_bp = Blueprint('upload', __name__)


@upload_bp.route('/api/upload', methods=['POST'])
def upload_single():
    """Upload a single file (used by story designer)."""
    if 'file' not in request.files and 'image' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files.get('file') or request.files.get('image')
    try:
        result = upload_image(file)
        return jsonify({'success': True, 'url': result['url'], 'filename': result['filename']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@upload_bp.route('/api/upload-multiple', methods=['POST'])
def upload_multiple():
    """Upload multiple images."""
    files = request.files.getlist('images')
    if not files:
        return jsonify({'error': 'No images provided'}), 400

    urls = []
    errors = []
    for f in files:
        try:
            result = upload_image(f)
            urls.append({'url': result['url'], 'filename': result['filename']})
        except Exception as e:
            errors.append({'filename': f.filename, 'error': str(e)})

    return jsonify({'urls': urls, 'errors': errors})


@upload_bp.route('/api/upload-video', methods=['POST'])
def upload_video_file():
    """Upload a video file."""
    if 'video' not in request.files:
        return jsonify({'error': 'No video provided'}), 400

    file = request.files['video']
    try:
        result = upload_video(file)
        return jsonify({
            'success': True,
            'url': result['url'],
            'filename': result['filename'],
            'duration': result.get('duration'),
            'format': result.get('format')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@upload_bp.route('/api/upload-design-reference', methods=['POST'])
def upload_design_reference():
    """Upload design reference images for content briefs."""
    files = request.files.getlist('images')
    if not files:
        return jsonify({'error': 'No images provided'}), 400

    urls = []
    errors = []
    for f in files:
        try:
            result = upload_image(f, folder='social_agent/references')
            urls.append({'url': result['url'], 'filename': result['filename']})
        except Exception as e:
            errors.append({'filename': f.filename, 'error': str(e)})

    return jsonify({'urls': urls, 'errors': errors})
