from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.schemas.message import MessageCreate, MessageOut, MessageUpdate
from app.schemas.user import UserOut
from app.db import get_db
from app.utils.auth import get_current_user
from app.utils.logger import log_event
from bson import ObjectId
from datetime import datetime

router = APIRouter()

# --------------------------------------------------------------------------
# Helper – ensure every message dict is ready for MessageOut schema
# --------------------------------------------------------------------------
def _normalize_message(message: dict, current_user_id: Optional[str] = None) -> dict:
    """Convert ObjectIds to str and embed sender/recipient sub-docs."""
    message = message.copy()

    # id / _id normalization
    message["id"] = str(message.get("_id", message.get("id")))
    message["_id"] = message["id"]

    # --- SENDER ---
    # Start with sender data from message if it exists, otherwise empty dict
    sender_obj = message.get("sender", {})
    if not isinstance(sender_obj, dict): # Ensure it's a dictionary
        sender_obj = {}
    
    # Ensure all required fields for UserOut are present, providing defaults
    sender_obj.setdefault("_id", message.get("senderId"))
    # Convert ObjectId _id to str for Pydantic compatibility
    if isinstance(sender_obj.get("_id"), ObjectId):
        sender_obj["_id"] = str(sender_obj["_id"])
    sender_obj["id"] = str(sender_obj.get("_id") or message.get("senderId"))
    
    # Use existing name if available and not empty, otherwise default
    if not sender_obj.get("firstName"): sender_obj["firstName"] = "Unknown"
    if not sender_obj.get("lastName"): sender_obj["lastName"] = "User"

    sender_obj.setdefault("email", "unknown@example.com")
    sender_obj.setdefault("role", "employee")
    sender_obj.setdefault("isActive", False)
    sender_obj.setdefault("createdAt", datetime.utcnow())
    message["sender"] = sender_obj

    # --- RECIPIENT ---
    if message.get("recipientId"):
        recipient_obj = message.get("recipient", {})
        if not isinstance(recipient_obj, dict):
            recipient_obj = {}

        recipient_obj.setdefault("_id", message.get("recipientId"))
        if isinstance(recipient_obj.get("_id"), ObjectId):
            recipient_obj["_id"] = str(recipient_obj["_id"])
        recipient_obj["id"] = str(recipient_obj.get("_id") or message.get("recipientId"))

        if not recipient_obj.get("firstName"): recipient_obj["firstName"] = "Unknown"
        if not recipient_obj.get("lastName"): recipient_obj["lastName"] = "User"

        recipient_obj.setdefault("email", "unknown@example.com")
        recipient_obj.setdefault("role", "employee")
        recipient_obj.setdefault("isActive", True)
        recipient_obj.setdefault("createdAt", datetime.utcnow())
        message["recipient"] = recipient_obj
    else:
        message["recipient"] = None

    # isRead convenience – ensure the flag always exists for Pydantic model
    if current_user_id is not None:
        message["isRead"] = str(current_user_id) in message.get("readBy", {})
    else:
        # When current user context is unknown (e.g. newly-sent message response), default to False
        message["isRead"] = False

    # Acknowledgments: convert dict → list expected by schema
    if isinstance(message.get("acknowledgments"), dict):
        ack_list = []
        for uid, ts in message["acknowledgments"].items():
            user_in_ack = message["acknowledgments"][uid].get("user", {})
            if not isinstance(user_in_ack, dict): user_in_ack = {}
            
            user_in_ack.setdefault("_id", uid)
            user_in_ack.setdefault("id", uid)
            if not user_in_ack.get("firstName"): user_in_ack["firstName"] = ""
            if not user_in_ack.get("lastName"): user_in_ack["lastName"] = ""
            user_in_ack.setdefault("email", "unknown@example.com")
            user_in_ack.setdefault("role", "employee")
            user_in_ack.setdefault("isActive", True)
            user_in_ack.setdefault("createdAt", datetime.utcnow())

            ack_list.append({
                "userId": uid,
                "user": user_in_ack,
                "acknowledgedAt": ts,
            })
        message["acknowledgments"] = ack_list
    elif "acknowledgments" not in message:
        message["acknowledgments"] = []

    # Ensure senderId / recipientId are strings
    if "senderId" in message:
        message["senderId"] = str(message["senderId"])
    if "recipientId" in message and message.get("recipientId") is not None:
        message["recipientId"] = str(message["recipientId"])

    return message

