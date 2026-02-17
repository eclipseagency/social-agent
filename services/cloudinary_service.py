import cloudinary
import cloudinary.uploader
import os


def init_cloudinary():
    cloudinary.config(
        cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
        api_key=os.getenv('CLOUDINARY_API_KEY'),
        api_secret=os.getenv('CLOUDINARY_API_SECRET')
    )


def upload_image(file_path_or_stream, folder='social_agent'):
    result = cloudinary.uploader.upload(
        file_path_or_stream,
        folder=folder,
        resource_type='image'
    )
    return {
        'url': result['secure_url'],
        'public_id': result['public_id'],
        'filename': result.get('original_filename', ''),
        'width': result.get('width'),
        'height': result.get('height')
    }


def upload_video(file_path_or_stream, folder='social_agent'):
    result = cloudinary.uploader.upload(
        file_path_or_stream,
        folder=folder,
        resource_type='video'
    )
    return {
        'url': result['secure_url'],
        'public_id': result['public_id'],
        'filename': result.get('original_filename', ''),
        'duration': result.get('duration'),
        'format': result.get('format')
    }
