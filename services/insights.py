"""Fetch real engagement metrics from social media platform APIs."""
import json
import requests
from models import get_db, dict_from_row, dicts_from_rows


def fetch_instagram_insights(access_token, media_id):
    """Fetch insights for an Instagram media post using the Graph API."""
    try:
        # Get basic media metrics
        url = f"https://graph.facebook.com/v18.0/{media_id}"
        resp = requests.get(url, params={
            'fields': 'like_count,comments_count,timestamp,media_type',
            'access_token': access_token
        }, timeout=15)
        data = resp.json()

        if 'error' in data:
            return {'success': False, 'error': data['error'].get('message', 'API error')}

        result = {
            'likes': data.get('like_count', 0),
            'comments': data.get('comments_count', 0),
        }

        # Get detailed insights (impressions, reach, saved, shares)
        insights_url = f"https://graph.facebook.com/v18.0/{media_id}/insights"
        metrics = 'impressions,reach,saved,shares'
        media_type = data.get('media_type', '')
        if media_type in ('VIDEO', 'REELS'):
            metrics += ',plays,video_views'

        insights_resp = requests.get(insights_url, params={
            'metric': metrics,
            'access_token': access_token
        }, timeout=15)
        insights_data = insights_resp.json()

        if 'data' in insights_data:
            for metric in insights_data['data']:
                name = metric.get('name', '')
                value = metric.get('values', [{}])[0].get('value', 0)
                if name == 'impressions':
                    result['impressions'] = value
                elif name == 'reach':
                    result['reach'] = value
                elif name == 'saved':
                    result['saves'] = value
                elif name == 'shares':
                    result['shares'] = value
                elif name in ('plays', 'video_views'):
                    result['video_views'] = value

        # Calculate engagement rate
        reach = result.get('reach', 0) or result.get('impressions', 0)
        if reach > 0:
            engagement = result.get('likes', 0) + result.get('comments', 0) + result.get('saves', 0) + result.get('shares', 0)
            result['engagement_rate'] = round((engagement / reach) * 100, 2)

        result['success'] = True
        result['raw_data'] = json.dumps({**data, 'insights': insights_data.get('data', [])})
        return result

    except Exception as e:
        return {'success': False, 'error': str(e)}


def fetch_facebook_insights(access_token, post_id):
    """Fetch insights for a Facebook page post."""
    try:
        # Get post metrics
        url = f"https://graph.facebook.com/v18.0/{post_id}"
        resp = requests.get(url, params={
            'fields': 'shares,likes.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total)',
            'access_token': access_token
        }, timeout=15)
        data = resp.json()

        if 'error' in data:
            return {'success': False, 'error': data['error'].get('message', 'API error')}

        result = {
            'likes': data.get('likes', {}).get('summary', {}).get('total_count', 0),
            'comments': data.get('comments', {}).get('summary', {}).get('total_count', 0),
            'shares': data.get('shares', {}).get('count', 0),
        }

        # Parse insights
        insights = data.get('insights', {}).get('data', [])
        for metric in insights:
            name = metric.get('name', '')
            values = metric.get('values', [{}])
            value = values[0].get('value', 0) if values else 0
            if name == 'post_impressions':
                result['impressions'] = value
            elif name == 'post_impressions_unique':
                result['reach'] = value
            elif name == 'post_clicks':
                result['clicks'] = value

        reach = result.get('reach', 0) or result.get('impressions', 0)
        if reach > 0:
            engagement = result.get('likes', 0) + result.get('comments', 0) + result.get('shares', 0)
            result['engagement_rate'] = round((engagement / reach) * 100, 2)

        result['success'] = True
        result['raw_data'] = json.dumps(data)
        return result

    except Exception as e:
        return {'success': False, 'error': str(e)}


