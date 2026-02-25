import requests
import os


def _get_person_urn(access_token):
    """Get the authenticated user's LinkedIn URN."""
    resp = requests.get('https://api.linkedin.com/v2/userinfo', headers={
        'Authorization': f'Bearer {access_token}'
    }, timeout=30)
    data = resp.json()
    sub = data.get('sub')
    if sub:
        return f'urn:li:person:{sub}'
    return None


def post_text(access_token, text):
    """Post text-only to LinkedIn."""
    author = _get_person_urn(access_token)
    if not author:
        return {'success': False, 'error': 'Could not get LinkedIn user profile'}

    payload = {
        'author': author,
        'lifecycleState': 'PUBLISHED',
        'specificContent': {
            'com.linkedin.ugc.ShareContent': {
                'shareCommentary': {'text': text},
                'shareMediaCategory': 'NONE'
            }
        },
        'visibility': {'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'}
    }

    resp = requests.post('https://api.linkedin.com/v2/ugcPosts', json=payload, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
    }, timeout=30)

    if resp.status_code in (200, 201):
        return {'success': True, 'post_id': resp.headers.get('x-restli-id', ''), 'type': 'text'}
    return {'success': False, 'error': resp.json().get('message', f'Status {resp.status_code}')}


def post_image(access_token, image_url, text=''):
    """Post an image to LinkedIn using image URL."""
    author = _get_person_urn(access_token)
    if not author:
        return {'success': False, 'error': 'Could not get LinkedIn user profile'}

    # Register upload
    register_payload = {
        'registerUploadRequest': {
            'recipes': ['urn:li:digitalmediaRecipe:feedshare-image'],
            'owner': author,
            'serviceRelationships': [{
                'relationshipType': 'OWNER',
                'identifier': 'urn:li:userGeneratedContent'
            }]
        }
    }

    reg_resp = requests.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        json=register_payload,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        },
        timeout=30
    )

    if reg_resp.status_code not in (200, 201):
        return {'success': False, 'error': 'Failed to register upload'}

    reg_data = reg_resp.json()
    upload_url = reg_data['value']['uploadMechanism']['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']['uploadUrl']
    asset = reg_data['value']['asset']

    # Download image and upload to LinkedIn
    img_data = requests.get(image_url, timeout=30).content
    upload_resp = requests.put(upload_url, data=img_data, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/octet-stream'
    }, timeout=60)

    if upload_resp.status_code not in (200, 201):
        return {'success': False, 'error': 'Failed to upload image to LinkedIn'}

    # Create share
    share_payload = {
        'author': author,
        'lifecycleState': 'PUBLISHED',
        'specificContent': {
            'com.linkedin.ugc.ShareContent': {
                'shareCommentary': {'text': text},
                'shareMediaCategory': 'IMAGE',
                'media': [{
                    'status': 'READY',
                    'media': asset
                }]
            }
        },
        'visibility': {'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'}
    }

    resp = requests.post('https://api.linkedin.com/v2/ugcPosts', json=share_payload, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
    }, timeout=30)

    if resp.status_code in (200, 201):
        return {'success': True, 'post_id': resp.headers.get('x-restli-id', ''), 'type': 'image'}
    return {'success': False, 'error': resp.json().get('message', f'Status {resp.status_code}')}


def post_video(access_token, video_url, text=''):
    """Post a video to LinkedIn."""
    author = _get_person_urn(access_token)
    if not author:
        return {'success': False, 'error': 'Could not get LinkedIn user profile'}

    register_payload = {
        'registerUploadRequest': {
            'recipes': ['urn:li:digitalmediaRecipe:feedshare-video'],
            'owner': author,
            'serviceRelationships': [{
                'relationshipType': 'OWNER',
                'identifier': 'urn:li:userGeneratedContent'
            }]
        }
    }

    reg_resp = requests.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        json=register_payload,
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        },
        timeout=30
    )

    if reg_resp.status_code not in (200, 201):
        return {'success': False, 'error': 'Failed to register video upload'}

    reg_data = reg_resp.json()
    upload_url = reg_data['value']['uploadMechanism']['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']['uploadUrl']
    asset = reg_data['value']['asset']

    vid_data = requests.get(video_url, timeout=60).content
    upload_resp = requests.put(upload_url, data=vid_data, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/octet-stream'
    }, timeout=120)

    if upload_resp.status_code not in (200, 201):
        return {'success': False, 'error': 'Failed to upload video to LinkedIn'}

    share_payload = {
        'author': author,
        'lifecycleState': 'PUBLISHED',
        'specificContent': {
            'com.linkedin.ugc.ShareContent': {
                'shareCommentary': {'text': text},
                'shareMediaCategory': 'VIDEO',
                'media': [{
                    'status': 'READY',
                    'media': asset
                }]
            }
        },
        'visibility': {'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'}
    }

    resp = requests.post('https://api.linkedin.com/v2/ugcPosts', json=share_payload, headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
    }, timeout=30)

    if resp.status_code in (200, 201):
        return {'success': True, 'post_id': resp.headers.get('x-restli-id', ''), 'type': 'video'}
    return {'success': False, 'error': resp.json().get('message', f'Status {resp.status_code}')}
