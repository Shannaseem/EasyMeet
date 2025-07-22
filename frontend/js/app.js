
let localStream;
let peers = {}; // { userId: RTCPeerConnection }
let ws;
let myId;
let roomId;
let usersInRoom = new Set();
let pendingCandidates = {}; // { userId: [candidates] }
let remoteStatus = {}; // { userId: { muted: bool, cameraOff: bool } }
let localMuted = false;
let localCameraOff = false;

function setStatus(msg) {
    const statusElement = document.getElementById('statusMsg');
    if (statusElement) {
        statusElement.textContent = msg || '';
    }
}

function showCallEnded(userId) {
    const videoBox = document.getElementById(`video-box-${userId}`);
    if (videoBox) {
        let endedLabel = videoBox.querySelector('.ended-label');
        if (!endedLabel) {
            endedLabel = document.createElement('span');
            endedLabel.className = 'ended-label';
            endedLabel.textContent = `Call ended by ${userId}`;
            videoBox.appendChild(endedLabel);
        } else {
            endedLabel.style.display = 'inline-block';
        }
    }
}

function removeRemoteVideo(userId) {
    const videoBox = document.getElementById(`video-box-${userId}`);
    if (videoBox) {
        videoBox.remove();
    }
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
    usersInRoom.delete(userId);
    delete remoteStatus[userId];
}

