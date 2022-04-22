const express = require('express');
const { createServer } = require('https');
const { readFileSync } = require('fs');
const { nanoid } = require('nanoid');
const { resolve } = require('path');
const { WebSocketServer, OPEN } = require('ws');

const app = express();

const createHttpsServer = () => {
  return createServer({
    cert: readFileSync(resolve(__dirname, './../ssl/cert.pem')),
    key: readFileSync(resolve(__dirname, './../ssl/cert.key'))
  });
};

const appServer = createServer({
  cert: readFileSync(resolve(__dirname, './../ssl/cert.pem')),
  key: readFileSync(resolve(__dirname, './../ssl/cert.key'))
}, app).listen(3000);

app.use(express.static(resolve(__dirname, './../public')));

const wsServer = createServer({
  cert: readFileSync(resolve(__dirname, './../ssl/cert.pem')),
  key: readFileSync(resolve(__dirname, './../ssl/cert.key'))
});
const wss = new WebSocketServer({ server: wsServer });

wss.on('connection', (socket) => {
  console.log('new connection');

  socket.on('message', (data) => {
  ////   console.log('socket::message data=%s', data);

    try {
      const jsonMessage = JSON.parse(data);
      handleJsonMessage(socket, jsonMessage);
    } catch (error) {
      console.error('failed to handle onmessage', error);
    }
  });

  socket.once('close', () => {
    console.log('socket::close');
  });
}); 

const handleJsonMessage = (socket, jsonMessage) => {
  const data = jsonMessage.data;
  switch (jsonMessage.action) {
    case 'start':
      socket.id = Math.round(Math.random() * 100)  + '';

      const clients = getClients().map((client => {return {id: client.id, sharing: client.sharing}}));
      emitMessage(socket, { action: 'start', id: socket.id,  clients});
      for(let str in wss.clients) {
        const sock = wss.clients[str];
        if(sock !== socket) emitMessage(socket, { action: 'clients',  clients});
      }
      break;
    case 'sharing':
      setSharing(socket);
      break;
    case 'ask-offer':
      askOffer(socket)
      break
    default: 
      console.log('remote', jsonMessage.data.remoteId);
      if (!jsonMessage.data.remoteId) return;
      const remotePeerSocket = getSocketById(jsonMessage.data.remoteId);

      if (!remotePeerSocket) {
        return console.log('failed to find remote socket with id', jsonMessage.data.remoteId);
      }

      if (jsonMessage.action !== 'offer') {
        delete jsonMessage.data.remoteId;
      } else {
        jsonMessage.data.remoteId = socket.id;
      }

      emitMessage(remotePeerSocket, jsonMessage);
  }
};

function setSharing(socket) {
  const sharing = getSharing();
  if(sharing && sharing.id !== socket.id) {
    emitMessage(socket, { action: 'sharing', error: sharing.id});
  } else {
    socket.sharing = true;
    emitMessage(socket, { action: 'sharing', success: socket.id});
  }
}

function askOffer(socket) {
  const sharing = getSharing();
  if(!sharing) {
    emitMessage(socket, { action: 'ask-offer', error: 'no-sharing'});
  } else {
    emitMessage(sharing, { action: 'send-offer', to: socket.id});
  }
}

const emitMessage = (socket, jsonMessage) => {
  if (socket.readyState === OPEN) {
    socket.send(JSON.stringify(jsonMessage));
  }else console.log('ERROR SOCKET CLOSED')
};


const getSharing = () =>  Array.from(wss.clients).find((client => client.sharing));


const getSocketById = (socketId) =>
  Array.from(wss.clients).find((client => client.id === socketId));

const getClients = () => Array.from(wss.clients);
wsServer.listen(8888);
console.log('app server listening on port 3000');
console.log('wss server listening on port 8888');
