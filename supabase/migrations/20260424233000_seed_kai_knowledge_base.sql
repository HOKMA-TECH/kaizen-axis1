-- Seed inicial da base de conhecimento do KAI

insert into public.kai_knowledge_chunks (source, volume, bloco, item_code, question, answer, tags)
values
('seed_v1', 1, 'Conceitos essenciais', 'V1-001', 'O que e financiamento imobiliario?', 'Financiamento imobiliario e quando uma instituicao, como a Caixa, empresta parte do valor do imovel e o cliente paga em parcelas com juros, seguros e encargos. O imovel fica como garantia ate a quitacao.', array['financiamento','conceitos','caixa']),
('seed_v1', 1, 'Conceitos essenciais', 'V1-004', 'A Caixa financia 100% do imovel?', 'Nao se deve prometer financiamento de 100%. O percentual financiado depende da linha, renda, valor do imovel, avaliacao, FGTS, subsidio e regras vigentes.', array['percentual-financiado','entrada','caixa']),
('seed_v1', 1, 'Conceitos essenciais', 'V1-014', 'O que e registro do contrato?', 'Registro do contrato e o ato no cartorio de Registro de Imoveis que formaliza transferencia e garantia. Sem registro, a operacao nao esta concluida e o repasse geralmente nao acontece.', array['registro','cartorio','contrato']),
('seed_v1', 1, 'Conceitos essenciais', 'V1-018', 'O que acontece se a avaliacao vier menor que o preco de venda?', 'O financiamento pode ser calculado pelo valor de avaliacao aceito pela Caixa, e o cliente pode precisar aumentar a entrada.', array['avaliacao','entrada','imovel']),
('seed_v1', 1, 'Papel do corretor', 'V1-022', 'O corretor pode garantir aprovacao?', 'Nao. O correto e dizer que pode haver possibilidade, mas aprovacao depende da analise oficial da Caixa, documentacao e analise do imovel.', array['corretor','aprovacao','boas-praticas']),
('seed_v1', 1, 'Papel do corretor', 'V1-023', 'O corretor pode garantir subsidio?', 'Nao. Subsidio depende de renda, faixa, cidade, composicao familiar, valor do imovel e regras vigentes. O valor exato so aparece na simulacao/analise oficial.', array['subsidio','corretor','mcmv']),
('seed_v1', 1, 'Simulacao', 'V1-041', 'O que e simulacao habitacional?', 'Simulacao e estimativa de condicoes do financiamento com base em renda, idade, valor do imovel, cidade, entrada, FGTS e linha. Nao e aprovacao.', array['simulacao','aprovacao','credito']),
('seed_v1', 1, 'Simulacao', 'V1-050', 'Posso usar regra fixa de 30% da renda?', 'Como pratica, muitas modalidades usam referencia de ate 30% da renda familiar bruta, mas nao e garantia. A analise oficial pode variar.', array['renda','parcela','30%']),
('seed_v1', 1, 'Linhas', 'V1-062', 'O que e Minha Casa Minha Vida?', 'Programa habitacional federal que pode oferecer juros menores, prazo longo, uso de FGTS e subsidio quando aplicavel, conforme enquadramento.', array['mcmv','programa','habitacional']),
('seed_v1', 1, 'Linhas', 'V1-066', 'O que e SBPE?', 'SBPE e linha de credito com recursos da poupanca, comum para quem nao se enquadra no MCMV ou busca imovel de maior valor.', array['sbpe','linhas','poupanca']),
('seed_v1', 1, 'Linhas', 'V1-068', 'O que e SFH?', 'SFH e o Sistema Financeiro da Habitacao, com regras proprias e possibilidade de uso de FGTS quando cliente e imovel se enquadram.', array['sfh','fgts','sistema']),
('seed_v1', 1, 'Linhas', 'V1-069', 'O que e SFI?', 'SFI e o Sistema Financeiro Imobiliario para operacoes fora dos limites do SFH, comum em imoveis de maior valor.', array['sfi','linhas','alto-valor']),
('seed_v1', 1, 'Credito', 'V1-101', 'O que a Caixa analisa para aprovar credito?', 'A Caixa analisa renda, capacidade de pagamento, historico de credito, restricoes no CPF, idade, documentos, dividas, valor do imovel, entrada e linha escolhida.', array['analise-de-credito','cpf','renda']),
('seed_v1', 1, 'Documentos', 'V1-121', 'Quais documentos pessoais costumam ser pedidos?', 'RG/CNH, CPF, estado civil, comprovante de residencia, comprovantes de renda, IR quando houver e documentos de todos os participantes da composicao de renda.', array['documentos','comprador','estado-civil']),
('seed_v1', 1, 'Documentos', 'V1-141', 'Quais documentos basicos do imovel?', 'Matricula atualizada, IPTU, certidoes quando exigidas, documentacao do vendedor, regularidade de condominio e habite-se quando aplicavel.', array['documentos','imovel','vendedor']),
('seed_v1', 1, 'Custos', 'V1-161', 'Financiamento tem custo alem da entrada?', 'Sim. Alem da entrada, pode haver ITBI, registro, avaliacao, certidoes, tarifas e custos cartorarios, alem de seguros e mudanca.', array['custos','itbi','cartorio']),

