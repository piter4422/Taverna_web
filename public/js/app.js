/**
 * Taverna Web - Aplicação Principal
 * Gerencia a interface, eventos e integração com WebRTC e Socket.io
 */

document.addEventListener('DOMContentLoaded', () => {
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
  const streamAudio = document.getElementById('stream-audio');
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
  const viewersBadgeCount = document.getElementById('viewers-badge-count');
  const viewersListEl = document.getElementById('viewers-list');

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

  // Gerador de Código de Sala (ex: TAV-4A8B)
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
        // Host mantém mutado localmente para evitar eco
        streamVideo.muted = (userRole === 'host');
        streamVideo.play().catch(e => console.log('Autoplay local:', e));

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
          showToast('⚠️ Tela transmitida. (Lembre-se de marcar áudio na janela se quiser som!)');
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
        unmuteOverlay.classList.add('hidden');
        showToast('Transmissão de tela interrompida.');
        break;

      case 'remote-track-received':
        // Conecta o vídeo ao elemento de vídeo (mantido mudo para não conflitar com o áudio dedicado)
        if (event.stream.getVideoTracks().length > 0) {
          streamVideo.srcObject = event.stream;
          streamVideo.muted = true;
          streamVideo.play().catch(err => console.warn('[Player] Vídeo play:', err));
          videoPlaceholder.classList.add('hidden');
          liveIndicator.classList.remove('hidden');
          streamStatusText.textContent = 'AO VIVO';
          streamStatusText.style.color = 'var(--color-danger)';
          videoTrackStatus.textContent = 'Recebendo';
          videoTrackStatus.style.color = 'var(--color-success)';
        }

        const audioTracks = event.stream.getAudioTracks();
        const hasAudio = audioTracks.length > 0;
        audioTrackStatus.textContent = hasAudio ? 'Recebendo Som' : 'Sem Áudio';
        audioTrackStatus.style.color = hasAudio ? 'var(--color-success)' : 'var(--text-muted)';

        if (hasAudio && streamAudio) {
          // Utiliza stream exclusivo com a faixa de áudio para saída pura e independente
          streamAudio.srcObject = new MediaStream(audioTracks);
          streamAudio.volume = parseFloat(volumeSlider.value) || 1;
          streamAudio.muted = false;

          streamAudio.play().then(() => {
            console.log('[Áudio] Som da transmissão tocando perfeitamente!');
            unmuteOverlay.classList.add('hidden');
            muteIcon.textContent = '🔊';
          }).catch(err => {
            console.warn('[Áudio] Autoplay com som bloqueado pelo navegador. Clique para liberar som:', err);
            unmuteOverlay.classList.remove('hidden');
          });
        } else {
          unmuteOverlay.classList.add('hidden');
        }
        break;
    }
  }

  // Desmutar e ativar som pelo botão ou clique
  function unlockAudio() {
    unmuteOverlay.classList.add('hidden');
    if (streamAudio && streamAudio.srcObject) {
      streamAudio.muted = false;
      streamAudio.volume = parseFloat(volumeSlider.value) || 1;
      streamAudio.play().then(() => {
        muteIcon.textContent = '🔊';
        showToast('🔊 Som ativado com sucesso!');
      }).catch(err => {
        console.warn('Erro ao tocar áudio:', err);
      });
    }
  }

  btnUnmuteClick.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
  });

  videoContainer.addEventListener('click', (e) => {
    if (!unmuteOverlay.classList.contains('hidden')) {
      if (!e.target.closest('.video-controls') && !e.target.closest('.modal')) {
        unlockAudio();
      }
    }
  });

  // Socket: Eventos de Sala
  socket.on('room-joined', ({ roomId, role, hostOnline, isStreaming, viewerCount }) => {
    currentRoomId = roomId;
    userRole = role;

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

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Atualização em tempo real de quem está assistindo
  socket.on('viewer-list-update', ({ viewers, count }) => {
    viewerCountDisplay.textContent = count || 0;
    viewerSidebarCount.textContent = count || 0;
    if (viewersBadgeCount) viewersBadgeCount.textContent = count || 0;

    if (!viewersListEl) return;
    viewersListEl.innerHTML = '';

    if (!viewers || viewers.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-viewers-msg';
      emptyLi.textContent = 'Nenhum amigo na sala ainda.';
      viewersListEl.appendChild(emptyLi);
      return;
    }

    viewers.forEach(v => {
      const li = document.createElement('li');
      li.className = 'viewer-item';

      const initial = (v.username && v.username.trim().length > 0) ? v.username.trim().charAt(0).toUpperCase() : '?';

      li.innerHTML = `
        <div class="viewer-user-info">
          <div class="viewer-avatar">${initial}</div>
          <span class="viewer-name">${escapeHtml(v.username)}</span>
        </div>
        <span class="viewer-status-dot" title="Assistindo"></span>
      `;
      viewersListEl.appendChild(li);
    });
  });

  socket.on('viewer-count-update', ({ viewerCount }) => {
    viewerCountDisplay.textContent = viewerCount || 0;
    viewerSidebarCount.textContent = viewerCount || 0;
    if (viewersBadgeCount) viewersBadgeCount.textContent = viewerCount || 0;
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
    unmuteOverlay.classList.add('hidden');
    showToast('O Anfitrião pausou o compartilhamento.');
  });

  socket.on('host-disconnected', () => {
    streamVideo.srcObject = null;
    videoPlaceholder.classList.remove('hidden');
    liveIndicator.classList.add('hidden');
    streamStatusText.textContent = 'Anfitrião Saiu';
    unmuteOverlay.classList.add('hidden');
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
      const stream = await webrtc.startScreenCapture();
      if (stream) {
        const hasAudio = stream.getAudioTracks().length > 0;
        if (!hasAudio) {
          alert('⚠️ ATENÇÃO: Nenhum áudio foi detectado!\n\nNo Windows, para seus amigos ouvirem o som do jogo/app:\n1. Clique em "Trocar Janela/Tela"\n2. Selecione a aba "Tela inteira"\n3. Marque a caixinha "Compartilhar áudio do sistema" no canto inferior esquerdo.');
        }
      }
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
    if (streamAudio) streamAudio.volume = val;
    if (streamVideo) streamVideo.volume = val;
    if (val === 0) {
      if (streamAudio) streamAudio.muted = true;
      muteIcon.textContent = '🔇';
    } else {
      if (streamAudio) streamAudio.muted = false;
      muteIcon.textContent = val > 0.5 ? '🔊' : '🔉';
    }
  });

  btnToggleMute.addEventListener('click', () => {
    if (!streamAudio) return;
    streamAudio.muted = !streamAudio.muted;
    if (streamAudio.muted) {
      muteIcon.textContent = '🔇';
    } else {
      const val = streamAudio.volume;
      muteIcon.textContent = val > 0.5 ? '🔊' : '🔉';
    }
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
