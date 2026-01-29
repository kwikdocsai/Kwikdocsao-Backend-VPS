# 🚀 KwikDocs Backend - Guia de Deploy para EasyPanel

## 📋 Pré-requisitos

- ✅ EasyPanel instalado e configurado na VPS
- ✅ PostgreSQL acessível (já configurado em: `173.249.39.97:5433`)
- ✅ Docker instalado (gerenciado pelo EasyPanel)
- ✅ Domínio/subdomínio configurado (opcional)

---

## 🔐 PASSO 1: Configurar Variáveis de Ambiente

### 1.1 Copiar Template
```bash
cp .env.example .env
```

### 1.2 Editar `.env` com Valores Reais

**IMPORTANTE**: Nunca commite o arquivo `.env` com valores reais!

```env
# Database (usar DATABASE_URL como fonte única)
DATABASE_URL=postgresql://conversioao:Mercedes%40g63@173.249.39.97:5433/kwikdocsai?sslmode=require

# Application
NODE_ENV=production
AUTH_API_PORT=5000

# JWT (gerar nova chave com: openssl rand -base64 64)
JWT_SECRET=<GERAR_NOVA_CHAVE_FORTE>
JWT_EXPIRES_IN=24h

# Security
PASSWORD_SALT_ROUNDS=12

# CORS (substituir por domínio real)
ALLOWED_ORIGINS=https://seu-frontend.com,https://www.seu-frontend.com

# OpenAI (opcional)
OPENAI_API_KEY=<sua_chave_openai>
```

### 1.3 Gerar JWT Secret Forte
```bash
openssl rand -base64 64
```

---

## 🐳 PASSO 2: Build da Imagem Docker

### 2.1 Build Local (Teste)
```bash
docker build -t kwikdocs-backend:latest .
```

### 2.2 Testar Localmente (Opcional)
```bash
docker run --rm \
  --env-file .env \
  -p 5000:5000 \
  kwikdocs-backend:latest
```

Verificar: `http://localhost:5000/api/health`

---

## 📦 PASSO 3: Deploy no EasyPanel

### Opção A: Via Interface do EasyPanel

1. **Criar Nova Aplicação**
   - Nome: `kwikdocs-backend`
   - Tipo: `Docker`

2. **Upload do Código**
   - Fazer upload da pasta completa
   - Ou conectar repositório Git

3. **Configurar Build**
   - Dockerfile: `./Dockerfile`
   - Context: `.`

4. **Configurar Variáveis de Ambiente (Secrets)**
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=...
   NODE_ENV=production
   AUTH_API_PORT=5000
   ALLOWED_ORIGINS=https://...
   OPENAI_API_KEY=...
   ```

5. **Configurar Porta**
   - Container Port: `5000`
   - Expor publicamente: `Sim`

6. **Health Check**
   - Path: `/api/health`
   - Interval: `30s`
   - Timeout: `10s`

7. **Deploy**
   - Clicar em "Deploy"
   - Aguardar build e inicialização

### Opção B: Via CLI (Avançado)

```bash
# 1. Fazer upload da pasta para VPS
scp -r kwikdocs-backend-deploy/ user@vps:/path/to/deploy

# 2. SSH na VPS
ssh user@vps

# 3. Navegar para pasta
cd /path/to/deploy/kwikdocs-backend-deploy

# 4. Build da imagem
docker build -t kwikdocs-backend:latest .

# 5. Executar container
docker run -d \
  --name kwikdocs-backend \
  --env-file .env \
  -p 5000:5000 \
  --restart unless-stopped \
  kwikdocs-backend:latest
