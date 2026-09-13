/**
 * Taverna Web - Aplicação Principal
 * Gerencia a interface, eventos e integração com WebRTC e Socket.io
 */

document.addEventListener('DOMContentLoaded', () => {
  // Conexão com Socket.io
  const socket = io();

  // Estado da Aplicação
  let currentRoomId = null;
  let userRole = null; // 'host' | 'viewer'
  let username = 'Amigo da Taverna';
  let webrtc = null;

  // Elementos DOM - Cabeçalho e Navegação
  const brandLogo = document.getElementById('brand-logo');
  const roomNavInfo = document.getElementById('room-nav-info');
  const currentRoomDisplay = document.getElementById('current-room-display');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const liveIndicator = document.getElementById('live-indicator');
  const streamStatusText = document.getElementById('stream-status-text');
  const viewerCountDisplay = document.getElementById('viewer-count');
  const btnLeaveRoom = document.getElementById('btn-leave-room');

  // Elementos DOM - Lobby
  const lobbyView = document.getElementById('lobby-view');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const formJoinRoom = document.getElementById('form-join-room');
  const inputRoomCode = document.getElementById('input-room-code');
  const inputUsername = document.getElementById('input-username');

  // Elementos DOM - Sala e Player
  const roomView = document.getElementById('room-view');
  const videoContainer = document.getElementById('video-container');
  const streamVideo = document.getElementById('stream-video');
  const videoPlaceholder = document.getElementById('video-placeholder');
  const hostPlaceholder = document.getElementById('host-placeholder');
  const viewerPlaceholder = document.getElementById('viewer-placeholder');
  const unmuteOverlay = document.getElementById('unmute-overlay');
  const btnUnmuteClick = document.getElementById('btn-unmute-click');

  // Elementos DOM - Controles do Player
  const hostControls = document.getElementById('host-controls');
  const viewerControls = document.getElementById('viewer-controls');
  const btnStartStream = document.getElementById('btn-start-stream');
  const btnChangeScreen = document.getElementById('btn-change-screen');
  const btnStopStream = document.getElementById('btn-stop-stream');
  const btnToggleMute = document.getElementById('btn-toggle-mute');
  const muteIcon = document.getElementById('mute-icon');
  const volumeSlider = document.getElementById('volume-slider');
  const btnTheatre = document.getElementById('btn-theatre');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const streamLayout = document.querySelector('.stream-layout');
  const reactionsContainer = document.getElementById('reactions-container');

  // Elementos DOM - Barra Lateral
  const shareableLinkInput = document.getElementById('shareable-link-input');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const roleDisplay = document.getElementById('role-display');
  const videoTrackStatus = document.getElementById('video-track-status');
  const audioTrackStatus = document.getElementById('audio-track-status');
  const viewerSidebarCount = document.getElementById('viewer-sidebar-count');

  // Toast Notifier
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(message, duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  }

  // Gerador de Código de Sala Curto e Amigável (ex: TAV-4A8B)
  function generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TAV-${code}`;
  }

  // Inicializar WebRTC
  webrtc = new WebRTCManager(socket, handleWebRTCEvent);

  function handleWebRTCEvent(event) {
    switch (event.type) {
      case 'stream-started':
      case 'stream-switched':
        streamVideo.srcObject = event.stream;
        // Se for Host, mantém mudo localmente para não dar eco nos próprios alto-falantes
        streamVideo.muted = (userRole === 'host');
        streamVideo.play().catch(e => console.log('Autoplay:', e));

        videoPlaceholder.classList.add('hidden');
        liveIndicator.classList.remove('hidden');
        streamStatusText.textContent = 'AO VIVO';
        streamStatusText.style.color = 'var(--color-danger)';
        videoTrackStatus.textContent = 'Ativo (60 FPS)';
        videoTrackStatus.style.color = 'var(--color-success)';
        audioTrackStatus.textContent = event.hasAudio ? 'Transmitindo Som' : 'Sem Áudio Selecionado';
        audioTrackStatus.style.color = event.hasAudio ? 'var(--color-success)' : 'var(--text-muted)';
        
        if (event.hasAudio) {
          showToast('🔊 Transmissão iniciada com áudio do sistema/aplicativo!');
        } else {
          showToast('⚠️ Tela transmitida, mas você não selecionou a opção de áudio.');
        }
        break;

      case 'stream-stopped':
        streamVideo.srcObject = null;
        videoPlaceholder.classList.remove('hidden');
        liveIndicator.classList.add('hidden');
        streamStatusText.textContent = 'Transmissão Pausada';
        streamStatusText.style.color = 'var(--text-muted)';
        videoTrackStatus.textContent = 'Inativo';
        videoTrackStatus.style.color = 'var(--text-muted)';
        audioTrackStatus.textContent = 'Inativo';
        audioTrackStatus.style.color = 'var(--text-muted)';
        showToast('Transmissão de tela interrompida.');
        break;

      case 'remote-track-received':
        streamVideo.srcObject = event.stream;
        streamVideo.muted = false; // Espectador ouve o áudio
        videoPlaceholder.classList.add('hidden');
        liveIndicator.classList.remove('hidden');
        streamStatusText.textContent = 'AO VIVO';
        streamStatusText.style.color = 'var(--color-danger)';
        videoTrackStatus.textContent = 'Recebendo';
        videoTrackStatus.style.color = 'var(--color-success)';

        // Tentar reproduzir com som
        streamVideo.play().catch(err => {
          console.warn('Autoplay bloqueado pelo navegador. Exibindo botão de clique para ativar áudio:', err);
          unmuteOverlay.classList.remove('hidden');
        });
        break;
    }
  }

  // Socket: Eventos de Sala
  socket.on('room-joined', ({ roomId, role, hostOnline, isStreaming, viewerCount }) => {
    currentRoomId = roomId;
    userRole = role;

    // Atualizar UI
    lobbyView.classList.add('hidden');
    roomView.classList.remove('hidden');
    roomNavInfo.classList.remove('hidden');

    currentRoomDisplay.textContent = roomId;
    const shareUrl = `${window.location.origin}/?room=${roomId}`;
    shareableLinkInput.value = shareUrl;

    viewerCountDisplay.textContent = viewerCount || 0;
    viewerSidebarCount.textContent = viewerCount || 0;

    if (role === 'host') {
      roleDisplay.textContent = '👑 Anfitrião';
      hostControls.classList.remove('hidden');
      viewerControls.classList.add('hidden');
      hostPlaceholder.classList.remove('hidden');
      viewerPlaceholder.classList.add('hidden');
      showToast(`Taverna criada! Código: ${roomId}`);
    } else {
      roleDisplay.textContent = '👀 Espectador';
      hostControls.classList.add('hidden');
      viewerControls.classList.remove('hidden');
      hostPlaceholder.classList.add('hidden');
      viewerPlaceholder.classList.remove('hidden');

      if (!hostOnline) {
        streamStatusText.textContent = 'Anfitrião Ausente';
      } else if (!isStreaming) {
        streamStatusText.textContent = 'Aguardando Início';
      }
      showToast(`Você entrou na Taverna: ${roomId}`);
    }
  });

  socket.on('viewer-count-update', ({ viewerCount }) => {
    viewerCountDisplay.textContent = viewerCount;
    viewerSidebarCount.textContent = viewerCount;
  });

  socket.on('host-stream-started', () => {
    viewerPlaceholder.classList.add('hidden');
    streamStatusText.textContent = 'Conectando ao sinal...';
    showToast('O Anfitrião começou a transmitir a tela!');
  });

  socket.on('host-stream-stopped', () => {
    streamVideo.srcObject = null;
    videoPlaceholder.classList.remove('hidden');
    liveIndicator.classList.add('hidden');
    streamStatusText.textContent = 'Transmissão Pausada';
    videoTrackStatus.textContent = 'Aguardando';
    audioTrackStatus.textContent = 'Inativo';
    showToast('O Anfitrião pausou o compartilhamento.');
  });

  socket.on('host-disconnected', () => {
    streamVideo.srcObject = null;
    videoPlaceholder.classList.remove('hidden');
    liveIndicator.classList.add('hidden');
    streamStatusText.textContent = 'Anfitrião Saiu';
    showToast('O Anfitrião saiu da Taverna.');
  });

  // Reações Rápidas e Emojis Flutuantes
  socket.on('new-reaction', ({ reaction, username: sender }) => {
    spawnFloatingReaction(reaction);
    showToast(`${sender}: ${reaction}`, 1500);
  });

  function spawnFloatingReaction(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    // Posição horizontal aleatória no container de vídeo
    const leftPercent = Math.floor(Math.random() * 70) + 15;
    el.style.left = `${leftPercent}%`;
    reactionsContainer.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 2900);
  }

  // --- Ações do Usuário ---

  // 1. Criar Sala (Host)
  btnCreateRoom.addEventListener('click', () => {
    const newRoomCode = generateRoomCode();
    socket.emit('join-room', {
      roomId: newRoomCode,
      role: 'host',
      username: 'Anfitrião'
    });
  });

  // 2. Entrar em Sala (Viewer)
  formJoinRoom.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = inputRoomCode.value.trim().toUpperCase();
    const name = inputUsername.value.trim() || 'Amigo da Taverna';
    if (!code) return;

    username = name;
    socket.emit('join-room', {
      roomId: code,
      role: 'viewer',
      username: name
    });
  });

  // 3. Compartilhar Tela / Aplicativo
  btnStartStream.addEventListener('click', async () => {
    try {
      await webrtc.startScreenCapture();
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        alert('Não foi possível iniciar o compartilhamento: ' + err.message);
      }
    }
  });

  // 4. Trocar Tela ou Aplicativo
  btnChangeScreen.addEventListener('click', async () => {
    try {
      await webrtc.switchScreenCapture();
    } catch (err) {
      console.error('Erro na troca de tela:', err);
    }
  });

  // 5. Parar Transmissão
  btnStopStream.addEventListener('click', () => {
    webrtc.stopScreenCapture();
  });

  // 6. Copiar Código e Link
  function copyLinkAction() {
    if (!shareableLinkInput.value) return;
    navigator.clipboard.writeText(shareableLinkInput.value).then(() => {
      showToast('📋 Link copiado! Envie para seus amigos.');
    }).catch(() => {
      shareableLinkInput.select();
      document.execCommand('copy');
      showToast('📋 Link copiado!');
    });
  }

  btnCopyCode.addEventListener('click', copyLinkAction);
  btnCopyShareLink.addEventListener('click', copyLinkAction);

  // 7. Controle de Volume e Áudio (Viewer)
  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    streamVideo.volume = val;
    if (val === 0) {
      streamVideo.muted = true;
      muteIcon.textContent = '🔇';
    } else {
      streamVideo.muted = false;
      muteIcon.textContent = val > 0.5 ? '🔊' : '🔉';
    }
  });

  btnToggleMute.addEventListener('click', () => {
    streamVideo.muted = !streamVideo.muted;
    if (streamVideo.muted) {
      muteIcon.textContent = '🔇';
    } else {
      const val = streamVideo.volume;
      muteIcon.textContent = val > 0.5 ? '🔊' : '🔉';
    }
  });

  // Botão de desmutar caso bloqueado por autoplay
  btnUnmuteClick.addEventListener('click', () => {
    streamVideo.muted = false;
    streamVideo.play().then(() => {
      unmuteOverlay.classList.add('hidden');
      muteIcon.textContent = '🔊';
      showToast('🔊 Som ativado!');
    }).catch(err => console.error(err));
  });

  // 8. Reações Rápidas
  document.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      socket.emit('send-reaction', {
        reaction: emoji,
        username: username
      });
    });
  });

  // 9. Modo Teatro
  btnTheatre.addEventListener('click', () => {
    streamLayout.classList.toggle('theatre-mode');
  });

  // 10. Tela Cheia
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(err => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // 11. Sair da Sala
  function leaveRoom() {
    webrtc.destroy();
    window.location.href = '/';
  }

  btnLeaveRoom.addEventListener('click', leaveRoom);
  brandLogo.addEventListener('click', () => {
    if (currentRoomId) {
      if (confirm('Deseja sair da sala atual e voltar para o início?')) {
        leaveRoom();
      }
    }
  });

  // 12. Checagem de Parâmetros de URL (?room=...)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    inputRoomCode.value = roomParam.trim().toUpperCase();
    showToast(`Código de sala ${roomParam.toUpperCase()} detectado. Clique em "Entrar na Taverna"!`);
  }
});
