import requests


def post_image(access_token, page_id, image_url, caption=''):
    """Post an image to a Facebook page."""
    url = f"https://graph.facebook.com/v18.0/{page_id}/photos"
    resp = requests.post(url, data={
        'url': image_url,
        'message': caption,
        'access_token': access_token
    })
    data = resp.json()
    if 'id' in data:
        return {'success': True, 'post_id': data['id'], 'type': 'image'}
    return {'success': False, 'error': data.get('error', {}).get('message', 'Failed to post image')}


def post_text(access_token, page_id, text):
    """Post text to a Facebook page."""
    url = f"https://graph.facebook.com/v18.0/{page_id}/feed"
    resp = requests.post(url, data={
        'message': text,
        'access_token': access_token
    })
    data = resp.json()
    if 'id' in data:
        return {'success': True, 'post_id': data['id'], 'type': 'text'}
    return {'success': False, 'error': data.get('error', {}).get('message', 'Failed to post text')}


def post_video(access_token, page_id, video_url, caption=''):
    """Post a video to a Facebook page."""
    url = f"https://graph.facebook.com/v18.0/{page_id}/videos"
    resp = requests.post(url, data={
        'file_url': video_url,
        'description': caption,
        'access_token': access_token
    })
    data = resp.json()
    if 'id' in data:
        return {'success': True, 'post_id': data['id'], 'type': 'video'}
    return {'success': False, 'error': data.get('error', {}).get('message', 'Failed to post video')}


def post_story(access_token, page_id, image_url):
    """Post a story (photo) to a Facebook page."""
    url = f"https://graph.facebook.com/v18.0/{page_id}/photo_stories"
    # First upload the photo
    photo_url = f"https://graph.facebook.com/v18.0/{page_id}/photos"
    photo_resp = requests.post(photo_url, data={
        'url': image_url,
        'published': 'false',
        'access_token': access_token
    })
    photo_data = photo_resp.json()
    if 'id' not in photo_data:
        return {'success': False, 'error': 'Failed to upload story photo'}

    story_resp = requests.post(url, data={
        'photo_id': photo_data['id'],
        'access_token': access_token
    })
    story_data = story_resp.json()
    if 'id' in story_data:
        return {'success': True, 'post_id': story_data['id'], 'type': 'story'}
    return {'success': False, 'error': story_data.get('error', {}).get('message', 'Failed to publish story')}


def post_multiple_images(access_token, page_id, image_urls, caption=''):
    """Post multiple images to a Facebook page as a single post."""
    photo_ids = []
    for img_url in image_urls:
        url = f"https://graph.facebook.com/v18.0/{page_id}/photos"
        resp = requests.post(url, data={
            'url': img_url,
            'published': 'false',
            'access_token': access_token
        })
        data = resp.json()
        if 'id' in data:
            photo_ids.append(data['id'])

    if not photo_ids:
        return {'success': False, 'error': 'No photos uploaded'}

    feed_url = f"https://graph.facebook.com/v18.0/{page_id}/feed"
    post_data = {'message': caption, 'access_token': access_token}
    for i, pid in enumerate(photo_ids):
        post_data[f'attached_media[{i}]'] = f'{{"media_fbid":"{pid}"}}'

    resp = requests.post(feed_url, data=post_data)
    data = resp.json()
    if 'id' in data:
        return {'success': True, 'post_id': data['id'], 'type': 'carousel'}
    return {'success': False, 'error': data.get('error', {}).get('message', 'Failed to post multiple images')}
