const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para qualquer rota direcionar para index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Estrutura de armazenamento de salas em memória
// rooms: { [roomId]: { hostId: string, isStreaming: boolean, viewers: Map<socketId, { username }> } }
const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoomId = null;
  let userRole = null; // 'host' | 'viewer'

  // Criar ou entrar em uma sala
  socket.on('join-room', ({ roomId, role, username }) => {
    currentRoomId = roomId.trim().toUpperCase();
    userRole = role;

    socket.join(currentRoomId);

    if (!rooms.has(currentRoomId)) {
      rooms.set(currentRoomId, {
        hostId: null,
        isStreaming: false,
        viewers: new Map()
      });
    }

    const room = rooms.get(currentRoomId);

    function broadcastViewerList(rId) {
      if (!rooms.has(rId)) return;
      const r = rooms.get(rId);
      const list = Array.from(r.viewers.entries()).map(([id, data]) => ({
        id,
        username: data.username
      }));
      io.to(rId).emit('viewer-list-update', {
        viewers: list,
        count: list.length
      });
    }

    if (role === 'host') {
      room.hostId = socket.id;
      socket.emit('room-joined', {
        roomId: currentRoomId,
        role: 'host',
        viewerCount: room.viewers.size
      });
      broadcastViewerList(currentRoomId);
      console.log(`[Host Conectado] Sala: ${currentRoomId}, Socket: ${socket.id}`);
    } else {
      // É espectador
      room.viewers.set(socket.id, { username: username || 'Amigo da Taverna' });
      
      socket.emit('room-joined', {
        roomId: currentRoomId,
        role: 'viewer',
        hostOnline: !!room.hostId,
        isStreaming: room.isStreaming,
        viewerCount: room.viewers.size
      });

      // Se o host já estiver transmitindo, avisa o espectador para preparar o player
      if (room.isStreaming) {
        socket.emit('host-stream-started');
      }

      // Notificar o Host que um novo espectador entrou
      if (room.hostId) {
        io.to(room.hostId).emit('viewer-joined', {
          viewerId: socket.id,
          username: username || 'Amigo da Taverna',
          viewerCount: room.viewers.size
        });
      }

      // Atualizar contagem e lista para todos na sala
      broadcastViewerList(currentRoomId);
      console.log(`[Espectador Conectado] Sala: ${currentRoomId}, Socket: ${socket.id}`);
    }
  });

  // Notificar início de transmissão pelo Host
  socket.on('stream-started', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.hostId === socket.id) {
      room.isStreaming = true;
      socket.to(currentRoomId).emit('host-stream-started');
      console.log(`[Transmissão Iniciada] Sala: ${currentRoomId}`);
    }
  });

  // Notificar fim de transmissão pelo Host
  socket.on('stream-stopped', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.hostId === socket.id) {
      room.isStreaming = false;
      socket.to(currentRoomId).emit('host-stream-stopped');
      console.log(`[Transmissão Pausada/Encerrada] Sala: ${currentRoomId}`);
    }
  });

  // Roteamento de Sinalização WebRTC
  // 1. Host envia oferta para um espectador específico
  socket.on('signal-offer', ({ to, offer }) => {
    io.to(to).emit('signal-offer', {
      from: socket.id,
      offer
    });
  });

  // 2. Espectador envia resposta (answer) para o Host
  socket.on('signal-answer', ({ to, answer }) => {
    io.to(to).emit('signal-answer', {
      from: socket.id,
      answer
    });
  });

  // 3. Troca de ICE Candidates (ponto a ponto)
  socket.on('signal-ice', ({ to, candidate }) => {
    io.to(to).emit('signal-ice', {
      from: socket.id,
      candidate
    });
  });

  // Envio de mensagens de chat rápido / reações
  socket.on('send-reaction', ({ reaction, username }) => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit('new-reaction', {
      reaction,
      username: username || 'Convidado',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Desconexão
  socket.on('disconnect', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);

    if (socket.id === room.hostId) {
      // Host desconectou
      room.hostId = null;
      room.isStreaming = false;
      io.to(currentRoomId).emit('host-disconnected');
      console.log(`[Host Desconectou] Sala: ${currentRoomId}`);
    } else if (room.viewers.has(socket.id)) {
      // Espectador desconectou
      room.viewers.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('viewer-left', {
          viewerId: socket.id,
          viewerCount: room.viewers.size
        });
      }
      
      const list = Array.from(room.viewers.entries()).map(([id, data]) => ({
        id,
        username: data.username
      }));
      io.to(currentRoomId).emit('viewer-list-update', {
        viewers: list,
        count: list.length
      });
      console.log(`[Espectador Saiu] Sala: ${currentRoomId}, Restam: ${room.viewers.size}`);
    }

    // Limpar sala vazia se não houver mais ninguém
    if (!room.hostId && room.viewers.size === 0) {
      rooms.delete(currentRoomId);
      console.log(`[Sala Excluída por Inatividade] Sala: ${currentRoomId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🍺 Taverna Web rodando na porta ${PORT}`);
  console.log(`🌐 Acesse localmente: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