```

---

## 🔄 PASSO 4: Executar Migrations (Primeira Vez)

### Via EasyPanel Console
```bash
npm run migrate
```

### Via Docker Exec
```bash
docker exec -it kwikdocs-backend npm run migrate
```

---

## ✅ PASSO 5: Verificação

### 5.1 Verificar Logs
```bash
docker logs -f kwikdocs-backend
```

Procurar por:
```
✅ Settings Cache Loaded.
✅ Todas as migrações concluídas.
🚀 AUTH SYSTEM RUNNING ON PORT 5000
```

### 5.2 Testar Health Check
```bash
curl http://seu-dominio.com/api/health
```

Resposta esperada:
```json
{"status":"ok","version":"debug-v1"}
```

### 5.3 Testar Endpoints Principais

**Login**:
```bash
curl -X POST http://seu-dominio.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"senha"}'
```

**Config**:
```bash
curl http://seu-dominio.com/api/config
```

---

## 🔧 Troubleshooting

### Erro: "CORS blocked"
**Solução**: Verificar `ALLOWED_ORIGINS` no `.env`
```env
ALLOWED_ORIGINS=https://seu-frontend.com
```

### Erro: "Database connection failed"
**Solução**: Verificar `DATABASE_URL` e SSL
```env
DATABASE_URL=postgresql://user:pass@host:5433/db?sslmode=require
```

### Erro: "JWT Secret not set"
**Solução**: Gerar e configurar `JWT_SECRET`
```bash
openssl rand -base64 64
```

### Container não inicia
**Verificar logs**:
```bash
docker logs kwikdocs-backend
```

**Verificar variáveis de ambiente**:
```bash
docker exec kwikdocs-backend env
```

---

## 🔐 Segurança em Produção

### ✅ Checklist de Segurança

- [ ] `NODE_ENV=production` configurado
- [ ] SSL/TLS habilitado no PostgreSQL (`sslmode=require`)
- [ ] JWT_SECRET forte e único (64+ caracteres)
- [ ] CORS restrito apenas para domínios autorizados
- [ ] `.env` NUNCA commitado no Git
- [ ] Secrets configurados via EasyPanel (não em texto plano)
- [ ] Firewall configurado (apenas portas necessárias)
- [ ] Backups regulares do banco de dados
- [ ] Logs monitorados para atividades suspeitas

---

## 📊 Monitoramento

### Logs em Tempo Real
```bash
docker logs -f kwikdocs-backend
```

### Métricas do Container
```bash
docker stats kwikdocs-backend
```

### Health Check Manual
```bash
curl http://localhost:5000/api/health
```

---

## 🔄 Atualização do Backend

### 1. Build Nova Versão
```bash
docker build -t kwikdocs-backend:v2 .
```

### 2. Parar Container Antigo
```bash
docker stop kwikdocs-backend
```

### 3. Executar Nova Versão
```bash
docker run -d \
  --name kwikdocs-backend-v2 \
  --env-file .env \
  -p 5000:5000 \
  --restart unless-stopped \
  kwikdocs-backend:v2
```

### 4. Executar Migrations (se necessário)
```bash
docker exec -it kwikdocs-backend-v2 npm run migrate
```

### 5. Remover Container Antigo
```bash
docker rm kwikdocs-backend
```

---

## 📞 Suporte

### Logs Importantes
- **Startup**: Verificar inicialização e migrations
- **Database**: Conexão e queries
- **Auth**: Login e JWT
- **CORS**: Requisições bloqueadas

### Comandos Úteis
```bash
# Ver logs
docker logs kwikdocs-backend

# Entrar no container
docker exec -it kwikdocs-backend sh

# Verificar processos
docker exec kwikdocs-backend ps aux

# Testar conexão com banco
docker exec kwikdocs-backend node -e "require('./dist/database/postgres.client.js')"
```

---

## ✅ Checklist Final

- [ ] Variáveis de ambiente configuradas
- [ ] Build Docker bem-sucedido
- [ ] Container iniciado sem erros
- [ ] Migrations executadas
- [ ] Health check respondendo
- [ ] Endpoints principais funcionando
- [ ] CORS configurado corretamente
- [ ] SSL habilitado no banco
- [ ] Logs sem erros críticos
- [ ] Domínio configurado (se aplicável)

---

## 🎯 Próximos Passos

1. ✅ Configurar domínio personalizado
2. ✅ Configurar HTTPS/SSL (via EasyPanel ou Nginx)
3. ✅ Configurar backups automáticos
4. ✅ Configurar monitoramento (Prometheus/Grafana)
5. ✅ Configurar alertas (email/Slack)
6. ✅ Documentar API (Swagger/OpenAPI)

---

**🎉 Deploy Concluído com Sucesso!**
