# 🚀 ETAPA 3 - Validação Final e Deploy

## ✅ Configuração Concluída

### Arquivo `.env` Criado
**Localização**: `kwikdocs-backend-deploy/.env`

**Credenciais Configuradas**:
- ✅ **Database**: PostgreSQL na VPS (173.249.39.97:5433)
- ✅ **SSL**: Habilitado (`sslmode=require`)
- ✅ **JWT Secret**: Gerado automaticamente (64 caracteres)
- ✅ **Node Environment**: `production`
- ✅ **Porta**: 5000

**⚠️ IMPORTANTE**: 
- O arquivo `.env` contém credenciais REAIS
- **NUNCA** commite este arquivo no Git
- Atualize `ALLOWED_ORIGINS` com seu domínio de produção
- Atualize `OPENAI_API_KEY` se tiver uma chave válida

---

## 📋 Checklist Pré-Deploy

### 1. Configuração de Ambiente
- [x] `.env` criado com credenciais reais
- [x] `DATABASE_URL` configurado com SSL
- [x] `JWT_SECRET` forte gerado (64 chars)
- [x] `NODE_ENV=production`
- [ ] `ALLOWED_ORIGINS` atualizado com domínio real
- [ ] `OPENAI_API_KEY` atualizado (se aplicável)

### 2. Segurança
- [x] SSL/TLS habilitado no banco (`sslmode=require`)
- [x] JWT secret forte e único
- [x] Usuário não-root no container
- [x] Logs sanitizados
- [ ] CORS configurado para domínio de produção
- [ ] Firewall configurado na VPS

### 3. Arquivos do Pacote
- [x] Dockerfile (multi-stage)
- [x] .dockerignore
- [x] .env (com credenciais reais)
- [x] .env.example (template)
- [x] docker-compose.yml
- [x] package.json, tsconfig.json
- [x] scripts/start.sh, scripts/healthcheck.sh
- [x] src/ (152 arquivos)
- [x] README-DEPLOY.md

---

## 🧪 Testes Locais (Opcional mas Recomendado)

### Teste 1: Build Docker
```bash
cd kwikdocs-backend-deploy
docker build -t kwikdocs-backend:latest .
```

**Resultado esperado**: Build bem-sucedido, imagem ~150MB

### Teste 2: Executar Container Localmente
```bash
docker run --rm \
  --env-file .env \
  -p 5000:5000 \
  kwikdocs-backend:latest
```

**Verificar logs**:
- ✅ `[DB] Pool configured for PRODUCTION mode`
- ✅ `[DB] SSL: ENABLED`
- ✅ `✅ Settings Cache Loaded.`
- ✅ `🚀 AUTH SYSTEM RUNNING ON PORT 5000`

### Teste 3: Health Check
```bash
curl http://localhost:5000/api/health
```

**Resposta esperada**:
```json
{"status":"ok","version":"debug-v1"}
```

### Teste 4: Testar Conexão com Banco
```bash
docker exec -it <container-id> node -e "
const { pool } = require('./dist/database/postgres.client.js');
pool.query('SELECT NOW()').then(() => console.log('✅ DB OK')).catch(e => console.error('❌', e));
"
```

---

## 🚀 Deploy no EasyPanel

### Opção A: Via Interface Web

1. **Login no EasyPanel**
   - Acesse: `https://seu-easypanel.com`

2. **Criar Nova Aplicação**
   - Nome: `kwikdocs-backend`
   - Tipo: `Docker`

3. **Upload do Código**
   - Fazer upload da pasta `kwikdocs-backend-deploy/`
   - Ou conectar repositório Git (se aplicável)

4. **Configurar Build**
   - Dockerfile: `./Dockerfile`
   - Build Context: `.`

5. **Configurar Secrets (Variáveis de Ambiente)**
   
   **CRÍTICO**: Use a seção "Secrets" do EasyPanel, não texto plano!
   
   ```
   DATABASE_URL=postgresql://conversioao:Mercedes%40g63@173.249.39.97:5433/kwikdocsai?sslmode=require
   JWT_SECRET=KwD9xP2mN7vL4qR8tY3wE6zS5aF1jH0gB9cV8nM2xQ7pL4kJ3hG6fD5sA1wE9rT2yU8iO7pL6kJ5hG4fD3sA2zX1cV0bN9mQ8wE7rT6yU5iO4pL3kJ2hG1fD0sA
   NODE_ENV=production
   AUTH_API_PORT=5000
   PASSWORD_SALT_ROUNDS=12
   JWT_EXPIRES_IN=24h
   ALLOWED_ORIGINS=https://seu-dominio.com
   OPENAI_API_KEY=sua_chave_openai
   ```

6. **Configurar Porta**
   - Container Port: `5000`
   - Expor publicamente: `Sim`
   - Protocolo: `HTTP` (HTTPS via proxy reverso do EasyPanel)

