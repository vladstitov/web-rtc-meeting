var client1;
(function (client1) {
    const remoteVideo = document.getElementById('remoteVideo');
    const remoteMediaStream = new MediaStream();
    const ar = window.location.host.split(':');
    const socket = new WebSocket('wss://' + ar[0] + ':8888');
    let peerConnection;
    let dataChannel;
    let sharingID;
    let myID;
    let clients;
    socket.onopen = () => {
        console.log('socket::open');
        sendSocketMessage('start', null, { name: 'client' });
    };
    socket.onmessage = async (evt) => {
        try {
            const jsonMessage = JSON.parse(evt.data);
            const action = jsonMessage.action;
            const from = jsonMessage.from;
            const to = jsonMessage.to;
            const data = jsonMessage.data;
            console.log('message', jsonMessage);
            switch (jsonMessage.action) {
                case 'start':
                    console.log('start', data.id);
                    myID = data.id;
                    clients = jsonMessage.clients;
                    document.getElementById('localId').innerHTML = data.id;
                    console.log(clients);
                    break;
                case 'offer':
                    sharingID = jsonMessage.from;
                    await initializePeerConnection(null);
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendSocketMessage('answer', sharingID, { answer });
                    break;
                case 'answer':
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.answer));
                    break;
                case 'iceCandidate':
                    await peerConnection.addIceCandidate(jsonMessage.data.candidate);
                    break;
                case 'error-send-offer':
                    console.log('error-send-offer', jsonMessage);
                    break;
                default:
                    console.warn('unknown action', jsonMessage.action);
            }
        }
        catch (error) {
            console.error('failed to handle socket message', error);
        }
    };
    socket.onerror = (error) => {
        console.error('socket::error', error);
    };
    socket.onclose = () => {
        console.log('socket::close');
        stop();
    };
    function sendSocketMessage(action, to, data) {
        const message = { action, data, to };
        socket.send(JSON.stringify(message));
    }
    ;
    function askOffer() {
        if (myID)
            sendSocketMessage('ask-offer', null, null);
        else
            console.log(' no my id ');
    }
    client1.askOffer = askOffer;
    const hangup = () => socket.close();
    function stop() {
        sendSocketMessage('stop', sharingID, null);
        peerConnection.getReceivers();
        for (const sender of peerConnection.getReceivers()) {
            console.log(sender);
            if (sender.track)
                sender.track.stop();
        }
        dataChannel.close();
        peerConnection.close();
        peerConnection = null;
        // @ts-ignore
        /// remoteVideo.srcObject = undefined;
    }
    client1.stop = stop;
    ;
    const initializePeerConnection = async (mediaTracks) => {
        const config = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302'] }] };
        peerConnection = new RTCPeerConnection(config);
        peerConnection.onicecandidate = ({ candidate }) => {
            if (!candidate)
                return;
            console.log('on icecandidate ', candidate);
        };
        peerConnection.oniceconnectionstatechange = () => {
            console.log('peerConnection::iceconnectionstatechange newState=', peerConnection.iceConnectionState);
            // If ICE state is disconnected stop
            if (peerConnection.iceConnectionState === 'disconnected') {
                alert('Connection has been closed stopping...');
                socket.close();
            }
        };
        peerConnection.ontrack = ({ track }) => {
            console.log('peerConnection::track', track);
            remoteMediaStream.addTrack(track);
            // @ts-ignore
            remoteVideo.srcObject = remoteMediaStream;
        };
        peerConnection.ondatachannel = ({ channel }) => {
            console.log('DATACHANNEL');
            dataChannel = channel;
            initializeDataChannelListeners();
        };
        if (mediaTracks) {
            for (const track of mediaTracks) {
                peerConnection.addTrack(track);
            }
        }
        // @ts-ignore
    };
    const initializeDataChannel = () => {
        const config = { ordered: true };
        dataChannel = peerConnection.createDataChannel('dataChannel', config);
        initializeDataChannelListeners();
    };
    const initializeDataChannelListeners = () => {
        dataChannel.onopen = () => console.log('dataChannel opened');
        dataChannel.onclose = () => console.log('dataChannel closed');
        dataChannel.onerror = (error) => console.error('dataChannel error:', error);
        dataChannel.onmessage = ({ data }) => {
            console.log('dataChannel data', data);
        };
    };
    const sendMessage = () => {
        // @ts-ignore
        const message = document.getElementById('chatMessage').value;
        if (!message) {
            alert('no message entered');
            return;
        }
        if (!dataChannel || dataChannel.readyState !== 'open') {
            alert('data channel is undefined or is not connected');
            return;
        }
        console.log('sending message', message);
        const data = {
            message,
            time: new Date()
        };
        dataChannel.send(JSON.stringify(data));
        // @ts-ignore
        document.getElementById('chatMessage').value = '';
    };
})(client1 || (client1 = {}));
//# sourceMappingURL=client.js.map