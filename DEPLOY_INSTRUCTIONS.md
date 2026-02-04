# INSTRUÇÕES PARA ATUALIZAR O SERVIDOR NO EASYPANEL

## ⚠️ PROBLEMA CONFIRMADO
O servidor no Easypanel está a executar código ANTIGO (versão com o bug SQL).

## 📋 SOLUÇÃO PASSO A PASSO

### Opção 1: Upload Manual via Interface do Easypanel

1. **Aceda ao Easypanel** → Seu projeto → Aba "Files" ou "File Manager"

2. **Navegue até a pasta `src`**

3. **Substitua ESTES 2 ficheiros:**
   - `src/server.ts` (do seu PC: `f:\PROJECTOS 2026\Kwikdocs DEV\KWIKDOCS_90\kwikdocs-backend-deploy\src\server.ts`)
   - `src/services/documents.service.ts` (do seu PC: `f:\PROJECTOS 2026\Kwikdocs DEV\KWIKDOCS_90\kwikdocs-backend-deploy\src\services\documents.service.ts`)

4. **REINICIAR o serviço:**
   - Clique no botão "Restart" ou "Redeploy"
   - Aguarde 60 segundos

5. **Testar:**
   - Aceda a: `https://kwikdocsai-one.vercel.app/api/health`
   - Depois tente fazer upload de um documento

---

### Opção 2: Deploy Completo (Recomendado se a Opção 1 falhar)

1. **No Easypanel, aceda à aba "Deploy" ou "Build"**

2. **Faça um novo deploy completo:**
   - Se usar Git: Faça push do código atualizado e force um redeploy
   - Se usar upload manual: Carregue toda a pasta `kwikdocs-backend-deploy`

3. **Aguarde o build completar** (pode demorar 2-5 minutos)

4. **Verifique os logs** para confirmar que não há erros

---

### Opção 3: Via SSH/Terminal do Easypanel

1. **Abra o terminal do container no Easypanel**

2. **Execute:**
   ```bash
   # Verificar se o ficheiro tem o bug
   grep -n "SELECT name, credits, role FROM companies" src/server.ts
   
   # Se aparecer alguma linha, o ficheiro está DESATUALIZADO
   # Nesse caso, você precisa substituir manualmente
   ```

3. **Substitua o ficheiro via terminal:**
   ```bash
   # Faça backup do ficheiro antigo
   cp src/server.ts src/server.ts.backup
   
   # Cole o conteúdo do ficheiro novo
   # (você terá que copiar e colar o conteúdo manualmente)
   ```

4. **Reinicie:**
   ```bash
   pm2 restart all
   # OU
   npm run start
   ```

---

## ✅ COMO CONFIRMAR QUE FUNCIONOU

Após o restart, teste:
1. `https://kwikdocsai-one.vercel.app/api/health` → Deve retornar `{"status":"ok"}`
2. Faça upload de 1 documento → NÃO deve dar erro 500 "column reference name is ambiguous"

---

## 🆘 SE NADA FUNCIONAR

Envie-me um screenshot do Easypanel mostrando:
1. A estrutura de pastas do projeto
2. Os logs do servidor após o restart
