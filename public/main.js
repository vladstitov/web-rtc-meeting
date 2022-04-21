 const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const screenShareButton = document.getElementById('screenShareButton');
const isMain = window.location.hash
const ar = window.location.host.split(':')

const socket = new WebSocket('wss://'+ar[0]+':8888');
let peerConnection;
let dataChannel;
let localMediaStream;
let remoteId;
const remoteMediaStream = new MediaStream();
let myID;
let clients;
let mainID;
socket.onopen = () => {
  console.log('socket::open');
 /// start();
};
socket.onmessage = async ({ data }) => {
  try {
    const jsonMessage = JSON.parse(data);
    console.log('action', jsonMessage.action);
    switch (jsonMessage.action) {
      case 'start':
        console.log('start', jsonMessage.id);
        callButton.disabled = false;
        myID = jsonMessage.id;
        clients = jsonMessage.clients;
        const main = clients.find(v => v.main)
          if(main) mainID = main.id;
        document.getElementById('localId').innerHTML = jsonMessage.id;
        break;
      case 'offer':
        remoteId = jsonMessage.data.remoteId;
        delete jsonMessage.data.remoteId;
        await initializePeerConnection(localMediaStream?localMediaStream.getTracks(): null);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSocketMessage('answer', { remoteId, answer }); 
        break;
      case 'answer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.answer));
        break;
      case 'iceCandidate':
        await peerConnection.addIceCandidate(jsonMessage.data.candidate);
        break;
      case 'send-offer':
        const to = jsonMessage.to;
        remoteId = to;
        console.log(remoteId);
        sendOffer(to);
        break;
      case 'error-send-offer':

console.log('error-send-offer', jsonMessage )
        break;
      default: console.warn('unknown action', jsonMessage.action);
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

const sendSocketMessage = (action, data) => {
  const message = { action, data };
  socket.send(JSON.stringify(message));
};

const start = async () => {
  try {
    if(isMain) {
      localMediaStream = await getLocalScreenCaptureStream();
     localVideo.srcObject = localMediaStream;
    }// await getLocalMediaStream();
    console.log('localMediaStream ', localMediaStream);
    sendSocketMessage('start', {main: isMain});
  } catch (error) {
    console.error('failed to start stream', error);
  }
};

/*
*  const mediaStream = await getLocalScreenCaptureStream();

  const screenTrack = mediaStream.getVideoTracks()[0];
*
* */

 function askOffer() {
   if(myID)  sendSocketMessage('ask-offer', { to:myID });
   else console.log(' no my id ')
 }
async function sendOffer(to) {
   if(!peerConnection) {
     await initializePeerConnection(localMediaStream.getTracks());
     initializeDataChannel();
   }


   const offer = await peerConnection.createOffer();
   await peerConnection.setLocalDescription(offer);
   sendSocketMessage('offer', { offer, remoteId: to});
 }

const call = async () => {
  try {
    remoteId = document.getElementById('callId').value;
    
    if (!remoteId) {
      alert('Please enter a remote id');
      
      return;
    }

    console.log('call: ', remoteId);

    await initializePeerConnection(localMediaStream.getTracks());

    initializeDataChannel();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSocketMessage('offer', { offer, remoteId });
  } catch (error) {
    console.error('failed to initialize call', error);
  }
};

const hangup = () => socket.close();

const stop = () => {
  if (!localVideo.srcObject) return;

  for (const track of localVideo.srcObject.getTracks()) {
    console.log('stop track', track);
    track.stop();
  }

  for (const sender of peerConnection.getSenders()) {
    sender.track.stop();
  }

  dataChannel.close();
  peerConnection.close();
  callButton.disabled = true;
  hangupButton.disabled = true;
  screenShareButton.disabled = true;
  localVideo.srcObject = undefined;
  remoteVideo.srcObject = undefined;
};

const getLocalMediaStream = async () => {
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    console.log('got local media stream');
    localVideo.srcObject = mediaStream;

    return mediaStream;
  } catch (error) {
    console.error('failed to get local media stream', error);
  }
};

const initializePeerConnection = async (mediaTracks) => {
  const config = { iceServers: [{ urls: [ 'stun:stun1.l.google.com:19302' ] } ] };
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    if(isMain) {
      console.log('on icecandidate sending to', remoteId);
      sendSocketMessage('iceCandidate', { remoteId, candidate });
    }
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
    remoteVideo.srcObject = remoteMediaStream;
  };

  peerConnection.ondatachannel = ({ channel }) => {
    console.log('peerConnection::ondatachannel');
    dataChannel = channel;

    initializeDataChannelListeners();
  };

  if(mediaTracks) {
    for (const track of mediaTracks) {
      peerConnection.addTrack(track);
    }
  }


  hangupButton.disabled = false;
  screenShareButton.disabled = false;
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

const shareScreen = async () => {
  const mediaStream = await getLocalScreenCaptureStream();

  const screenTrack = mediaStream.getVideoTracks()[0];

  if (screenTrack) {
    console.log('replace camera track with screen track');
    replaceTrack(screenTrack);
  }
};

const getLocalScreenCaptureStream = async () => {
  try {
    const constraints = { video: { cursor: 'always' }, audio: false };

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
  document.getElementById('chatMessage').value = '';
};