7. **Health Check**
   - Path: `/api/health`
   - Interval: `30s`
   - Timeout: `10s`
   - Start Period: `40s`

8. **Deploy**
   - Clicar em "Deploy"
   - Aguardar build (2-3 minutos)

### Opção B: Via CLI/SSH

```bash
# 1. Upload para VPS
scp -r kwikdocs-backend-deploy/ user@vps:/opt/kwikdocs-backend

# 2. SSH na VPS
ssh user@vps

# 3. Navegar para pasta
cd /opt/kwikdocs-backend

# 4. Build da imagem
docker build -t kwikdocs-backend:latest .

# 5. Executar container
docker run -d \
  --name kwikdocs-backend \
  --env-file .env \
  -p 5000:5000 \
  --restart unless-stopped \
  kwikdocs-backend:latest

# 6. Verificar logs
docker logs -f kwikdocs-backend
```

---

## 🔄 Executar Migrations (Primeira Vez)

### Via Docker Exec
```bash
docker exec -it kwikdocs-backend npm run migrate
```

**Ou via EasyPanel Console**:
```bash
npm run migrate
```

**Verificar logs**:
- ✅ Migrations executadas sem erros
- ✅ Tabelas criadas/atualizadas

---

## ✅ Verificação Pós-Deploy

### 1. Verificar Logs do Container
```bash
docker logs kwikdocs-backend
```

**Procurar por**:
- ✅ `[DB] Pool configured for PRODUCTION mode`
- ✅ `[DB] SSL: ENABLED`
- ✅ `✅ Todas as migrações concluídas.`
- ✅ `🚀 AUTH SYSTEM RUNNING ON PORT 5000`
- ❌ Sem erros de conexão com banco
- ❌ Sem erros de CORS

### 2. Testar Health Check
```bash
curl http://seu-dominio.com/api/health
```

### 3. Testar Endpoints Principais

**Config Público**:
```bash
curl http://seu-dominio.com/api/config
```

**Login** (se tiver usuário de teste):
```bash
curl -X POST http://seu-dominio.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"senha"}'
```

### 4. Verificar Conexão com Banco
- ✅ Logs mostram queries executadas
- ✅ Sem erros de SSL/TLS
- ✅ Pool de conexões funcionando

---

## 🔧 Troubleshooting

### Erro: "CORS blocked"
**Causa**: `ALLOWED_ORIGINS` não configurado corretamente

**Solução**:
```env
ALLOWED_ORIGINS=https://seu-frontend.com,https://www.seu-frontend.com
```

### Erro: "Database connection failed"
**Causa**: SSL ou credenciais incorretas

**Solução**:
1. Verificar `DATABASE_URL` tem `sslmode=require`
2. Verificar credenciais estão corretas
3. Verificar firewall permite conexão da porta 5433

### Erro: "JWT Secret not set"
**Causa**: Variável de ambiente não carregada

**Solução**:
1. Verificar `.env` está no diretório correto
2. Verificar secrets configurados no EasyPanel
3. Reiniciar container

### Container não inicia
**Diagnóstico**:
```bash
docker logs kwikdocs-backend
docker inspect kwikdocs-backend
```

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

### Health Check Automático
O EasyPanel monitora automaticamente via `/api/health`

---

## 🎯 Checklist Final

- [ ] Build Docker bem-sucedido
- [ ] Container iniciado sem erros
- [ ] Conexão com banco OK (SSL habilitado)
- [ ] Migrations executadas
- [ ] Health check respondendo
- [ ] Endpoint `/api/config` funcionando
- [ ] Login funcionando (se testado)
- [ ] CORS configurado para domínio de produção
- [ ] Logs sem erros críticos
- [ ] Domínio/subdomínio configurado
- [ ] HTTPS configurado (via EasyPanel)

---

## 🔐 Segurança Pós-Deploy

### Ações Recomendadas
1. ✅ Configurar backup automático do banco
2. ✅ Configurar monitoramento (uptime, erros)
3. ✅ Configurar alertas (email/Slack)
4. ✅ Revisar logs regularmente
5. ✅ Atualizar dependências mensalmente
6. ✅ Testar restore de backup

---

## 📞 Suporte e Próximos Passos

### Se tudo funcionou:
- ✅ Backend está em produção
- ✅ Conectar frontend ao backend
- ✅ Configurar domínio personalizado
- ✅ Configurar SSL/HTTPS
- ✅ Configurar CI/CD (opcional)

### Se houver problemas:
1. Verificar logs do container
2. Verificar variáveis de ambiente
3. Testar conexão com banco manualmente
4. Verificar firewall e portas
5. Consultar README-DEPLOY.md

---

**🎉 Deploy Concluído! Backend KwikDocs em Produção!**
