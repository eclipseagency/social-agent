import os
import uuid
from werkzeug.utils import secure_filename

# Base directory for uploads
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')


def init_cloudinary():
    """No-op: using local file storage instead of Cloudinary."""
    os.makedirs(UPLOADS_DIR, exist_ok=True)


def upload_image(file_stream, folder='social_agent'):
    """Save an uploaded image to local storage and return its URL."""
    # Map folder names to subdirectories
    subfolder = folder.replace('social_agent/', '').replace('social_agent', 'general')
    save_dir = os.path.join(UPLOADS_DIR, subfolder)
    os.makedirs(save_dir, exist_ok=True)

    # Get safe filename with unique prefix
    original_name = getattr(file_stream, 'filename', 'upload') or 'upload'
    safe_name = secure_filename(original_name)
    if not safe_name:
        safe_name = 'upload.jpg'
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"

    filepath = os.path.join(save_dir, unique_name)
    file_stream.save(filepath)

    url = f"/uploads/{subfolder}/{unique_name}"

    return {
        'url': url,
        'public_id': unique_name,
        'filename': original_name,
        'width': None,
        'height': None
    }


def upload_video(file_stream, folder='social_agent'):
    """Save an uploaded video to local storage and return its URL."""
    return upload_image(file_stream, folder)
