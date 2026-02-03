#!/bin/bash
# Script de Verificação de Deploy
# Este script verifica se o código no servidor está atualizado

echo "🔍 Verificando versão do servidor..."
echo ""

# Teste 1: Verificar se o endpoint de health responde
echo "1️⃣ Testando endpoint de health..."
curl -s https://kwikdocsai-one.vercel.app/api/health | jq '.'
echo ""

# Teste 2: Verificar se a query SQL foi corrigida
echo "2️⃣ Verificando se a correção SQL está ativa..."
echo "   Se o servidor retornar 500 com 'column reference name is ambiguous', o código NÃO foi atualizado."
echo "   Se retornar 401 (Unauthorized) ou outro erro, o código FOI atualizado."
echo ""

# Teste 3: Instruções para o utilizador
echo "📋 INSTRUÇÕES PARA VERIFICAR NO EASYPANEL:"
echo ""
echo "1. Aceda ao Easypanel e abra o terminal do container"
echo "2. Execute: cat src/server.ts | grep -A 2 'SELECT c.name, c.credits'"
echo "3. Se aparecer 'SELECT c.name, c.credits, u.role', o código está correto"
echo "4. Se aparecer 'SELECT name, credits, role', o código NÃO foi atualizado"
echo ""
echo "5. Após confirmar que o ficheiro está correto, execute:"
echo "   - No Easypanel: Clique em 'Restart' ou 'Redeploy'"
echo "   - Aguarde 30 segundos para o servidor reiniciar"
echo "   - Teste novamente o upload de documentos"
echo ""
