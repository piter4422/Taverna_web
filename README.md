# 🍺 Taverna Web

Plataforma web moderna para transmissão de tela e som de aplicativos/jogos em tempo real com amigos, utilizando **WebRTC P2P** com baixíssima latência, sem captura de voz/microfone.

![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-blue.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-v4-black.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

---

## ✨ Recursos

- 🖥️ **Transmissão Flexível**: Escolha entre monitor completo, janelas de programas específicos ou abas.
- 🔊 **Som do Sistema e Aplicativos**: Transmita áudio de jogos, filmes e softwares em alta fidelidade.
- 🔒 **Foco e Privacidade**: Sem captura de microfone/voz — apenas o conteúdo visual e sonoro da tela selecionada.
- ⚡ **Tempo Real (P2P)**: Latência mínima garantida via WebRTC e servidores STUN públicos.
- 🔄 **Troca Rápida de Tela**: Alterne de aplicativo sem fechar a sala ou desconectar os amigos.
- 🔗 **Salas com Link Direto**: Crie uma sala com código curto e compartilhe o link de convite em um clique.
- 🎭 **Modo Teatro e Reações Rápidas**: Controles de volume deslizante, tela cheia, modo cinema e emojis flutuantes (🍺, 🔥, 👏, 🎮).

---

## 🚀 Como Executar Localmente

### 1. Clonar o repositório
```bash
git clone https://github.com/piter4422/Taverna_web.git
cd Taverna_web
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Iniciar o servidor
```bash
npm start
```

Acesse em seu navegador:
👉 `http://localhost:3000`

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express, Socket.io (sinalização WebRTC)
- **Frontend**: HTML5 Semântico, Vanilla CSS (Design Taverna com glassmorphism e cores âmbar)
- **Streaming**: WebRTC (`RTCPeerConnection`, `getDisplayMedia`)

---

## 💡 Dica de Compartilhamento de Som

Ao clicar em **"Selecionar Tela & Iniciar"**, o navegador abrirá a janela de permissão nativa. Certifique-se de **marcar a opção "Compartilhar áudio do sistema"** (ou "Compartilhar áudio da guia") para que seus amigos possam ouvir os sons do seu jogo ou aplicativo!
