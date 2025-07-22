
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store connected clients by room
rooms = {}  # {room_id: {user_id: websocket}}

@app.websocket("/ws/{room_id}_{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    
    # Add user to room
    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = websocket
    
    # Send list of users in the room to all clients
    users = list(rooms[room_id].keys())
    await broadcast_to_room(room_id, {"type": "users-in-room", "users": users})
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "join":
                # Notify all clients of updated user list
                users = list(rooms[room_id].keys())
                await broadcast_to_room(room_id, {"type": "users-in-room", "users": users})
            
            elif message["type"] in ["offer", "answer", "ice"]:
                # Forward to specific user
                to_user = message.get("to")
                if to_user in rooms[room_id]:
                    await rooms[room_id][to_user].send_text(json.dumps(message))
            
            elif message["type"] == "end":
                # Broadcast end message
                await broadcast_to_room(room_id, {"type": "end", "endedBy": user_id})
            
            elif message["type"] == "status":
                # Broadcast status update to all users in the room
                status_message = {
                    "type": "status",
                    "from": message["from"],
                    "muted": message.get("muted", False),
                    "cameraOff": message.get("cameraOff", False)
                }
                await broadcast_to_room(room_id, status_message)
    
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Remove user from room on disconnect
        del rooms[room_id][user_id]
        if not rooms[room_id]:
            del rooms[room_id]
        else:
            # Notify remaining users
            users = list(rooms[room_id].keys())
            await broadcast_to_room(room_id, {"type": "users-in-room", "users": users})

async def broadcast_to_room(room_id: str, message: dict):
    if room_id in rooms:
        for user_id, ws in rooms[room_id].items():
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error broadcasting to {user_id}: {e}")
