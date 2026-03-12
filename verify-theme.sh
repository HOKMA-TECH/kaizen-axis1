#!/bin/bash

# Script de Verificação da Migração de Tema
# Verifica se todas as cores foram corretamente migradas

echo "🎨 Verificando Migração de Tema: Dourado → Azul"
echo "================================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de issues
ISSUES=0

# 1. Verificar se design tokens existem
echo "📋 1. Verificando Design Tokens..."
if grep -q "color-primary-600: #1F6FE5" src/index.css; then
    echo -e "${GREEN}✓${NC} Design tokens encontrados"
else
    echo -e "${RED}✗${NC} Design tokens não encontrados em src/index.css"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 2. Verificar variáveis CSS globais
echo "🎨 2. Verificando Variáveis CSS..."
if grep -q "color-primary: #1F6FE5" src/index.css; then
    echo -e "${GREEN}✓${NC} Variáveis CSS configuradas"
else
    echo -e "${RED}✗${NC} Variáveis CSS não encontradas"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 3. Verificar PWA theme-color
echo "📱 3. Verificando PWA (index.html)..."
if grep -q 'theme-color" content="#1F6FE5"' index.html; then
    echo -e "${GREEN}✓${NC} PWA theme-color atualizado para azul"
else
    echo -e "${RED}✗${NC} PWA theme-color não atualizado"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 4. Verificar manifest.json
echo "📱 4. Verificando Manifest.json..."
if grep -q '"theme_color": "#1F6FE5"' public/manifest.json; then
    echo -e "${GREEN}✓${NC} Manifest theme_color atualizado"
else
    echo -e "${RED}✗${NC} Manifest theme_color não atualizado"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 5. Buscar cores douradas hardcoded
echo "🔍 5. Buscando cores douradas hardcoded..."
GOLD_COLORS=$(grep -r "#D9AD34\|#C8A75D\|#B79029\|#FFD700" src/ 2>/dev/null | grep -v "node_modules" | wc -l)
if [ "$GOLD_COLORS" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Nenhuma cor dourada hardcoded encontrada"
else
    echo -e "${YELLOW}⚠${NC} Encontradas $GOLD_COLORS ocorrências de cores douradas hardcoded"
    echo "   Execute: grep -rn '#D9AD34\|#C8A75D\|#B79029\|#FFD700' src/ para detalhes"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 6. Verificar compatibilidade retroativa
echo "🔄 6. Verificando Compatibilidade Retroativa..."
if grep -q "color-gold-400: var(--color-primary-600)" src/index.css; then
    echo -e "${GREEN}✓${NC} Mapeamento gold → primary configurado"
else
    echo -e "${RED}✗${NC} Compatibilidade retroativa não configurada"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 7. Verificar dark mode
echo "🌙 7. Verificando Dark Mode..."
if grep -q ":root.dark" src/index.css && grep -q "color-primary: #3B82F6" src/index.css; then
    echo -e "${GREEN}✓${NC} Dark mode configurado"
else
    echo -e "${RED}✗${NC} Dark mode não configurado corretamente"
    ISSUES=$((ISSUES+1))
fi
echo ""

# 8. Verificar documentação
echo "📚 8. Verificando Documentação..."
DOCS=0
if [ -f "THEME_MIGRATION.md" ]; then
    echo -e "${GREEN}✓${NC} THEME_MIGRATION.md encontrado"
    DOCS=$((DOCS+1))
fi
if [ -f "DESIGN_TOKENS.md" ]; then
    echo -e "${GREEN}✓${NC} DESIGN_TOKENS.md encontrado"
    DOCS=$((DOCS+1))
fi
if [ $DOCS -eq 2 ]; then
    echo -e "${GREEN}✓${NC} Documentação completa"
else
    echo -e "${YELLOW}⚠${NC} Documentação incompleta ($DOCS/2 arquivos)"
fi
echo ""

# Resultado final
echo "================================================"
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. npm run dev - Testar visualmente"
    echo "2. Verificar sidebar, botões, badges estão azuis"
    echo "3. Testar dark mode"
    echo "4. Testar responsividade (mobile/tablet/desktop)"
    echo "5. Fazer commit: git add . && git commit -m 'feat: migra tema de dourado para azul'"
else
    echo -e "${RED}❌ ENCONTRADOS $ISSUES PROBLEMAS${NC}"
    echo ""
    echo "Revise os erros acima e corrija antes de prosseguir."
fi
echo ""
