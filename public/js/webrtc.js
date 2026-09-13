/**
 * Gerenciador WebRTC Robusto para Taverna Web
 * Suporta transmissão Host (1-N) e recepção Viewer de vídeo e som do sistema/aplicativo.
 * Inclui fila de ICE Candidates (evita perda de pacotes antes de setRemoteDescription)
 * e servidores STUN redundantes para conexão entre redes diferentes.
 */

class WebRTCManager {
  constructor(socket, onStatusChange) {
    this.socket = socket;
    this.onStatusChange = onStatusChange || (() => {});

    this.localStream = null;
    this.remoteStream = null;

    // Lista de espectadores conectados conhecidos pelo Host
    this.connectedViewers = new Set();

    // Mapa de conexões para o Host: viewerId -> RTCPeerConnection
    this.hostPeers = new Map();
    // Fila de ICE candidates do Host por espectador
    this.hostIceQueues = new Map();

    // Conexão do Espectador com o Host
    this.viewerPeer = null;
    this.hostSocketId = null;
    this.viewerIceQueue = [];

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // HOST: Espectador conectado
    this.socket.on('viewer-joined', async ({ viewerId }) => {
      console.log(`[WebRTC] Espectador entrou na sala: ${viewerId}`);
      this.connectedViewers.add(viewerId);

      if (this.localStream) {
        console.log(`[WebRTC] Host já está transmitindo. Criando oferta para ${viewerId}`);
        await this.createHostPeerConnection(viewerId);
      }
    });

    // HOST: Espectador saiu
    this.socket.on('viewer-left', ({ viewerId }) => {
      this.connectedViewers.delete(viewerId);
      this.hostIceQueues.delete(viewerId);

      if (this.hostPeers.has(viewerId)) {
        const pc = this.hostPeers.get(viewerId);
        pc.close();
        this.hostPeers.delete(viewerId);
        console.log(`[WebRTC] Conexão com espectador ${viewerId} finalizada.`);
      }
    });

    // ESPECTADOR: Recebe oferta do Host
    this.socket.on('signal-offer', async ({ from, offer }) => {
      console.log(`[WebRTC] Oferta SDP recebida do Host (${from})`);
      this.hostSocketId = from;
      await this.handleOfferFromHost(from, offer);
    });

    // HOST: Recebe resposta (answer) do Espectador
    this.socket.on('signal-answer', async ({ from, answer }) => {
      console.log(`[WebRTC] Resposta SDP recebida do espectador ${from}`);
      const pc = this.hostPeers.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log(`[WebRTC] Remote description aplicada no Host para ${from}`);

          // Drenar ICE candidates da fila do host para esse espectador
          const queue = this.hostIceQueues.get(from) || [];
          while (queue.length > 0) {
            const cand = queue.shift();
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        } catch (err) {
          console.error('[WebRTC] Erro ao aplicar answer no Host:', err);
        }
      }
    });

