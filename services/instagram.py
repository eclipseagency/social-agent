import requests
import time


def post_image(access_token, account_id, image_url, caption=''):
    """Post a single image to Instagram."""
    # Step 1: Create media container
    create_url = f"https://graph.facebook.com/v18.0/{account_id}/media"
    create_resp = requests.post(create_url, data={
        'image_url': image_url,
        'caption': caption,
        'access_token': access_token
    })
    create_data = create_resp.json()
    if 'id' not in create_data:
        return {'success': False, 'error': create_data.get('error', {}).get('message', 'Failed to create media container')}

    container_id = create_data['id']

    # Step 2: Publish
    publish_url = f"https://graph.facebook.com/v18.0/{account_id}/media_publish"
    pub_resp = requests.post(publish_url, data={
        'creation_id': container_id,
        'access_token': access_token
    })
    pub_data = pub_resp.json()
    if 'id' in pub_data:
        return {'success': True, 'post_id': pub_data['id'], 'type': 'image'}
    return {'success': False, 'error': pub_data.get('error', {}).get('message', 'Failed to publish')}


def post_carousel(access_token, account_id, image_urls, caption=''):
    """Post a carousel (multiple images) to Instagram."""
    children_ids = []
    for url in image_urls:
        create_url = f"https://graph.facebook.com/v18.0/{account_id}/media"
        resp = requests.post(create_url, data={
            'image_url': url,
            'is_carousel_item': 'true',
            'access_token': access_token
        })
        data = resp.json()
        if 'id' not in data:
            return {'success': False, 'error': f'Failed to create carousel item: {data.get("error", {}).get("message", "")}'}
        children_ids.append(data['id'])

    # Create carousel container
    create_url = f"https://graph.facebook.com/v18.0/{account_id}/media"
    resp = requests.post(create_url, data={
        'media_type': 'CAROUSEL',
        'children': ','.join(children_ids),
        'caption': caption,
        'access_token': access_token
    })
    data = resp.json()
    if 'id' not in data:
        return {'success': False, 'error': data.get('error', {}).get('message', 'Failed to create carousel')}

    container_id = data['id']

    # Publish
    publish_url = f"https://graph.facebook.com/v18.0/{account_id}/media_publish"
    pub_resp = requests.post(publish_url, data={
        'creation_id': container_id,
        'access_token': access_token
    })
    pub_data = pub_resp.json()
    if 'id' in pub_data:
        return {'success': True, 'post_id': pub_data['id'], 'type': 'carousel'}
    return {'success': False, 'error': pub_data.get('error', {}).get('message', 'Failed to publish carousel')}


def post_story(access_token, account_id, image_url):
    """Post a story to Instagram."""
    create_url = f"https://graph.facebook.com/v18.0/{account_id}/media"
    create_resp = requests.post(create_url, data={
        'image_url': image_url,
        'media_type': 'STORIES',
        'access_token': access_token
    })
    create_data = create_resp.json()
    if 'id' not in create_data:
        return {'success': False, 'error': create_data.get('error', {}).get('message', 'Failed to create story')}

    container_id = create_data['id']

    publish_url = f"https://graph.facebook.com/v18.0/{account_id}/media_publish"
    pub_resp = requests.post(publish_url, data={
        'creation_id': container_id,
        'access_token': access_token
    })
    pub_data = pub_resp.json()
    if 'id' in pub_data:
        return {'success': True, 'post_id': pub_data['id'], 'type': 'story'}
    return {'success': False, 'error': pub_data.get('error', {}).get('message', 'Failed to publish story')}


def post_reel(access_token, account_id, video_url, caption=''):
    """Post a reel (video) to Instagram."""
    create_url = f"https://graph.facebook.com/v18.0/{account_id}/media"
    create_resp = requests.post(create_url, data={
        'video_url': video_url,
        'media_type': 'REELS',
        'caption': caption,
        'access_token': access_token
    })
    create_data = create_resp.json()
    if 'id' not in create_data:
        return {'success': False, 'error': create_data.get('error', {}).get('message', 'Failed to create reel')}

    container_id = create_data['id']

    # Wait for video processing
    for _ in range(30):
        status_url = f"https://graph.facebook.com/v18.0/{container_id}"
        status_resp = requests.get(status_url, params={
            'fields': 'status_code',
            'access_token': access_token
        })
        status_data = status_resp.json()
        if status_data.get('status_code') == 'FINISHED':
            break
        if status_data.get('status_code') == 'ERROR':
            return {'success': False, 'error': 'Video processing failed'}
        time.sleep(2)

    publish_url = f"https://graph.facebook.com/v18.0/{account_id}/media_publish"
    pub_resp = requests.post(publish_url, data={
        'creation_id': container_id,
        'access_token': access_token
    })
    pub_data = pub_resp.json()
    if 'id' in pub_data:
        return {'success': True, 'post_id': pub_data['id'], 'type': 'video'}
    return {'success': False, 'error': pub_data.get('error', {}).get('message', 'Failed to publish reel')}
