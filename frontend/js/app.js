function startCall() {
    alert("This will start the video call (WebRTC logic coming next)!");
}
// [EasyMeet/frontend/js/app.js]

let localStream, peer, ws, myId, otherId;

function startCall() {
    myId = document.getElementById('myId').value.trim();
    otherId = document.getElementById('otherId').value.trim();
    if (!myId || !otherId) {
        alert("Please enter both your ID and the other user's ID.");
        return;
    }

    ws = new WebSocket(`ws://localhost:8000/ws/${myId}`);

    ws.onopen = () => {
        setupMediaAndPeer();
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "offer") {
            await peer.setRemoteDescription(new RTCSessionDescription(msg.offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            ws.send(JSON.stringify({to: msg.from, type: "answer", answer}));
        } else if (msg.type === "answer") {
            await peer.setRemoteDescription(new RTCSessionDescription(msg.answer));
        } else if (msg.type === "ice") {
            await peer.addIceCandidate(msg.candidate);
        }
    };

    ws.onclose = () => {
        alert("WebSocket connection closed.");
    };
}

async function setupMediaAndPeer() {
    localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    document.getElementById('localVideo').srcObject = localStream;
    peer = new RTCPeerConnection();

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    peer.onicecandidate = (e) => {
        if (e.candidate) {
            ws.send(JSON.stringify({to: otherId, type: "ice", candidate: e.candidate}));
        }
    };

    peer.ontrack = (e) => {
        document.getElementById('remoteVideo').srcObject = e.streams[0];
    };

    // Initiator only: create offer
    if (myId && otherId) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        ws.send(JSON.stringify({to: otherId, from: myId, type: "offer", offer}));
    }
}