function addRemoteVideo(userId) {
    if (document.getElementById(`video-box-${userId}`)) return; // Already exists

    const main = document.querySelector('main');
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container glass';
    videoContainer.id = `video-box-${userId}`;

    const video = document.createElement('video');
    video.id = userId === myId ? 'localVideo' : `remoteVideo-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    if (userId === myId) {
        video.muted = true;
    }

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = userId === myId ? 'You' : userId;

    // Status indicators (mute, camera off)
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status-indicators';
    statusDiv.id = `status-indicators-${userId}`;
    statusDiv.style.marginTop = '6px';

    // Camera off placeholder
    const cameraOffLabel = document.createElement('div');
    cameraOffLabel.className = 'camera-off-label';
    cameraOffLabel.id = `camera-off-${userId}`;
    cameraOffLabel.textContent = `Camera Off by ${userId}`;
    cameraOffLabel.style.display = 'none';

    videoContainer.appendChild(video);
    videoContainer.appendChild(cameraOffLabel);
    videoContainer.appendChild(label);
    videoContainer.appendChild(statusDiv);

    if (userId === myId) {
        main.insertBefore(videoContainer, main.firstChild);
    } else {
        main.appendChild(videoContainer);
    }

    // Apply existing status if available
    if (remoteStatus[userId]) {
        updateRemoteStatusIndicators(userId);
    }
}

function updateRemoteStatusIndicators(userId) {
    const status = remoteStatus[userId] || {};
    const statusDiv = document.getElementById(`status-indicators-${userId}`);
    const cameraOffLabel = document.getElementById(`camera-off-${userId}`);
    const video = document.getElementById(userId === myId ? 'localVideo' : `remoteVideo-${userId}`);
    
    if (!statusDiv || !cameraOffLabel || !video) {
        console.warn(`Failed to update status for ${userId}: elements missing`);
        return;
    }

    // Update camera off label text (in case userId changes)
    cameraOffLabel.textContent = `Camera Off by ${userId}`;

    // Clear existing indicators
    statusDiv.innerHTML = '';

    // Update mute status
    if (status.muted) {
        const muteSpan = document.createElement('span');
        muteSpan.className = 'muted-label';
        muteSpan.textContent = `Muted by ${userId}`;
        statusDiv.appendChild(muteSpan);
    }

    // Update camera off status
    if (status.cameraOff) {
        cameraOffLabel.style.display = 'flex';
        video.style.display = 'none';
    } else {
        cameraOffLabel.style.display = 'none';
        video.style.display = '';
    }
}

function resetUI() {
    setStatus('');
    document.querySelectorAll('.video-container').forEach(vc => {
        if (!vc.id || vc.id === `video-box-${myId}`) return;
        vc.remove();
    });
    document.querySelectorAll('.ended-label').forEach(el => el.remove());
    document.querySelectorAll('.status-indicators').forEach(el => el.innerHTML = '');
    remoteStatus = {};
}

function startCall() {
    myId = document.getElementById('myId').value.trim();
    roomId = document.getElementById('otherId').value.trim();
    if (!myId || !roomId) {
        setStatus("Please enter both your ID and the room name.");
        return;
    }
    resetUI();
    setStatus("Connecting...");
    connectWebSocket();
}

function connectWebSocket() {
    ws = new WebSocket(`ws://localhost:8000/ws/${roomId}_${myId}`);

    ws.onopen = () => {
        setStatus("Connected. Setting up media...");
        setupMediaAndAnnounce();
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        console.log('Received WebSocket message:', msg);

        if (msg.type === "users-in-room") {
            const prevUsers = new Set(usersInRoom);
            usersInRoom = new Set(msg.users);
            console.log('Users in room:', Array.from(usersInRoom));

            usersInRoom.forEach(uid => {
                if (uid !== myId && !peers[uid]) {
                    addRemoteVideo(uid);
                    if (myId < uid) {
                        console.log(`Initiating offer to ${uid}`);
                        createPeerConnection(uid, true);
                    }
                }
            });

            prevUsers.forEach(uid => {
                if (uid !== myId && !usersInRoom.has(uid)) {
                    console.log(`User ${uid} left, removing video`);
                    removeRemoteVideo(uid);
                }
            });
        } else if (msg.type === "offer") {
            const from = msg.from;
            console.log(`Received offer from ${from}`);
            addRemoteVideo(from);
            if (peers[from]) {
                console.log(`Updating existing peer connection for ${from}`);
                await peers[from].setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await peers[from].createAnswer();
                await peers[from].setLocalDescription(answer);
                ws.send(JSON.stringify({to: from, from: myId, type: "answer", answer: peers[from].localDescription}));
                console.log(`Sent answer to ${from} for renegotiation`);
            } else {
                await createPeerConnection(from, false, msg.offer);
            }
            if (pendingCandidates[from]) {
                console.log(`Flushing ${pendingCandidates[from].length} pending candidates for ${from}`);
                for (const candidate of pendingCandidates[from]) {
                    await peers[from].addIceCandidate(new RTCIceCandidate(candidate));
                }
                delete pendingCandidates[from];
            }
        } else if (msg.type === "answer") {
            const from = msg.from;
            if (peers[from]) {
                console.log(`Setting remote answer from ${from}`);
                await peers[from].setRemoteDescription(new RTCSessionDescription(msg.answer));
                if (pendingCandidates[from]) {
                    console.log(`Flushing ${pendingCandidates[from].length} pending candidates for ${from}`);
                    for (const candidate of pendingCandidates[from]) {
                        await peers[from].addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    delete pendingCandidates[from];
                }
            }
        } else if (msg.type === "ice") {
            const from = msg.from;
            if (peers[from]) {
                if (peers[from].remoteDescription && peers[from].remoteDescription.type) {
                    console.log(`Adding ICE candidate from ${from}`);
                    await peers[from].addIceCandidate(new RTCIceCandidate(msg.candidate));
                } else {
                    console.log(`Buffering ICE candidate from ${from}`);
                    if (!pendingCandidates[from]) pendingCandidates[from] = [];
                    pendingCandidates[from].push(msg.candidate);
                }
            }
        } else if (msg.type === "end") {
            console.log(`User ${msg.endedBy} ended call`);
            showCallEnded(msg.endedBy);
            removeRemoteVideo(msg.endedBy);
        } else if (msg.type === "status") {
            console.log(`Status update from ${msg.from}: muted=${msg.muted}, cameraOff=${msg.cameraOff}`);
            if (!remoteStatus[msg.from]) remoteStatus[msg.from] = {};
            remoteStatus[msg.from].muted = msg.muted !== undefined ? msg.muted : false;
            remoteStatus[msg.from].cameraOff = msg.cameraOff !== undefined ? msg.cameraOff : false;
            updateRemoteStatusIndicators(msg.from);
        }
    };

    ws.onclose = () => {
        setStatus("Connection lost. Please refresh the page.");
    };

    ws.onerror = (e) => {
        setStatus("WebSocket error. Try again.");
        console.error('WebSocket error:', e);
    };
}

async function setupMediaAndAnnounce() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        console.log('Local stream acquired:', localStream);
        let localBox = document.getElementById(`video-box-${myId}`);
        if (!localBox) {
            addRemoteVideo(myId);
        }
        const video = document.getElementById('localVideo');
        if (video) {
            video.srcObject = localStream;
            video.play().catch(err => console.warn("Local video autoplay blocked:", err));
        }
        ws.send(JSON.stringify({type: "join", user: myId}));
        console.log('Sent join message for', myId);

        Object.keys(peers).forEach(userId => {
            const peer = peers[userId];
            if (localStream && typeof localStream.getTracks === 'function') {
                let tracksAdded = false;
                localStream.getTracks().forEach(track => {
                    if (!peer.getSenders().some(sender => sender.track && sender.track.id === track.id)) {
                        console.log(`Adding track to peer ${userId}:`, track);
                        peer.addTrack(track, localStream);
                        tracksAdded = true;
                    }
                });
                if (tracksAdded && peer.signalingState === 'stable') {
                    console.log(`Triggering renegotiation for ${userId} due to new tracks`);
                    peer.createOffer().then(offer => {
                        return peer.setLocalDescription(offer);
                    }).then(() => {
                        ws.send(JSON.stringify({
                            to: userId,
                            from: myId,
                            type: "offer",
                            offer: peer.localDescription
                        }));
                        console.log(`Sent renegotiation offer to ${userId}`);
                    }).catch(err => console.error(`Renegotiation error for ${userId}:`, err));
                }
            }
        });

        // Broadcast initial status
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({type: "status", from: myId, muted: localMuted, cameraOff: localCameraOff}));
        }
    } catch (err) {
        setStatus("Could not access camera/microphone. Please allow permissions.");
        console.error('Media setup error:', err);
    }
}