    // AMBOS: Troca de ICE Candidates com bufferização
    this.socket.on('signal-ice', async ({ from, candidate }) => {
      if (!candidate) return;

      try {
        // Se for o Espectador recebendo do Host
        if (this.viewerPeer && this.hostSocketId === from) {
          if (!this.viewerPeer.remoteDescription || !this.viewerPeer.remoteDescription.type) {
            // Guardar na fila se o remoteDescription ainda não estiver pronto
            this.viewerIceQueue.push(candidate);
          } else {
            await this.viewerPeer.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } 
        // Se for o Host recebendo do Espectador
        else if (this.hostPeers.has(from)) {
          const pc = this.hostPeers.get(from);
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            if (!this.hostIceQueues.has(from)) {
              this.hostIceQueues.set(from, []);
            }
            this.hostIceQueues.get(from).push(candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Erro ao adicionar ICE candidate:', err);
      }
    });
  }

  /**
   * Captura a tela e o áudio do sistema/aplicativo selecionado pelo usuário.
   */
  async startScreenCapture() {
    try {
      const displayMediaOptions = {
        video: {
          cursor: 'always',
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false
        }
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      this.localStream = stream;

      const hasAudio = stream.getAudioTracks().length > 0;
      const hasVideo = stream.getVideoTracks().length > 0;

      console.log(`[WebRTC] Captura iniciada. Vídeo: ${hasVideo}, Áudio: ${hasAudio}`);

      this.onStatusChange({
        type: 'stream-started',
        hasAudio,
        hasVideo,
        stream
      });

      // Se o usuário clicar em "Interromper compartilhamento" nativo do navegador
      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenCapture();
      };

      // Notificar servidor e conectar com todos os espectadores presentes
      this.socket.emit('stream-started');
      for (const viewerId of this.connectedViewers) {
        await this.createHostPeerConnection(viewerId);
      }

      return stream;
    } catch (err) {
      console.error('[WebRTC] Erro ao capturar tela/áudio:', err);
      throw err;
    }
  }

  /**
   * Troca a tela ou janela em tempo real sem derrubar a sala
   */
  async switchScreenCapture() {
    if (!this.localStream) return this.startScreenCapture();

    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 60, max: 60 } },
        audio: { echoCancellation: false, noiseSuppression: false }
      });

      const oldVideoTrack = this.localStream.getVideoTracks()[0];
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldAudioTrack = this.localStream.getAudioTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      // Substituir os tracks em cada conexão peer aberta
      for (const [, pc] of this.hostPeers) {
        const senders = pc.getSenders();
        if (newVideoTrack) {
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(newVideoTrack);
        }
        if (newAudioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) await audioSender.replaceTrack(newAudioTrack);
        }
      }

      if (oldVideoTrack) oldVideoTrack.stop();
      if (oldAudioTrack) oldAudioTrack.stop();

      this.localStream = newStream;

      newVideoTrack.onended = () => {
        this.stopScreenCapture();
      };

      this.onStatusChange({
        type: 'stream-switched',
        hasAudio: newStream.getAudioTracks().length > 0,
        hasVideo: true,
        stream: newStream
      });

      return newStream;
    } catch (err) {
      console.warn('[WebRTC] Troca de tela cancelada:', err);
    }
  }

  stopScreenCapture() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    for (const [, pc] of this.hostPeers) {
      pc.close();
    }
    this.hostPeers.clear();
    this.hostIceQueues.clear();

    this.socket.emit('stream-stopped');
    this.onStatusChange({ type: 'stream-stopped' });
  }

  /**
   * HOST: Cria conexão com um espectador específico
   */
  async createHostPeerConnection(viewerId) {
    if (this.hostPeers.has(viewerId)) {
      this.hostPeers.get(viewerId).close();
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    });
    this.hostPeers.set(viewerId, pc);
    this.hostIceQueues.set(viewerId, []);

    // Adiciona faixas de áudio e vídeo
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal-ice', {
          to: viewerId,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Host -> Espectador ${viewerId}] ICE State: ${pc.iceConnectionState}`);
    };

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);

      this.socket.emit('signal-offer', {
        to: viewerId,
        offer: pc.localDescription
      });
    } catch (err) {
      console.error('[WebRTC] Erro ao criar oferta:', err);
    }
  }

  /**
   * ESPECTADOR: Processa oferta do Host
   */
  async handleOfferFromHost(hostId, offer) {
    if (this.viewerPeer) {
      this.viewerPeer.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    });
    this.viewerPeer = pc;
    this.viewerIceQueue = [];

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Faixa recebida do Host: ${event.track.kind}`);
      
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      this.remoteStream = stream;

      this.onStatusChange({
        type: 'remote-track-received',
        stream: this.remoteStream,
        trackKind: event.track.kind,
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal-ice', {
          to: hostId,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Espectador -> Host] ICE State: ${pc.iceConnectionState}`);
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC] Remote description configurada no Espectador.');

      // Drenar candidatos acumulados na fila do espectador
      while (this.viewerIceQueue.length > 0) {
        const cand = this.viewerIceQueue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('signal-answer', {
        to: hostId,
        answer: pc.localDescription
      });
    } catch (err) {
      console.error('[WebRTC] Erro ao responder oferta no Espectador:', err);
    }
  }

  destroy() {
    this.stopScreenCapture();
    if (this.viewerPeer) {
      this.viewerPeer.close();
      this.viewerPeer = null;
    }
    this.connectedViewers.clear();
  }
}

window.WebRTCManager = WebRTCManager;
