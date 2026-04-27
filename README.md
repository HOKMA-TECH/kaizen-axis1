# PRD Completo - KAIZEN AXIS

## Visao geral

KAIZEN AXIS e um sistema web/PWA para operacao comercial imobiliaria, com foco em:

- produtividade do corretor
- acompanhamento de lideranca
- comunicacao interna
- check-in presencial com validacao de localizacao
- ferramentas comerciais e de suporte

Base de acesso em producao: `https://kaizen-axis.space`

## Perfis

- `ADMIN`
- `DIRETOR`
- `GERENTE`
- `COORDENADOR`
- `CORRETOR`

Regras globais:

- usuario sem sessao vai para `https://kaizen-axis.space/login`
- usuario com status pendente vai para `https://kaizen-axis.space/pending`
- usuario inativo volta para login

## Mapa de abas e funcionamento

### Publico

1. Login
- Link: `https://kaizen-axis.space/login`
- Funcao: autenticar usuario e iniciar sessao.

2. Reset password
- Link: `https://kaizen-axis.space/reset-password`
- Funcao: redefinir senha.

3. Pending approval
- Link: `https://kaizen-axis.space/pending`
- Funcao: informar que conta aguarda aprovacao.

### Principal

1. Dashboard
- Link: `https://kaizen-axis.space/`
- Funcao: painel inicial com visao de desempenho e atalhos.

2. Clientes
- Link: `https://kaizen-axis.space/clients`
- Funcao: listar e gerenciar carteira/funil.

3. Novo cliente
- Link: `https://kaizen-axis.space/clients/new`
- Funcao: cadastrar lead/cliente.

4. Detalhes do cliente
- Link: `https://kaizen-axis.space/clients/:id`
- Funcao: visualizar historico, dados, etapa e acoes.

5. Envio de email do cliente
- Link: `https://kaizen-axis.space/clients/:id/email`
- Funcao: disparo de comunicacao no contexto do cliente.

6. Agenda
- Link: `https://kaizen-axis.space/schedule`
- Funcao: organizar compromissos e follow-ups.

7. Chat
- Link: `https://kaizen-axis.space/chat`
- Funcao: mensageria interna da equipe.

8. Conversa do chat
- Link: `https://kaizen-axis.space/chat/:id`
- Funcao: thread detalhada por conversa.

9. Menu mobile
- Link: `https://kaizen-axis.space/more`
- Funcao: hub mobile para modulos secundarios.

### Ferramentas

1. Empreendimentos
- Link: `https://kaizen-axis.space/developments`
- Funcao: catalogo e consulta de produtos imobiliarios.

2. Detalhe de empreendimento
- Link: `https://kaizen-axis.space/developments/:id`
- Funcao: ficha completa do empreendimento.

3. Portais
- Link: `https://kaizen-axis.space/portals`
- Funcao: acesso a canais/parceiros.

4. Check-in
- Link: `https://kaizen-axis.space/checkin`
- Funcao: registrar presenca via QR + geolocalizacao.
- Janela atual: `08:00-13:30` (BRT).

5. Tela Check-in (recepcao)
- Link: `https://kaizen-axis.space/checkin/display`
- Perfis: `ADMIN`, `DIRETOR`, `GERENTE`.
- Funcao: exibir QR diario para leitura.

6. Tarefas
- Link: `https://kaizen-axis.space/tasks`
- Funcao: gerenciar pendencias.

7. Treinamentos
- Link: `https://kaizen-axis.space/training`
- Funcao: trilhas e evolucao de aprendizagem.

8. Conversor PDF
- Link: `https://kaizen-axis.space/pdf-tools`
- Funcao: utilitarios de documento.

### Analise

1. Relatorios
- Link: `https://kaizen-axis.space/reports`
- Funcao: indicadores e analise comercial.

2. Potenciais clientes
- Link: `https://kaizen-axis.space/reports/potential-clients`
- Funcao: visao focada em oportunidades.

3. Apuracao de renda
- Link: `https://kaizen-axis.space/income`
- Perfis: `ADMIN`, `DIRETOR`, `GERENTE`, `COORDENADOR`.
- Funcao: analise financeira para viabilidade.

4. Amortizacao
- Link: `https://kaizen-axis.space/amortization`
- Funcao: simulacao para suporte de negociacao.

### Administrativo

1. Painel admin
- Link: `https://kaizen-axis.space/admin`
- Perfis: `ADMIN`, `DIRETOR`.
- Funcao: governanca e administracao da plataforma.

2. Seguranca
- Link: `https://kaizen-axis.space/admin/security`
- Perfis: `ADMIN`, `DIRETOR`.
- Funcao: monitoramento e controles de seguranca.

3. Relatorio de presenca
- Link: `https://kaizen-axis.space/admin/reports/presence`
- Perfis: `ADMIN`, `DIRETOR`.
- Funcao: acompanhamento de check-ins e presenca.

### Conta

1. Configuracoes
- Link: `https://kaizen-axis.space/settings`
- Funcao: preferencia de conta, perfil e sessao.

### Rotas de apoio

1. Leads automatizados
- Link: `https://kaizen-axis.space/automation-leads`
- Funcao: fluxo de automacao de leads.

2. Simulador (placeholder)
- Link: `https://kaizen-axis.space/simulator`
- Funcao: modulo futuro.

## Fluxo principal de uso

1. Login no sistema.
2. Gestao de operacao em Dashboard/Clientes/Agenda/Chat.
3. Registro de presenca em Check-in durante janela valida.
4. Lideranca acompanha por Relatorios/Apuracao/Admin.

## Requisitos nao funcionais

- responsivo desktop/mobile
- funcionamento em PWA
- controle de acesso por perfil
- escopo de dados protegido por RLS
- banner de status offline