('seed_v2', 2, 'MCMV geral', 'V2-001', 'O que e o Minha Casa Minha Vida?', 'Programa habitacional para facilitar acesso a moradia com condicoes favorecidas para quem se enquadra, incluindo possibilidade de subsidio e uso do FGTS.', array['mcmv','subsidio','fgts']),
('seed_v2', 2, 'Faixas', 'V2-022', 'Quais sao as faixas urbanas de referencia em 2026?', 'Referencia (abril/2026): Faixa 1 ate R$ 3.200; Faixa 2 de R$ 3.200,01 ate R$ 5.000; Faixa 3 de R$ 5.000,01 ate R$ 9.600; Classe Media/Faixa 4 ate R$ 13.000.', array['mcmv','faixas','2026']),
('seed_v2', 2, 'Subsidio', 'V2-061', 'O que e subsidio habitacional?', 'Subsidio e um desconto na operacao habitacional que reduz valor a pagar/financiar. Nao e automatico nem igual para todos.', array['subsidio','desconto','mcmv']),
('seed_v2', 2, 'Limites', 'V2-083', 'Qual teto de referencia da Faixa 3 em 2026?', 'Referencia oficial de 2026 apontou teto de ate R$ 400 mil para Faixa 3, conforme regras e localidade.', array['mcmv','teto','faixa-3']),
('seed_v2', 2, 'Limites', 'V2-084', 'Qual teto de referencia da Classe Media/Faixa 4 em 2026?', 'Referencia oficial de 2026 apontou teto de ate R$ 600 mil para Classe Media/Faixa 4, conforme regras da modalidade.', array['mcmv','teto','faixa-4']),
('seed_v2', 2, 'Limites', 'V2-085', 'Faixas 1 e 2 tem o mesmo teto da Faixa 3?', 'Nao. Faixas 1 e 2 tem limites regionais e podem variar por municipio/localizacao, podendo chegar ate R$ 275 mil em alguns cenarios.', array['mcmv','faixas-1-2','limites-regionais']),

