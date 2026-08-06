"""
Web Push Notifications module.
Manages push subscriptions and sends notifications to technicians and admins.
Compatible with smartwatches, phones, and desktops via Web Push API (VAPID).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import logging
import os
import json

logger = logging.getLogger(__name__)

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '').replace('\\n', '\n')
VAPID_SUBJECT = os.environ.get('VAPID_SUBJECT', 'mailto:admin@obelisco.pt')


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # {p256dh: str, auth: str}


class PushMessage(BaseModel):
    title: str
    body: str
    icon: Optional[str] = "/logo192.png"
    badge: Optional[str] = "/logo192.png"
    tag: Optional[str] = None
    url: Optional[str] = None
    vibrate: Optional[List[int]] = [200, 100, 200]


async def send_push_to_user(db, user_id: str, message: PushMessage):
    """Send push notification to all subscriptions of a user."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured — push skipped")
        return 0

    from pywebpush import webpush, WebPushException

    subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(50)
    sent = 0
    payload = json.dumps({
        "title": message.title,
        "body": message.body,
        "icon": message.icon,
        "badge": message.badge,
        "tag": message.tag,
        "url": message.url,
        "vibrate": message.vibrate,
    })

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"],
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                await db.push_subscriptions.delete_one({"_id": sub["_id"]})
                logger.info(f"Removed expired push subscription for user {user_id}")
            else:
                logger.warning(f"Push failed for {user_id}: {e}")
        except Exception as e:
            logger.warning(f"Push error: {e}")

    return sent


async def send_push_to_role(db, role: str, message: PushMessage):
    """Send push to all users with a specific role (e.g., 'admin')."""
    subs = await db.push_subscriptions.find({"role": role}).to_list(200)
    if not subs:
        return 0
    user_ids = list(set(s["user_id"] for s in subs))
    total = 0
    for uid in user_ids:
        total += await send_push_to_user(db, uid, message)
    return total


async def send_push_to_all_techs(db, message: PushMessage):
    """Send push to all technicians."""
    return await send_push_to_role(db, "tech", message)


def create_push_router(db, get_current_user):
    router = APIRouter(prefix="/api/push", tags=["push-notifications"])

    @router.get("/vapid-key")
    async def get_vapid_key():
        """Public: return VAPID public key for push subscription."""
        return {"publicKey": VAPID_PUBLIC_KEY}

    @router.post("/subscribe")
    async def subscribe(sub: PushSubscription, user=Depends(get_current_user)):
        """Register push subscription for authenticated user."""
        user_id = str(user.get("sub") or user.get("id", ""))
        role = user.get("role", "tech")

        existing = await db.push_subscriptions.find_one({"endpoint": sub.endpoint})
        if existing:
            await db.push_subscriptions.update_one(
                {"endpoint": sub.endpoint},
                {"$set": {"user_id": user_id, "role": role, "keys": sub.keys, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        else:
            await db.push_subscriptions.insert_one({
                "user_id": user_id,
                "user_name": user.get("name", ""),
                "user_email": user.get("email", ""),
                "role": role,
                "endpoint": sub.endpoint,
                "keys": sub.keys,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return {"ok": True}

    @router.post("/unsubscribe")
    async def unsubscribe(sub: PushSubscription, user=Depends(get_current_user)):
        """Remove push subscription."""
        await db.push_subscriptions.delete_one({"endpoint": sub.endpoint})
        return {"ok": True}

    @router.post("/test")
    async def test_push(user=Depends(get_current_user)):
        """Send test push notification to current user."""
        user_id = str(user.get("sub") or user.get("id", ""))
        msg = PushMessage(
            title="Obelisco Radical",
            body="Notificações push ativas! Vai receber alertas de agenda, pedidos e tarefas.",
            tag="test",
            url="/tech",
        )
        sent = await send_push_to_user(db, user_id, msg)
        return {"sent": sent}

    @router.post("/broadcast")
    async def broadcast_push(message: PushMessage, user=Depends(get_current_user)):
        """Admin: send push to all technicians."""
        if user.get("role") != "admin":
            raise HTTPException(403, "Apenas administradores")
        sent = await send_push_to_all_techs(db, message)
        return {"sent": sent}

    return router
