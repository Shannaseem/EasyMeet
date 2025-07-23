 🚀 EasyMeet – Real-Time Group Video Calling App

**EasyMeet** is a lightweight, browser-based group video calling application powered by **WebRTC** and **FastAPI WebSockets**. With a minimal setup and a sleek glassmorphism UI, EasyMeet lets users connect in real-time with camera and microphone support — no third-party server required.


## 📸 Features

* 🔐 **Secure Room-based Calls** – Join or host calls using Room ID and User ID
* 🎤 **Audio & Video Control** – Toggle microphone and camera at any time
* 🧍 **Live Participants View** – See real-time video feeds from other users
* 🔇 **Status Indicators** – Know who has muted mic or turned off camera
* 🛑 **Clean Call Exit** – Notify others when someone leaves the room
* 💻 **Modern UI** – Built with animated bubbles, gradients, and glass-style panels
* ⚡ **WebSocket Signaling** – Fast, event-driven communication using FastAPI


## 📁 Project Structure

EasyMeet/
├── backend/
│   └── signaling_server.py       # FastAPI WebSocket signaling server
├── frontend/
│   ├── assets/
│   │   ├── css/
│   │   │   └── style.css         # Stylish UI & animations
│   │   └── js/
│   │       └── app.js            # WebRTC + signaling logic
│   ├── favicon.ico
│   └── index.html                # Main frontend entry point
├── .gitignore
└── README.md                     # This file


## 🛠️ Requirements

* Python 3.8 or higher
* Git
* Modern browser (Chrome, Firefox, Edge)
* Node.js (optional, for local static file server)


## ⚙️ Installation & Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/Shannaseem/EasyMeet.git
cd EasyMeet

### Step 2: Install Backend Dependencies

```bash
pip install fastapi uvicorn

### Step 3: Start the WebSocket Signaling Server

```bash
cd backend
uvicorn signaling_server:app --reload --port 8000

This starts the signaling server at:
📡 `ws://localhost:8000`

### Step 4: Serve the Frontend Locally

```bash
cd ../frontend
python -m http.server 8080
```

Now open your browser and go to:
🌐 `http://localhost:8080`

> **Note:** Don't open `index.html` using `file://`. WebRTC requires a local server due to security restrictions.


## 💡 How to Use EasyMeet

### Start a Video Call

1. Open `http://localhost:8080`
2. Enter a unique **User ID** (e.g., `user1`)
3. Enter a **Room ID** (e.g., `room1`)
4. Click **Start**
5. Allow mic and camera permissions

### In-Call Controls

* 🎙️ **Mic Toggle** – Mute/unmute your microphone
* 📷 **Camera Toggle** – Turn your video on/off
* ❌ **End Call** – Leave the room gracefully

To test with multiple users, open new tabs or use different devices with the **same Room ID** and different User IDs.


👨‍💻 About the Programmer
Shan Naseem — skilled in WebRTC, FastAPI, JavaScript, and building real-time, multi-user web apps with modern UI design.


## 🔧 Pro Tip

> For best performance, use **desktop Chrome or Firefox** with camera/mic permissions enabled. Mobile support is not yet fully optimized.

💙 Happy Coding!
If you like this project, star it on GitHub and share your feedback! 🚀✨