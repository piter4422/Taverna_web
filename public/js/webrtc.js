/**
 * Gerenciador WebRTC para Taverna Web
 * Suporta transmissão Host (1-N) e recepção Viewer de vídeo e som do sistema/aplicativo.
 */

class WebRTCManager {
  constructor(socket, onStatusChange) {
    this.socket = socket;
    this.onStatusChange = onStatusChange || (() => {});

    this.localStream = null;
    this.remoteStream = null;

    // Mapa de conexões para o Host: viewerId -> RTCPeerConnection
    this.hostPeers = new Map();

    // Conexão única para o Espectador: RTCPeerConnection
    this.viewerPeer = null;
    this.hostSocketId = null;

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // HOST: Espectador conectado solicita stream
    this.socket.on('viewer-joined', async ({ viewerId }) => {
      console.log(`[WebRTC] Espectador entrou: ${viewerId}`);
      if (this.localStream) {
        await this.createHostPeerConnection(viewerId);
      }
    });

    // HOST: Espectador saiu
    this.socket.on('viewer-left', ({ viewerId }) => {
      if (this.hostPeers.has(viewerId)) {
        const pc = this.hostPeers.get(viewerId);
        pc.close();
        this.hostPeers.delete(viewerId);
        console.log(`[WebRTC] Conexão com espectador ${viewerId} finalizada.`);
      }
    });

    // ESPECTADOR: Recebe oferta do Host
    this.socket.on('signal-offer', async ({ from, offer }) => {
      console.log(`[WebRTC] Oferta recebida do Host (${from})`);
      this.hostSocketId = from;
      await this.handleOfferFromHost(from, offer);
    });

    // HOST: Recebe resposta do Espectador
    this.socket.on('signal-answer', async ({ from, answer }) => {
      console.log(`[WebRTC] Resposta recebida do espectador ${from}`);
      const pc = this.hostPeers.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[WebRTC] Erro ao aplicar answer:', err);
        }
      }
    });

    // AMBOS: Troca de ICE Candidates
    this.socket.on('signal-ice', async ({ from, candidate }) => {
      try {
        if (this.viewerPeer && this.hostSocketId === from) {
          await this.viewerPeer.addIceCandidate(new RTCIceCandidate(candidate));
        } else if (this.hostPeers.has(from)) {
          const pc = this.hostPeers.get(from);
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('[WebRTC] Erro ao adicionar ICE candidate:', err);
      }
    });
  }

  /**
   * Captura a tela e o áudio do sistema/aplicativo selecionado pelo usuário.
   * Não captura microfone, garantindo privacidade total.
   */
  async startScreenCapture() {
    try {
      // Configuração para captura com alta fidelidade de áudio e 60 FPS
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

      // Se o usuário clicar em "Interromper compartilhamento" na barra nativa do navegador
      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenCapture();
      };

      // Conectar a todos os espectadores que já estão na sala
      this.socket.emit('stream-started');
      for (const [viewerId] of this.hostPeers) {
        await this.createHostPeerConnection(viewerId);
      }

      return stream;
    } catch (err) {
      console.error('[WebRTC] Erro ao capturar tela/áudio:', err);
      throw err;
    }
  }

  /**
   * Permite trocar a janela/tela em tempo real sem desconectar os amigos.
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

      // Substituir os tracks em cada conexão peer aberta com espectadores
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

      // Parar faixas antigas
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
      console.warn('[WebRTC] Troca de tela cancelada ou falhou:', err);
    }
  }

  /**
   * Para a captura e notifica espectadores
   */
  stopScreenCapture() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Fechar todas as conexões peer
    for (const [, pc] of this.hostPeers) {
      pc.close();
    }
    this.hostPeers.clear();

    this.socket.emit('stream-stopped');
    this.onStatusChange({ type: 'stream-stopped' });
  }

  /**
   * HOST: Cria uma conexão WebRTC para um espectador específico e envia oferta
   */
  async createHostPeerConnection(viewerId) {
    if (this.hostPeers.has(viewerId)) {
      this.hostPeers.get(viewerId).close();
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.hostPeers.set(viewerId, pc);

    // Adiciona tracks de vídeo e som
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

    pc.onconnectionstatechange = () => {
      console.log(`[Host PC State com ${viewerId}]: ${pc.connectionState}`);
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
      console.error('[WebRTC] Erro ao criar oferta para espectador:', err);
    }
  }

  /**
   * ESPECTADOR: Responde à oferta do Host
   */
  async handleOfferFromHost(hostId, offer) {
    if (this.viewerPeer) {
      this.viewerPeer.close();
    }

    this.remoteStream = new MediaStream();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.viewerPeer = pc;

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Faixa recebida do Host: ${event.track.kind}`);
      this.remoteStream.addTrack(event.track);
      this.onStatusChange({
        type: 'remote-track-received',
        stream: this.remoteStream,
        trackKind: event.track.kind
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

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('signal-answer', {
        to: hostId,
        answer: pc.localDescription
      });
    } catch (err) {
      console.error('[WebRTC] Erro ao processar oferta e responder:', err);
    }
  }

  /**
   * Limpa todas as conexões
   */
  destroy() {
    this.stopScreenCapture();
    if (this.viewerPeer) {
      this.viewerPeer.close();
      this.viewerPeer = null;
    }
  }
}

window.WebRTCManager = WebRTCManager;
