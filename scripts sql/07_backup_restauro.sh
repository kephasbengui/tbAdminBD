# Configurações de Variáveis do DBA
BASEDADOS="farmacia"
UTILIZADOR="postgres"
DIRETORIO_BACKUP="./backups"
DATA=$(date +%Y%m%d_%H%M%S)
NOME_FICHEIRO="$DIRETORIO_BACKUP/backup_${BASEDADOS}_$DATA.sql"

echo "=== INICIANDO ROTINA DE CÓPIA DE SEGURANÇA (DBA) ==="

# Cria a pasta de backups se não existir
mkdir -p "$DIRETORIO_BACKUP"

# Executa o utilitário nativo do PostgreSQL pg_dump
# Nota: Em produção, utilize variáveis de ambiente (PGPASSWORD) para segurança
pg_dump -U "$UTILIZADOR" -d "$BASEDADOS" -F p -f "$NOME_FICHEIRO"

# Validação do Estado do Backup (Exigência da Fase 5 do guião)
if [ $? -eq 0 ]; then
    echo "✓ Cópia de segurança gerada com sucesso em: $NOME_FICHEIRO"
else
    echo "✗ ERRO: Falha crítica ao tentar gerar a cópia de segurança."
    exit 1
fi

echo "====================================================="
echo "Para restaurar esta cópia num ambiente limpo, execute:"
echo "psql -U $UTILIZADOR -d $BASEDADOS -f $NOME_FICHEIRO"
echo "====================================================="

