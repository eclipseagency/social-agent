import os
from datetime import datetime
from models import get_db, dicts_from_rows
from services import instagram, linkedin, facebook


def get_account_for_client(client_id, platform):
    """Get the active account for a client on a specific platform."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM accounts WHERE client_id=? AND platform=? AND is_active=1",
        (client_id, platform)
    ).fetchone()
    db.close()
    if row:
        return dict(row)
    return None


def publish_post(post):
    """Publish a single post to its platform."""
    post_id = post['id']
    client_id = post['client_id']
    platforms_str = post.get('platforms', '')
    caption = post.get('caption', '') or post.get('topic', '')
    image_url = post.get('image_url', '')
    post_type = post.get('post_type', 'post')

    image_urls = [u.strip() for u in image_url.split(',') if u.strip()] if image_url else []

    db = get_db()
    results = {}

    for platform in platforms_str.split(','):
        platform = platform.strip()
        if not platform:
            continue

        # Normalize platform names
        base_platform = platform.replace('_story', '').replace('_reel', '')
        is_story = 'story' in platform or post_type == 'story'

        account = get_account_for_client(client_id, base_platform)
        if not account:
            # Fall back to env tokens
            account = _get_env_account(base_platform)

        if not account:
            result = {'success': False, 'error': f'No account found for {base_platform}'}
        else:
            try:
                result = _publish_to_platform(base_platform, account, image_urls, caption, is_story, post_type)
            except Exception as e:
                result = {'success': False, 'error': str(e)}

        # Log the result
        db.execute(
            "INSERT INTO post_logs (post_id, platform, status, response) VALUES (?,?,?,?)",
            (post_id, platform, 'success' if result.get('success') else 'failed', str(result))
        )
        results[platform] = result

    # Update post status
    all_success = all(r.get('success') for r in results.values()) if results else False
    new_status = 'posted' if all_success else 'failed'
    db.execute("UPDATE scheduled_posts SET status=? WHERE id=?", (new_status, post_id))
    db.commit()
    db.close()

    return results


def _get_env_account(platform):
    """Get account credentials from environment variables."""
    if platform == 'instagram':
        token = os.getenv('INSTAGRAM_ACCESS_TOKEN')
        acct_id = os.getenv('INSTAGRAM_ACCOUNT_ID')
        if token and acct_id:
            return {'access_token': token, 'account_id': acct_id, 'platform': 'instagram'}
    elif platform == 'linkedin':
        token = os.getenv('LINKEDIN_ACCESS_TOKEN')
        if token:
            return {'access_token': token, 'platform': 'linkedin'}
    elif platform == 'facebook':
        token = os.getenv('FACEBOOK_ACCESS_TOKEN')
        page_id = os.getenv('FACEBOOK_PAGE_ID')
        if token and page_id:
            return {'access_token': token, 'account_id': page_id, 'platform': 'facebook'}
    return None


def _publish_to_platform(platform, account, image_urls, caption, is_story, post_type):
    """Publish to a specific platform."""
    token = account.get('access_token', '')
    acct_id = account.get('account_id', '')

    # Check if there's a video URL
    video_url = None
    if image_urls and any(ext in image_urls[0].lower() for ext in ['.mp4', '.mov', '.avi', '/video/']):
        video_url = image_urls[0]
        image_urls = []

    if platform == 'instagram':
        if is_story and image_urls:
            return instagram.post_story(token, acct_id, image_urls[0])
        elif video_url:
            return instagram.post_reel(token, acct_id, video_url, caption)
        elif len(image_urls) > 1:
            return instagram.post_carousel(token, acct_id, image_urls, caption)
        elif image_urls:
            return instagram.post_image(token, acct_id, image_urls[0], caption)
        else:
            return {'success': False, 'error': 'Instagram requires an image or video'}

    elif platform == 'linkedin':
        if video_url:
            return linkedin.post_video(token, video_url, caption)
        elif image_urls:
            return linkedin.post_image(token, image_urls[0], caption)
        else:
            return linkedin.post_text(token, caption)

    elif platform == 'facebook':
        if is_story and image_urls:
            return facebook.post_story(token, acct_id, image_urls[0])
        elif video_url:
            return facebook.post_video(token, acct_id, video_url, caption)
        elif len(image_urls) > 1:
            return facebook.post_multiple_images(token, acct_id, image_urls, caption)
        elif image_urls:
            return facebook.post_image(token, acct_id, image_urls[0], caption)
        else:
            return facebook.post_text(token, acct_id, caption)

    return {'success': False, 'error': f'Unknown platform: {platform}'}


def run_scheduler():
    """Check for posts that are due and publish them."""
    db = get_db()
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M')
    pending = dicts_from_rows(db.execute(
        "SELECT * FROM scheduled_posts WHERE status='pending' AND scheduled_at <= ?",
        (now,)
    ).fetchall())
    db.close()

    results = []
    for post in pending:
        r = publish_post(post)
        results.append({'post_id': post['id'], 'results': r})
    return results


def force_publish_all():
    """Publish all pending posts regardless of schedule time."""
    db = get_db()
    pending = dicts_from_rows(db.execute(
        "SELECT * FROM scheduled_posts WHERE status='pending'"
    ).fetchall())
    db.close()

    published = 0
    failed = 0
    for post in pending:
        r = publish_post(post)
        if all(v.get('success') for v in r.values()):
            published += 1
        else:
            failed += 1
    return {'published': published, 'failed': failed, 'total': len(pending)}
