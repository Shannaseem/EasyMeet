# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms = {}  # {room_id: {user_id: websocket}}

@app.websocket("/ws/{room_id}_{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = websocket

    # Notify all users in the room about the new user list
    users = list(rooms[room_id].keys())
    for ws in rooms[room_id].values():
        await ws.send_text(json.dumps({
            "type": "users-in-room",
            "users": users
        }))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            to_id = msg.get("to")
            # Forward signaling messages to the intended recipient
            if to_id and to_id in rooms[room_id]:
                await rooms[room_id][to_id].send_text(data)
    except WebSocketDisconnect:
        del rooms[room_id][user_id]
        # Notify others about user leaving
        users = list(rooms[room_id].keys())
        for ws in rooms[room_id].values():
            await ws.send_text(json.dumps({
                "type": "users-in-room",
                "users": users
            }))