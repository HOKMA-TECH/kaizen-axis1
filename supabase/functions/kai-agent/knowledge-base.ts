export type KnowledgeChunk = {
  id: string;
  tags: string[];
  content: string;
};

export const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: 'fundamentos-financiamento',
    tags: ['financiamento', 'conceitos', 'entrada', 'saldo', 'parcela', 'amortizacao'],
    content:
      'Financiamento imobiliario: banco empresta parte do valor e o cliente paga em parcelas com juros, seguros e encargos. Entrada e a parte nao financiada. Saldo devedor e o que falta pagar. Parcela inclui amortizacao, juros, MIP e DFI. Nao prometer financiamento de 100%.',
  },
  {
    id: 'processo-padrao',
    tags: ['processo', 'etapas', 'aprovacao', 'contrato', 'registro', 'repasse'],
    content:
      'Ordem recomendada: simulacao -> enquadramento -> analise de credito -> documentos do comprador -> avaliacao e documentacao do imovel -> aprovacao final -> assinatura -> registro em cartorio -> liberacao/repasse.',
  },
  {
    id: 'credito-analise',
    tags: ['credito', 'cpf', 'score', 'dividas', 'aprovacao', 'renda'],
    content:
      'Nome limpo ajuda, mas nao garante aprovacao. Caixa analisa renda comprovada, comprometimento, historico, idade, documentos e imovel. Nao garantir aprovacao. Restricao no CPF pode impedir ou dificultar bastante.',
  },
  {
    id: 'mcmv-faixas-2026',
    tags: ['mcmv', 'faixas', 'renda', '2026'],
    content:
      'Referencia MCMV urbano (abril/2026): Faixa 1 ate R$ 3.200; Faixa 2 de R$ 3.200,01 a R$ 5.000; Faixa 3 de R$ 5.000,01 a R$ 9.600; Classe Media/Faixa 4 ate R$ 13.000.',
  },
  {
    id: 'mcmv-tetos-2026',
    tags: ['mcmv', 'teto', 'valor-imovel', '2026'],
    content:
      'Tetos de referencia MCMV em 2026: Faixa 3 ate R$ 400 mil; Classe Media/Faixa 4 ate R$ 600 mil; Faixas 1 e 2 com limites regionais, podendo chegar ate R$ 275 mil conforme municipio/localizacao.',
  },
  {
    id: 'subsidiio-regra',
    tags: ['subsidio', 'desconto', 'mcmv', 'entrada'],
    content:
      'Subsidio e desconto habitacional com recursos publicos/FGTS para reduzir parte do valor da compra/financiamento. Nao e automatico. Nao prometer valor maximo. Valor depende de renda, localizacao, composicao familiar e regras vigentes.',
  },
  {
    id: 'sbpe-sfh-sfi',
    tags: ['sbpe', 'sfh', 'sfi', 'diferenca'],
    content:
      'MCMV: programa com possivel subsidio. SBPE: credito com recursos da poupanca. SFH: sistema habitacional com regras proprias e uso de FGTS quando enquadra. SFI: operacoes fora dos limites/criterios do SFH, comum em imoveis de maior valor.',
  },
  {
    id: 'fgts-usos',
    tags: ['fgts', 'entrada', 'amortizacao', 'quitacao', 'parcelas'],
    content:
      'FGTS pode ser usado quando enquadrado para entrada/aquisicao, amortizacao, quitacao ou abatimento temporario de parcelas. Nao e igual a subsidio. Liberacao depende de regras do FGTS/SFH, titularidade, localizacao e analise oficial.',
  },
  {
    id: 'fgts-cuidados',
    tags: ['fgts', 'regras', 'restricoes', 'saque-aniversario'],
    content:
      'Nao tratar saldo do FGTS como dinheiro garantido. Pode haver bloqueios (ex.: saque-aniversario com antecipacao), restricoes de titularidade e localizacao, e intervalo entre usos conforme modalidade.',
  },
  {
    id: 'percentual-renda-parcela',
    tags: ['parcela', 'renda', 'comprometimento', '30%'],
    content:
      'Na pratica, em muitas modalidades da Caixa, usa-se como referencia comprometimento de ate 30% da renda familiar bruta. E referencia, nao garantia. A analise oficial pode variar por perfil e produto.',
  },
  {
    id: 'financiamento-maximo',
    tags: ['financiamento-maximo', 'valor-maximo', 'aprovacao'],
    content:
      'Financiamento maximo depende de renda, idade, prazo, modalidade, score, relacionamento, valor de avaliacao do imovel e entrada. Nao existe valor fixo universal.',
  },
  {
    id: 'documentos-comprador',
    tags: ['documentos', 'comprador', 'estado-civil', 'renda'],
    content:
      'Documentos comuns do comprador: RG/CNH, CPF, estado civil, comprovante de residencia, comprovantes de renda, IR quando houver e documentos de quem compoe renda. Divergencia de dados ou documento ilegivel atrasa analise.',
  },
  {
    id: 'documentos-imovel-vendedor',
    tags: ['documentos', 'imovel', 'vendedor', 'matricula', 'iptu', 'condominio'],
    content:
      'Documentos-chave do imovel: matricula atualizada, IPTU, regularidade de condominio, certidoes quando exigidas, habite-se quando aplicavel e documentos do vendedor. Imovel irregular pode ser recusado mesmo com credito aprovado.',
  },
  {
    id: 'avaliacao-engenharia',
    tags: ['avaliacao', 'engenharia', 'valor-avaliacao'],
    content:
      'Avaliacao da Caixa verifica valor e aceitacao do imovel como garantia. Se valor de avaliacao vier menor que o preco negociado, cliente pode precisar aumentar entrada.',
  },
  {
    id: 'custos-alem-entrada',
    tags: ['itbi', 'cartorio', 'registro', 'custos', 'seguros'],
    content:
      'Alem da entrada, cliente normalmente precisa considerar ITBI, cartorio/registro, avaliacao, certidoes e custos de mudanca. MIP e DFI geralmente entram na parcela.',
  },
  {
    id: 'assinatura-x-registro',
    tags: ['assinatura', 'registro', 'cartorio', 'liberacao'],
    content:
      'Assinatura nao encerra o processo. O contrato precisa ser registrado na matricula para formalizar transferencia e alienacao fiduciaria. Em regra, liberacao do recurso ocorre apos registro e conferencia.',
  },
  {
    id: 'imovel-na-planta',
    tags: ['planta', 'incc', 'taxa-de-obra', 'evolucao-de-obra'],
    content:
      'Na planta, cliente pode ter entrada com construtora, correcao por INCC e encargos de evolucao de obra durante construcao. Taxa de obra nao e a mesma coisa que parcela final de amortizacao.',
  },
  {
    id: 'amortizacao-quitacao-pos',
    tags: ['amortizacao', 'quitacao', 'pos-venda'],
    content:
      'Amortizacao extraordinaria reduz saldo devedor e juros futuros. Cliente pode optar por reduzir prazo (geralmente economiza mais juros) ou parcela (melhora fluxo mensal).',
  },
  {
    id: 'inadimplencia-risco',
    tags: ['atraso', 'inadimplencia', 'renegociacao', 'leilao'],
    content:
      'Atraso de parcelas gera encargos e risco juridico crescente. Orientacao pratica: procurar Caixa rapidamente para regularizacao e evitar evolucao para medidas mais graves.',
  },
  {
    id: 'postura-corretor',
    tags: ['postura', 'transparencia', 'sem-promessa'],
    content:
      'Postura correta: consultiva e transparente. Nao prometer aprovacao, subsidio, taxa fixa, entrada zero ou valor maximo financiavel sem analise oficial.',
  },
];