('seed_v3', 3, 'FGTS', 'V3-003', 'O FGTS pode ser usado na compra do imovel?', 'Pode, para moradia propria, desde que cliente, imovel e operacao atendam regras vigentes do FGTS/SFH.', array['fgts','compra','moradia-propria']),
('seed_v3', 3, 'FGTS', 'V3-041', 'Quais formas comuns de uso do FGTS?', 'Compra/entrada, amortizacao, quitacao e abatimento temporario de parcelas, quando aplicavel e autorizado.', array['fgts','entrada','amortizacao','quitacao']),
('seed_v3', 3, 'FGTS', 'V3-061', 'Saque-aniversario atrapalha uso do FGTS?', 'Pode atrapalhar se houver saldo bloqueado por antecipacao ou outras restricoes. E necessario validar disponibilidade real.', array['fgts','saque-aniversario','bloqueio']),
('seed_v3', 3, 'SBPE/SFH/SFI', 'V3-081', 'O que e SBPE?', 'SBPE e linha de financiamento com recursos da poupanca, usada em muitos casos fora do MCMV.', array['sbpe','linhas']),
('seed_v3', 3, 'SBPE/SFH/SFI', 'V3-101', 'O que e SFH?', 'SFH e sistema com regras habitacionais proprias e possibilidade de uso de FGTS quando enquadra.', array['sfh','fgts']),
('seed_v3', 3, 'SBPE/SFH/SFI', 'V3-121', 'O que e SFI?', 'SFI atende operacoes fora do SFH, geralmente com menos beneficios ligados ao FGTS e foco em operacoes de maior valor.', array['sfi','linhas']),

('seed_v4', 4, 'Planta', 'V4-001', 'O que e imovel na planta?', 'Imovel vendido antes de ficar pronto. O cliente compra unidade futura e deve entender fluxo de entrada, correcao e prazos de obra.', array['planta','imovel-na-planta']),
('seed_v4', 4, 'Taxa de obra', 'V4-023', 'Taxa de obra e igual a parcela normal?', 'Nao. Na fase de obra ha encargos de construcao/evolucao. A parcela normal de amortizacao geralmente inicia apos conclusao e transicao de fase, conforme contrato.', array['taxa-de-obra','parcela','planta']),
('seed_v4', 4, 'INCC', 'V4-041', 'O que e INCC?', 'INCC e indice de correcao comum em contratos de planta durante construcao. Nao e o mesmo que juros bancarios.', array['incc','correcao','planta']),
('seed_v4', 4, 'Avaliacao', 'V4-061', 'O que e avaliacao de engenharia da Caixa?', 'Analise tecnica do imovel/empreendimento para confirmar valor e aceitacao como garantia do financiamento.', array['avaliacao','engenharia','caixa']),

('seed_v5', 5, 'Pos-assinatura', 'V5-001', 'O financiamento acaba quando assina contrato?', 'Nao. Depois da assinatura ainda ha etapas como ITBI (quando aplicavel), registro em cartorio, conferencia e liberacao do recurso.', array['assinatura','registro','pos-venda']),
('seed_v5', 5, 'Parcela', 'V5-021', 'Do que e composta a parcela?', 'Parcela costuma incluir amortizacao, juros, seguros obrigatorios e encargos previstos no contrato.', array['parcela','amortizacao','juros','seguros']),
('seed_v5', 5, 'Amortizacao', 'V5-041', 'O que e amortizacao extraordinaria?', 'Pagamento extra para reduzir saldo devedor. Pode reduzir prazo ou parcela e tende a diminuir juros futuros.', array['amortizacao','saldo-devedor']),
('seed_v5', 5, 'Quitacao', 'V5-081', 'Cliente pode quitar antes do prazo?', 'Sim. Quitacao antecipada reduz juros futuros, mas e preciso solicitar saldo de quitacao atualizado e depois baixar alienacao no cartorio.', array['quitacao','alienacao','cartorio']),
('seed_v5', 5, 'Inadimplencia', 'V5-101', 'O que acontece se atrasar parcela?', 'Pode haver multa, juros e cobranca. Em atraso prolongado, risco juridico aumenta. O correto e buscar regularizacao rapidamente junto a Caixa.', array['atraso','inadimplencia','regularizacao'])
on conflict (item_code) do update
set
  question = excluded.question,
  answer = excluded.answer,
  tags = excluded.tags,
  volume = excluded.volume,
  bloco = excluded.bloco,
  source = excluded.source,
  updated_at = now();
