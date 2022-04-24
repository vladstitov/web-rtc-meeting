const express = require('express');
const { createServer } = require('https');
const { readFileSync } = require('fs');
const { nanoid } = require('nanoid');
const { resolve } = require('path');

const  {SerialPort}= require('serialport');



const { WebSocketServer, OPEN } = require('ws');


SerialPort.list().then(res => {
  console.log('list', res);

  // serialPort.write('ROBOT POWER ON')
});

const serialPort= new SerialPort( {
  path:'COM3',
  baudRate: 9600
});


serialPort.on("open", function () {
  console.log('serial open');
setTimeout(() => {
    sendSerial('b');
  }, 1000);

})

let serialData = ''

serialPort.on('data', function(data) {
serialData+=data;
if(serialData.slice(-2) === '\r\n') {
  console.log('on data ' + serialData.toString().slice(0, -2));
}
});

serialPort.on('close', function () {
  console.log('serial closed ');
});
serialPort.on('error', function (err) {
  console.log('serial error ' , err);
});
function sendSerial(str) {
  console.log(': ' + str);
  serialPort.write(str + '\n');
}

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
  const action = jsonMessage.action;
  console.log(action + ' to:', jsonMessage.to + ' from:' +  socket.id);
  const to = jsonMessage.to;

  switch (action) {
    case 'com':
      sendSerial(data);
          break;
    case 'start':
      socket.id = Math.round(Math.random() * 10000)  + '';
      const clients = getClients().map((client => {return {id: client.id, sharing: client.sharing}}));
      emitMessage(socket, { action: 'start',  data:{id: socket.id,  clients}});
      for(let str in wss.clients) {
        const sock = wss.clients[str];
        if(sock !== socket) emitMessage(socket, { action: 'clients',  data:{clients}});
      }
      break;
    case 'sharing':
      setSharing(socket);
      break;
    case 'ask-offer':
      askOffer(socket)
      break
    default: 

      if (!to) {
        console.log(' to??????')
        return;
      }
      const remotePeerSocket = getSocketById(to);
      if (!remotePeerSocket) {
        return console.log('failed to find remote socket with id', to);
      }

     /* if (jsonMessage.action !== 'offer') {
        delete jsonMessage.data.remoteId;
      } else {*/
        jsonMessage.from = socket.id;
    //  }

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
    emitMessage(sharing, { action: 'send-offer', from: socket.id});
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