@router.get("/", response_model=dict)
async def get_messages(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    type: Optional[str] = None,
    priority: Optional[str] = None,
    isRead: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Show messages where the current user is either the sender or intended recipient,
    # as well as department-wide announcements and global announcements.
    filter_dict = {
        "$or": [
            {"recipientId": str(current_user["_id"])},
            {"senderId": str(current_user["_id"])},  # include messages sent by the user
            {"departmentId": current_user.get("department")},
            {"type": "announcement"}
        ]
    }
    
    if type:
        filter_dict["type"] = type
    if priority:
        filter_dict["priority"] = priority
    if isRead is not None:
        filter_dict[f"readBy.{str(current_user['_id'])}"] = {"$exists": isRead}
    
    # Get total count
    total = await db["messages"].count_documents(filter_dict)
    
    # Get paginated results
    skip = (page - 1) * limit
    messages_cursor = db["messages"].find(filter_dict).skip(skip).limit(limit).sort("sentAt", -1)
    messages = await messages_cursor.to_list(None)
    
    # Convert to MessageOut format
    message_list = []
    for message in messages:
        # Embed sender details
        try:
            sender_id = message.get("senderId")
            if sender_id is not None:
                if isinstance(sender_id, ObjectId):
                    query_id = sender_id
                elif ObjectId.is_valid(str(sender_id)):
                    query_id = ObjectId(str(sender_id))
                else:
                    query_id = str(sender_id)
                sender_doc = await db["users"].find_one({"_id": query_id})
                if sender_doc:
                    message["sender"] = sender_doc
        except Exception as e:
            print(f"Error fetching sender for message {message.get('_id')}: {e}")

        # Embed recipient details (if any)
        if message.get("recipientId"):
            try:
                recipient_id = message.get("recipientId")
                if recipient_id is not None:
                    if isinstance(recipient_id, ObjectId):
                        query_id = recipient_id
                    elif ObjectId.is_valid(str(recipient_id)):
                        query_id = ObjectId(str(recipient_id))
                    else:
                        query_id = str(recipient_id)
                    rec_doc = await db["users"].find_one({"_id": query_id})
                    if rec_doc:
                        message["recipient"] = rec_doc
            except Exception as e:
                print(f"Error fetching recipient for message {message.get('_id')}: {e}")

        # Populate sender / recipient objects, stringify ids, etc.
        try:
            normalized = _normalize_message(message, str(current_user["_id"]))
            message_list.append(MessageOut(**normalized))
        except Exception as e:
            print(f"Pydantic validation failed for message {message.get('_id')}: {e}")

    return {
        "items": message_list,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit
    }

@router.post("/", response_model=MessageOut, status_code=201)
async def send_message(
    message: MessageCreate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    message_dict = message.dict()
    message_dict["senderId"] = str(current_user["_id"])
    message_dict["sentAt"] = datetime.utcnow()
    message_dict["readBy"] = {}
    message_dict["acknowledgments"] = {}
    
    # Validate recipient if specified
    if message.recipientId:
        recipient = None
        # 1) Attempt ObjectId lookup if format looks valid (24-hex)
        if ObjectId.is_valid(str(message.recipientId)):
            recipient = await db["users"].find_one({"_id": ObjectId(message.recipientId)})

        # 2) Fallback to plain string _id (covers historical records stored as string)
        if not recipient:
            recipient = await db["users"].find_one({"_id": str(message.recipientId)})

        if not recipient:
            raise HTTPException(404, "Recipient not found")
    
    res = await db["messages"].insert_one(message_dict)
    new_message = await db["messages"].find_one({"_id": res.inserted_id})
    
    # Embed sender object for immediate response
    try:
        sender_doc = await db["users"].find_one({"_id": current_user["_id"]})
        if sender_doc:
            new_message["sender"] = sender_doc
    except Exception as e:
        print(f"Error fetching sender in send_message: {e}")

    # Populate recipient data if exists
    if new_message.get("recipientId"):
        try:
            recipient_id = new_message["recipientId"]
            if isinstance(recipient_id, ObjectId):
                query_id = recipient_id
            elif ObjectId.is_valid(str(recipient_id)):
                query_id = ObjectId(str(recipient_id))
            else:
                query_id = str(recipient_id)
            recipient = await db["users"].find_one({"_id": query_id})
            if recipient:
                new_message["recipient"] = recipient
        except Exception as e:
            print(f"Error fetching recipient in send_message: {e}")
    
    normalized = _normalize_message(new_message, str(current_user["_id"]))
    
    await log_event("message_sent", {"message_id": str(res.inserted_id)})
    return MessageOut(**normalized)

@router.get("/{message_id}", response_model=MessageOut)
async def get_message(
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(message_id)
    except:
        raise HTTPException(400, "Invalid message ID")
    
    message = await db["messages"].find_one({"_id": oid})
    if not message:
        raise HTTPException(404, "Message not found")
    
    # Check permissions
    user_id = str(current_user["_id"])
    if (message["senderId"] != user_id and 
        message.get("recipientId") != user_id and
        message.get("departmentId") != current_user.get("department") and
        message.get("type") != "announcement"):
        raise HTTPException(403, "Access denied")
    
    # Populate sender data
    try:
        sender_id = message.get("senderId")
        if sender_id is not None:
            if isinstance(sender_id, ObjectId):
                query_id = sender_id
            elif ObjectId.is_valid(str(sender_id)):
                query_id = ObjectId(str(sender_id))
            else:
                query_id = str(sender_id)
            sender = await db["users"].find_one({"_id": query_id})
            if sender:
                message["sender"] = sender
    except Exception as e:
        print(f"Error fetching sender in get_message: {e}")
    
    # Populate recipient data if exists
    if message.get("recipientId"):
        try:
            recipient_id = message.get("recipientId")
            if recipient_id is not None:
                if isinstance(recipient_id, ObjectId):
                    query_id = recipient_id
                elif ObjectId.is_valid(str(recipient_id)):
                    query_id = ObjectId(str(recipient_id))
                else:
                    query_id = str(recipient_id)
                recipient = await db["users"].find_one({"_id": query_id})
                if recipient:
                    message["recipient"] = recipient
        except Exception as e:
            print(f"Error fetching recipient in get_message: {e}")
    
    normalized = _normalize_message(message, user_id)
    return MessageOut(**normalized)

@router.post("/{message_id}/read", status_code=204)
async def mark_message_as_read(
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(message_id)
    except:
        raise HTTPException(400, "Invalid message ID")
    
    message = await db["messages"].find_one({"_id": oid})
    if not message:
        raise HTTPException(404, "Message not found")
    
    user_id = str(current_user["_id"])
    await db["messages"].update_one(
        {"_id": oid},
        {"$set": {f"readBy.{user_id}": datetime.utcnow()}}
    )
    
    await log_event("message_read", {"message_id": message_id, "user_id": user_id})

@router.post("/{message_id}/acknowledge", status_code=204)
async def acknowledge_message(
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(message_id)
    except:
        raise HTTPException(400, "Invalid message ID")
    
    message = await db["messages"].find_one({"_id": oid})
    if not message:
        raise HTTPException(404, "Message not found")
    
    if not message.get("requiresAcknowledgment", False):
        raise HTTPException(400, "Message does not require acknowledgment")
    
    user_id = str(current_user["_id"])
    await db["messages"].update_one(
        {"_id": oid},
        {"$set": {f"acknowledgments.{user_id}": datetime.utcnow()}}
    )
    
    await log_event("message_acknowledged", {"message_id": message_id, "user_id": user_id})

@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    try:
        oid = ObjectId(message_id)
    except:
        raise HTTPException(400, "Invalid message ID")
    
    message = await db["messages"].find_one({"_id": oid})
    if not message:
        raise HTTPException(404, "Message not found")
    
    # Only sender or admin can delete
    if (message["senderId"] != str(current_user["_id"]) and 
        current_user.get("role") != "administrator"):
        raise HTTPException(403, "Access denied")
    
    res = await db["messages"].delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Message not found")
    await log_event("message_deleted", {"message_id": message_id})

# --------------------------------------------------------------------------
# Update message
# --------------------------------------------------------------------------

@router.put("/{message_id}", response_model=MessageOut)
async def update_message(
    message_id: str,
    message_update: MessageUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()

    try:
        oid = ObjectId(message_id)
    except Exception:
        raise HTTPException(400, "Invalid message ID")

    existing = await db["messages"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Message not found")

    # Permission: only sender can edit their own, admin can edit any
    if (
        str(existing["senderId"]) != str(current_user["_id"])
        and current_user.get("role") != "administrator"
    ):
        raise HTTPException(403, "Access denied")

    update_dict = message_update.dict(exclude_unset=True)
    if not update_dict:
        return MessageOut(**_normalize_message(existing, str(current_user["_id"])))

    update_dict["updatedAt"] = datetime.utcnow()

    await db["messages"].update_one({"_id": oid}, {"$set": update_dict})
    updated = await db["messages"].find_one({"_id": oid})

    normalized = _normalize_message(updated, str(current_user["_id"]))
    await log_event("message_updated", {"message_id": message_id, "user_id": str(current_user["_id"])})
    return MessageOut(**normalized)

# --------------------------------------------------------------------------
# Accept trailing-slash & non-slash POST for message creation (avoid 307)
# --------------------------------------------------------------------------

@router.post("", response_model=MessageOut, status_code=201)
async def send_message_no_slash(message: MessageCreate, current_user: dict = Depends(get_current_user)):
    return await send_message(message, current_user)  # type: ignore

# --------------------------------------------------------------------------
# GET alias without trailing slash to avoid 405 for /api/messages?...
# --------------------------------------------------------------------------

@router.get("", response_model=dict)
async def get_messages_no_slash(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    type: Optional[str] = None,
    priority: Optional[str] = None,
    isRead: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    return await get_messages(page, limit, type, priority, isRead, current_user)  # type: ignore
