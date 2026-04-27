import { useNavigate } from 'react-router-dom';
import { PremiumCard, SectionHeader, RoundedButton } from '@/components/ui/PremiumComponents';
import { ChevronLeft, User, Phone, Mail, MessageCircle, ArrowRight } from 'lucide-react';

const MOCK_POTENTIAL_CLIENTS = [
  {
    id: '1',
    name: 'Ricardo Oliveira',
    email: 'ricardo.oliveira@email.com',
    phone: '(81) 99999-1111',
    matchScore: 95,
    budget: 'R$ 900k',
    interest: 'Alto Padrão / Beira-mar',
    lastInteraction: '3 dias atrás'
  },
  {
    id: '2',
    name: 'Juliana Santos',
    email: 'juliana.santos@email.com',
    phone: '(81) 98888-2222',
    matchScore: 88,
    budget: 'R$ 850k',
    interest: 'Investimento / Lançamento',
    lastInteraction: '1 semana atrás'
  },
  {
    id: '3',
    name: 'Marcos Costa',
    email: 'marcos.costa@email.com',
    phone: '(81) 97777-3333',
    matchScore: 82,
    budget: 'R$ 1.2M',
    interest: '3 Quartos / Lazer Completo',
    lastInteraction: '2 dias atrás'
  }
];

export default function PotentialClients() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-50 pb-24 p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-white dark:bg-surface-100 border border-surface-200 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Clientes em Potencial</h1>
          <p className="text-text-secondary text-sm">Oportunidade: Reserva Imperial</p>
        </div>
      </div>

      <div className="space-y-4">
        {MOCK_POTENTIAL_CLIENTS.map((client) => (
          <PremiumCard key={client.id} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-gold-500">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-text-primary">{client.name}</h3>
                  <p className="text-xs text-text-secondary">Orçamento: {client.budget}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-1 rounded-md bg-green-100 text-green-700 text-xs font-bold">
                  {client.matchScore}% Match
                </span>
              </div>
            </div>

            <div className="bg-surface-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-text-secondary mb-1">Interesse Principal</p>
              <p className="text-sm font-medium text-text-primary">{client.interest}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <RoundedButton
                variant="outline"
                className="flex items-center justify-center gap-2 text-xs h-10"
                href={`tel:+55${client.phone.replace(/\D/g, '')}`}
              >
                <Phone size={14} /> Ligar
              </RoundedButton>
              <RoundedButton
                className="flex items-center justify-center gap-2 text-xs h-10"
                onClick={() => window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}`, '_blank')}
              >
                <MessageCircle size={14} /> WhatsApp
              </RoundedButton>
            </div>

            <button
              onClick={() => navigate(`/clients/${client.id}`)}
              className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-gold-600 transition-colors py-2"
            >
              Ver perfil completo <ArrowRight size={12} />
            </button>
          </PremiumCard>
        ))}
      </div>
    </div>
  );
}
