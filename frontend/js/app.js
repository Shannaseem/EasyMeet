
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

    // Mute/camera status indicators
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status-indicators';
    statusDiv.id = `status-indicators-${userId}`;
    statusDiv.style.marginTop = '6px';

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videoContainer.appendChild(statusDiv);

    if (userId === myId) {
        main.insertBefore(videoContainer, main.firstChild);
    } else {
        main.appendChild(videoContainer);
    }
}

function updateRemoteStatusIndicators(userId) {
    const status = remoteStatus[userId] || {};
    const statusDiv = document.getElementById(`status-indicators-${userId}`);
    if (!statusDiv) return;
    statusDiv.innerHTML = '';
    if (status.muted) {
        const muteSpan = document.createElement('span');
        muteSpan.textContent = '🔇';
        muteSpan.title = 'Muted';
        muteSpan.style.marginRight = '8px';
        statusDiv.appendChild(muteSpan);
    }
    if (status.cameraOff) {
        const camSpan = document.createElement('span');
        camSpan.textContent = '📷🚫';
        camSpan.title = 'Camera Off';
        statusDiv.appendChild(camSpan);
    }
}

function resetUI() {
    setStatus('');
    // Remove all remote videos except local
    document.querySelectorAll('.video-container').forEach(vc => {
        if (!vc.id || vc.id === `video-box-${myId}`) return;
        vc.remove();
    });
    // Remove all ended labels
    document.querySelectorAll('.ended-label').forEach(el => el.remove());
    // Remove all status indicators
    document.querySelectorAll('.status-indicators').forEach(el => el.innerHTML = '');
    remoteStatus = {};
}

function startCall() {
    myId = document.getElementById('myId').value.trim();
    roomId = document.getElementById('otherId').value.trim(); // Use as room name
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

            // For each user in the room (except myself), ensure a peer connection exists
            usersInRoom.forEach(uid => {
                if (uid !== myId && !peers[uid]) {
                    addRemoteVideo(uid);
                    // Only one side initiates offer to avoid double-offer
                    if (myId < uid) {
                        console.log(`Initiating offer to ${uid}`);
                        createPeerConnection(uid, true);
                    }
                }
            });

            // Remove peer connections for users who have left
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
                // Handle renegotiation by updating remote description
                console.log(`Updating existing peer connection for ${from}`);
                await peers[from].setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await peers[from].createAnswer();
                await peers[from].setLocalDescription(answer);
                ws.send(JSON.stringify({to: from, from: myId, type: "answer", answer: peers[from].localDescription}));
                console.log(`Sent answer to ${from} for renegotiation`);
            } else {
                await createPeerConnection(from, false, msg.offer);
            }
            // Flush pending candidates
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
                // Flush pending candidates
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
            console.log(`Status update from ${msg.from}:`, msg);
            if (!remoteStatus[msg.from]) remoteStatus[msg.from] = {};
            if ('muted' in msg) remoteStatus[msg.from].muted = msg.muted;
            if ('cameraOff' in msg) remoteStatus[msg.from].cameraOff = msg.cameraOff;
            updateRemoteStatusIndicators(msg.from);
            const video = document.getElementById(`remoteVideo-${msg.from}`);
            if (video) {
                video.style.display = msg.cameraOff ? 'none' : '';
            }
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
        // Add local video
        let localBox = document.getElementById(`video-box-${myId}`);
        if (!localBox) {
            addRemoteVideo(myId);
        }
        const video = document.getElementById('localVideo');
        if (video) {
            video.srcObject = localStream;
            video.play().catch(err => console.warn("Local video autoplay blocked:", err));
        }
        // Announce presence to server
        ws.send(JSON.stringify({type: "join", user: myId}));
        console.log('Sent join message for', myId);

        // Add tracks to existing peer connections without forcing renegotiation
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
                // Only trigger renegotiation if new tracks were added and signaling state is stable
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

    // Add local tracks if available
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

    // Handle offer/answer exchange
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
            // Add local tracks before creating answer
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
        ws.send(JSON.stringify({type: "status", from: myId, muted: localMuted}));
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
    if (video) {
        video.style.display = localCameraOff ? 'none' : '';
    }
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({type: "status", from: myId, cameraOff: localCameraOff}));
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
