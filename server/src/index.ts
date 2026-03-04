import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { handleApuracao } from './controllers/apuracao.controller';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.FRONTEND_URL ?? '*',
    methods: ['POST', 'GET', 'OPTIONS'],
}));
app.use(express.json());

// Multer: recebe o PDF em memória (sem gravar em disco)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são aceitos.'));
        }
    },
});

// ── Rotas ────────────────────────────────────────────────────────────────────

/** Health check */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', versao: '2.0.0-modo-conservador-inteligente', timestamp: new Date().toISOString() });
});

/**
 * POST /apuracao
 * Processa um extrato bancário PDF e retorna a apuração de renda.
 *
 * Body (multipart/form-data):
 *   pdf         (file)   — extrato em PDF
 *   nomeCliente (string) — nome completo do cliente
 *   cpf         (string) — CPF (opcional, melhora detecção)
 *   nomePai     (string) — nome do pai (opcional)
 *   nomeMae     (string) — nome da mãe (opcional)
 */
app.post('/apuracao', upload.single('pdf'), handleApuracao);

// ── Tratamento de erros do Multer ─────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
        res.status(400).json({ erro: `Erro de upload: ${err.message}` });
    } else if (err) {
        res.status(400).json({ erro: err.message });
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🟢 Kaizen Apuração Server`);
    console.log(`   Porta: ${PORT}`);
    console.log(`   Versão do algoritmo: 2.0.0-modo-conservador-inteligente`);
    console.log(`   Endpoint: POST http://localhost:${PORT}/apuracao\n`);
});

export default app;
