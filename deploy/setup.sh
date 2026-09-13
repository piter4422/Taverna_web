#!/bin/bash
set -e

DOMAIN="tavernaweb.ddns.net"

echo "========================================="
echo "🍺 Instalando e Configurando Taverna Web"
echo "🌐 Domínio: https://$DOMAIN"
echo "========================================="

# Atualizar pacotes
sudo apt update -y && sudo apt upgrade -y

# Instalar Nginx, Certbot e Git (caso não estejam instalados)
sudo apt install -y nginx certbot python3-certbot-nginx git curl

# Instalar Node.js 20 LTS se não existir
if ! command -v node &> /dev/null; then
    echo "Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Instalar PM2 globalmente
sudo npm install -g pm2

# Instalar dependências da aplicação
npm install --production

# Iniciar ou reiniciar a aplicação com PM2 na porta 3000
pm2 delete taverna-web || true
pm2 start server.js --name "taverna-web"
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

# Configurar Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/tavernaweb
sudo ln -sf /etc/nginx/sites-available/tavernaweb /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Gerar Certificado SSL Gratuito com Let's Encrypt / Certbot
echo "Gerando certificado SSL HTTPS..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN --redirect || {
    echo "Aviso: O Certbot falhou se o DNS ainda não propagou. Você pode rodar 'sudo certbot --nginx -d $DOMAIN' depois que o domínio estiver apontado."
}

echo "========================================="
echo "✅ Pronto! Acesse: https://$DOMAIN"
echo "========================================="
