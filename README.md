# 🎥 EasyMeet – Real-Time Group Video Calling App

EasyMeet is a real-time, multi-user group video calling web application built using **WebRTC**, **FastAPI**, and **JavaScript**. It enables users to join virtual rooms, share audio/video streams, and interact seamlessly with each other – similar to Google Meet.


## 🚀 Features

- 🔗 Join group calls with unique room IDs
- 🎤 Toggle microphone and camera during the call
- 📶 Peer-to-peer connection using WebRTC
- 🌐 FastAPI WebSocket backend for real-time signaling
- 🔒 Secure media sharing via ICE Candidates



### 🚀 Tech Stack

| Category            | Technologies Used                              |
| ------------------- | ---------------------------------------------- |
| **Frontend**        | HTML5, CSS3, JavaScript (Vanilla)              |
| **WebRTC**          | RTCPeerConnection, MediaStream, ICE Candidates |
| **Backend**         | FastAPI (Python)                               |
| **Real-time**       | WebSockets                                     |
| **Data Format**     | JSON                                           |
| **Styling & UI**    |  CSS, Custom Buttons & Indicators              |
| **Version Control** | Git & GitHub                                   |



## 📁 Project Structure
```
EasyMeet/
│
├── backend/                
│   ├── main.py             
│   └── ...                
│
├── static/                 
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── .gitignore
├── README.md
└── requirements.txt
```

## ▶️ Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Shannaseem/EasyMeet.git
cd EasyMeet
```

### 2. Install Backend Dependencies

If using a virtual environment (recommended):

```bash
pip install -r requirements.txt
```

### 3. Run the FastAPI WebSocket Server

```bash
cd backend
uvicorn main:app --reload
```

### 4. Open the Frontend

Open `static/index.html` in your browser. You can also host it using any static server.



## 👨‍💻 About the Programmer

Developed by **Shan Naseem** – Skilled in **WebRTC**, **FastAPI**, **JavaScript**, and building real-time, multi-user web apps with modern UI design.