function createPeerConnection(userId, initiator, remoteOffer = null) {
    if (peers[userId]) {
        console.log(`Peer connection for ${userId} already exists`);
        return peers[userId];
    }

    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });
    peers[userId] = peer;
    console.log(`Created peer connection for ${userId}, initiator: ${initiator}`);

    if (localStream && typeof localStream.getTracks === 'function') {
        localStream.getTracks().forEach(track => {
            console.log(`Adding local track to ${userId}:`, track);
            peer.addTrack(track, localStream);
        });
    }

    peer.onicecandidate = (e) => {
        if (e.candidate) {
            console.log(`Sending ICE candidate to ${userId}`);
            ws.send(JSON.stringify({to: userId, from: myId, type: "ice", candidate: e.candidate}));
        }
    };

    peer.ontrack = (e) => {
        console.log(`Received track from ${userId}:`, e);
        const video = document.getElementById(`remoteVideo-${userId}`);
        if (video) {
            if (video.srcObject !== e.streams[0]) {
                video.srcObject = e.streams[0];
                video.play().catch(err => console.warn(`Autoplay blocked for ${userId}:`, err));
            }
        } else {
            console.warn(`Video element for ${userId} not found`);
        }
    };

    peer.onconnectionstatechange = () => {
        console.log(`Connection state for ${userId}: ${peer.connectionState}`);
        if (peer.connectionState === "disconnected" || peer.connectionState === "failed" || peer.connectionState === "closed") {
            console.log(`Connection to ${userId} lost`);
            showCallEnded(userId);
            removeRemoteVideo(userId);
        }
    };

    if (initiator) {
        peer.createOffer().then(offer => {
            return peer.setLocalDescription(offer);
        }).then(() => {
            console.log(`Sending offer to ${userId}`);
            ws.send(JSON.stringify({to: userId, from: myId, type: "offer", offer: peer.localDescription}));
        }).catch(err => console.error(`Offer creation error for ${userId}:`, err));
    } else if (remoteOffer) {
        peer.setRemoteDescription(new RTCSessionDescription(remoteOffer)).then(() => {
            console.log(`Set remote offer from ${userId}, creating answer`);
            if (localStream && typeof localStream.getTracks === 'function') {
                localStream.getTracks().forEach(track => {
                    if (!peer.getSenders().some(sender => sender.track && sender.track.id === track.id)) {
                        console.log(`Adding local track to ${userId} before answer:`, track);
                        peer.addTrack(track, localStream);
                    }
                });
            }
            return peer.createAnswer();
        }).then(answer => {
            return peer.setLocalDescription(answer);
        }).then(() => {
            console.log(`Sending answer to ${userId}`);
            ws.send(JSON.stringify({to: userId, from: myId, type: "answer", answer: peer.localDescription}));
        }).catch(err => console.error(`Answer creation error for ${userId}:`, err));
    }

    return peer;
}

function endCall() {
    console.log('Ending call');
    Object.keys(peers).forEach(userId => {
        if (peers[userId]) {
            peers[userId].close();
            removeRemoteVideo(userId);
        }
    });
    if (localStream && typeof localStream.getTracks === 'function') {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({type: "end", endedBy: myId}));
        ws.close();
    }
    setStatus("You ended the call.");
}

function toggleMute() {
    if (!localStream) return;
    localMuted = !localMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !localMuted;
    });
    document.getElementById('muteIcon').textContent = localMuted ? '🔇' : '🔊';
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({type: "status", from: myId, muted: localMuted, cameraOff: localCameraOff}));
    }
    if (!remoteStatus[myId]) remoteStatus[myId] = {};
    remoteStatus[myId].muted = localMuted;
    updateRemoteStatusIndicators(myId);
}

function toggleCamera() {
    if (!localStream) return;
    localCameraOff = !localCameraOff;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !localCameraOff;
    });
    document.getElementById('camIcon').textContent = localCameraOff ? '📷🚫' : '🎥';
    const video = document.getElementById('localVideo');
    const cameraOffLabel = document.getElementById(`camera-off-${myId}`);
    if (video && cameraOffLabel) {
        if (localCameraOff) {
            video.style.display = 'none';
            cameraOffLabel.style.display = 'flex';
        } else {
            video.style.display = '';
            cameraOffLabel.style.display = 'none';
        }
    }
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({type: "status", from: myId, muted: localMuted, cameraOff: localCameraOff}));
    }
    if (!remoteStatus[myId]) remoteStatus[myId] = {};
    remoteStatus[myId].cameraOff = localCameraOff;
    updateRemoteStatusIndicators(myId);
}

// UI event listeners
document.getElementById('myId').addEventListener('input', resetUI);
document.getElementById('otherId').addEventListener('input', resetUI);
document.getElementById('startBtn').addEventListener('click', startCall);
document.querySelector('.control-btn[title="Mute"]').onclick = toggleMute;
document.querySelector('.control-btn[title="Camera"]').onclick = toggleCamera;
document.querySelector('.control-btn.end[title="End Call"]').onclick = endCall;
