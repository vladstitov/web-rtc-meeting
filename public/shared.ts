namespace shared1 {
    const localVideo = document.getElementById('localVideo');
    const ar = window.location.host.split(':')
    const socket = new WebSocket('wss://' + ar[0] + ':8888');
    let peerConnection;
    let dataChannel;
    let localMediaStream;
    let clientId;
    let myID;
    let clients;

    socket.onopen = () => {
        sendSocketMessage('start', {name: 'Shared'});
        console.log('socket::open');
       // setTimeout(() => start(), 1000);
    };
    socket.onmessage = async ({data}) => {
        try {
            const jsonMessage = JSON.parse(data);
            console.log('message', jsonMessage);
            switch (jsonMessage.action) {
                case 'start':
                    console.log('start', jsonMessage.id);
                    myID = jsonMessage.id;
                    clients = jsonMessage.clients;
                    sendSocketMessage('sharing');
                    document.getElementById('localId').innerHTML = jsonMessage.id;
                    break;
                case 'sharing':
                    console.log('sharing registered');
                    break;
                case 'offer':
                    clientId = jsonMessage.data.from;
                    delete jsonMessage.data.remoteId;
                    await initializePeerConnection();
                    const mediaTracks = localMediaStream.getTracks()
                    if (mediaTracks) {
                        for (const track of mediaTracks) {
                            peerConnection.addTrack(track);
                        }
                    }

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendSocketMessage('answer', {to: clientId, answer});
                    break;
                case 'answer':
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.answer));
                    break;
                case 'iceCandidate':
                    await peerConnection.addIceCandidate(jsonMessage.data.candidate);
                    break;
                case 'send-offer':
                    const to = jsonMessage.from;
                    clientId = to;
                    console.log(clientId);
                    sendOffer(to);
                    break;
                case 'error-send-offer':
                    console.log('error-send-offer', jsonMessage)
                    break;
                case 'stop' :
                    stop();
                    break
                default:
                    console.warn('unknown action', jsonMessage.action);
            }
        } catch (error) {
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

    const sendSocketMessage = (action, data?) => {
        const message = {action, data};
        socket.send(JSON.stringify(message));
    };

    async function sendOffer(to) {
        if(!to){
            console.log(' no to')
            return
        }

        if (!peerConnection) {
            await initializePeerConnection();
            const mediaTracks = localMediaStream.getTracks()
            if (mediaTracks) {
                for (const track of mediaTracks) {
                    peerConnection.addTrack(track);
                }
            }
            initializeDataChannel();
        }
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSocketMessage('offer', {offer, to});
    }


    const hangup = () => socket.close();

    function stop(){
        // @ts-ignore
     /*   if(localVideo.srcObject) {
            // @ts-ignore
            for (const track of localVideo.srcObject.getTracks()) {
                console.log('stop track', track);
                track.stop();
            }
        }
*/
        for (const sender of peerConnection.getSenders()) {
            sender.track.stop();
        }
        dataChannel.close();
        peerConnection.close();
        peerConnection = null;
    }




    const initializePeerConnection = async () => {
        const config = {iceServers: [{urls: ['stun:stun1.l.google.com:19302']}]};
        peerConnection = new RTCPeerConnection(config);

        peerConnection.onicecandidate = ({candidate}) => {
            if (!candidate) return;
            console.log('on icecandidate sending to', clientId);
            sendSocketMessage('iceCandidate', {to:clientId, candidate});
        }

        peerConnection.oniceconnectionstatechange = () => {
            console.log('peerConnection::iceconnectionstatechange newState=', peerConnection.iceConnectionState);
            // If ICE state is disconnected stop
            if (peerConnection.iceConnectionState === 'disconnected') {
                alert('Connection has been closed stopping...');
                socket.close();
            }
        };

        peerConnection.ontrack = ({track}) => {
            console.log('TRACK', track);
         ///   remoteMediaStream.addTrack(track);
            // @ts-ignore
            remoteVideo.srcObject = remoteMediaStream;
        };

        peerConnection.ondatachannel = ({channel}) => {
            console.log('peerConnection::ondatachannel');
            dataChannel = channel;
            initializeDataChannelListeners();
        };

    };

    const initializeDataChannel = () => {
        const config = {ordered: true};

        dataChannel = peerConnection.createDataChannel('dataChannel', config);
        initializeDataChannelListeners();
    };

    const initializeDataChannelListeners = () => {
        dataChannel.onopen = () => console.log('dataChannel opened');
        dataChannel.onclose = () => console.log('dataChannel closed');
        dataChannel.onerror = (error) => console.error('dataChannel error:', error);

        dataChannel.onmessage = ({data}) => {
            console.log('dataChannel data', data);
        };
    };

    export async function shareVideo() {
        try {
            localMediaStream = await navigator.mediaDevices.getUserMedia({audio: false, video: true});
            console.log('got local media stream');
            // @ts-ignore
            localVideo.srcObject = localMediaStream;

        } catch (error) {
            console.error('failed to get local media stream', error);
        }
    }

   export const replaceTrackWithScreen = async () => {
        const mediaStream = await getLocalScreenCaptureStream();
        const screenTrack = mediaStream.getVideoTracks()[0];
        if (screenTrack) {
            console.log('replace camera track with screen track');
            replaceTrack(screenTrack);
        }
    };


    const getLocalScreenCaptureStream = async () => {
        try {
            const constraints = {video: {cursor: 'always'}, audio: false};

            // @ts-ignore
            const screenCaptureStream = await navigator.mediaDevices.getDisplayMedia(constraints);

            return screenCaptureStream;
        } catch (error) {
            console.error('failed to get local screen', error);
        }
    };

    const replaceTrack = (newTrack) => {
        const sender = peerConnection.getSenders().find(sender =>
            sender.track.kind === newTrack.kind
        );

        if (!sender) {
            console.warn('failed to find sender');

            return;
        }

        sender.replaceTrack(newTrack);
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

    };
}