def fetch_linkedin_insights(access_token, post_urn):
    """Fetch insights for a LinkedIn post."""
    try:
        # LinkedIn social actions (likes, comments)
        encoded_urn = requests.utils.quote(post_urn, safe='')
        stats_url = f"https://api.linkedin.com/v2/socialActions/{encoded_urn}"
        resp = requests.get(stats_url, headers={
            'Authorization': f'Bearer {access_token}',
            'X-Restli-Protocol-Version': '2.0.0'
        }, timeout=15)

        result = {'likes': 0, 'comments': 0, 'shares': 0, 'impressions': 0}

        if resp.status_code == 200:
            data = resp.json()
            result['likes'] = data.get('likesSummary', {}).get('totalLikes', 0)
            result['comments'] = data.get('commentsSummary', {}).get('totalFirstLevelComments', 0)

        # Try to get share statistics
        share_url = f"https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&shares[0]={post_urn}"
        share_resp = requests.get(share_url, headers={
            'Authorization': f'Bearer {access_token}',
            'X-Restli-Protocol-Version': '2.0.0'
        }, timeout=15)
        if share_resp.status_code == 200:
            share_data = share_resp.json()
            elements = share_data.get('elements', [])
            if elements:
                stats = elements[0].get('totalShareStatistics', {})
                result['impressions'] = stats.get('impressionCount', 0)
                result['clicks'] = stats.get('clickCount', 0)
                result['shares'] = stats.get('shareCount', 0)
                result['engagement_rate'] = round(stats.get('engagement', 0) * 100, 2)

        result['success'] = True
        result['raw_data'] = json.dumps(result)
        return result

    except Exception as e:
        return {'success': False, 'error': str(e)}


def sync_post_insights(post_id):
    """Fetch and store insights for a specific post from all its platforms."""
    db = get_db()

    # Get the post and its log entries (which have the external post IDs)
    post = dict_from_row(db.execute(
        "SELECT sp.*, c.name as client_name FROM scheduled_posts sp LEFT JOIN clients c ON sp.client_id = c.id WHERE sp.id=?",
        (post_id,)
    ).fetchone())

    if not post:
        db.close()
        return {'success': False, 'error': 'Post not found'}

    logs = dicts_from_rows(db.execute(
        "SELECT * FROM post_logs WHERE post_id=? AND status='success'",
        (post_id,)
    ).fetchall())

    results = {}
    for log in logs:
        platform = log.get('platform', '').strip()
        response_str = log.get('response', '{}')

        # Extract external post_id from response
        try:
            resp_data = eval(response_str) if response_str.startswith('{') else {}
        except Exception:
            resp_data = {}

        external_id = log.get('external_post_id') or resp_data.get('post_id', '')
        if not external_id:
            continue

        # Get account token
        account = None
        if post.get('client_id'):
            account = dict_from_row(db.execute(
                "SELECT * FROM accounts WHERE client_id=? AND platform=? AND is_active=1",
                (post['client_id'], platform)
            ).fetchone())

        if not account or not account.get('access_token'):
            results[platform] = {'success': False, 'error': 'No token'}
            continue

        token = account['access_token']

        # Fetch from the right platform
        if platform == 'instagram':
            data = fetch_instagram_insights(token, external_id)
        elif platform == 'facebook':
            data = fetch_facebook_insights(token, external_id)
        elif platform == 'linkedin':
            data = fetch_linkedin_insights(token, external_id)
        else:
            data = {'success': False, 'error': f'Unsupported platform: {platform}'}

        if data.get('success'):
            # Upsert into post_insights
            db.execute("""
                INSERT INTO post_insights (post_id, platform, external_post_id, impressions, reach,
                    likes, comments, shares, saves, clicks, engagement_rate, video_views, raw_data, fetched_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
                ON CONFLICT(post_id, platform) DO UPDATE SET
                    impressions=excluded.impressions, reach=excluded.reach,
                    likes=excluded.likes, comments=excluded.comments,
                    shares=excluded.shares, saves=excluded.saves,
                    clicks=excluded.clicks, engagement_rate=excluded.engagement_rate,
                    video_views=excluded.video_views, raw_data=excluded.raw_data,
                    fetched_at=datetime('now')
            """, (
                post_id, platform, external_id,
                data.get('impressions', 0), data.get('reach', 0),
                data.get('likes', 0), data.get('comments', 0),
                data.get('shares', 0), data.get('saves', 0),
                data.get('clicks', 0), data.get('engagement_rate', 0),
                data.get('video_views', 0), data.get('raw_data', '{}')
            ))
            db.commit()

        results[platform] = data

    db.close()
    return {'success': True, 'platforms': results}


def sync_all_recent_insights():
    """Sync insights for all published posts from the last 30 days."""
    db = get_db()
    posts = dicts_from_rows(db.execute("""
        SELECT id FROM scheduled_posts
        WHERE status='posted' AND workflow_status='posted'
        AND COALESCE(scheduled_at, created_at) >= datetime('now', '-30 days')
    """).fetchall())
    db.close()

    synced = 0
    for post in posts:
        try:
            result = sync_post_insights(post['id'])
            if result.get('success'):
                synced += 1
        except Exception:
            pass

    return {'synced': synced, 'total': len(posts)}
