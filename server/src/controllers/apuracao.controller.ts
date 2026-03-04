import { Request, Response } from 'express';
import { processarExtrato } from '../services/apuracao.service';
import type { ContextoNomes } from '../types/transacao';

/**
 * ApuracaoController — Gerencia o endpoint POST /apuracao.
 *
 * Recebe multipart/form-data com:
 *   pdf      (file)   — extrato bancário em PDF
 *   nomeCliente (string) — nome completo do cliente
 *   cpf      (string) — CPF do cliente (opcional, melhora match)
 *   nomePai  (string) — nome do pai (opcional)
 *   nomeMae  (string) — nome da mãe (opcional)
 */
export async function handleApuracao(req: Request, res: Response): Promise<void> {
    try {
        // 1. Validar presença do arquivo
        if (!req.file) {
            res.status(400).json({
                erro: 'Arquivo PDF não enviado. Use multipart/form-data com campo "pdf".',
            });
            return;
        }

        // 2. Validar campos de nome
        const nomeCliente = (req.body.nomeCliente ?? '').trim();
        if (!nomeCliente) {
            res.status(400).json({ erro: 'Campo "nomeCliente" é obrigatório.' });
            return;
        }

        // 3. Montar contexto de nomes
        const contexto: ContextoNomes = {
            nomeCliente,
            cpf: (req.body.cpf ?? '').trim() || undefined,
            nomePai: (req.body.nomePai ?? '').trim() || undefined,
            nomeMae: (req.body.nomeMae ?? '').trim() || undefined,
        };

        // 4. Processar extrato
        const resultado = await processarExtrato(req.file.buffer, contexto);

        // 5. Retornar JSON auditável
        res.status(200).json(resultado);
    } catch (err: unknown) {
        const mensagem = err instanceof Error ? err.message : 'Erro interno desconhecido.';

        // Distinguir erros de validação (400) de erros internos (500)
        const status = mensagem.includes('inválid') ||
            mensagem.includes('obrigatório') ||
            mensagem.includes('Nenhuma transação') ||
            mensagem.includes('PDF')
            ? 422
            : 500;

        res.status(status).json({ erro: mensagem });
    }
}
