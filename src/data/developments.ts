export interface Development {
  id: string;
  name: string;
  builder: string;
  location: string;
  address: string;
  price: string;
  minPrice: number;
  maxPrice: number;
  minIncome: string; // Display string
  minIncomeValue: number; // Numeric for logic
  maxIncomeValue: number; // Numeric for logic
  financingType: string; // Enquadramento
  acceptsCotista: boolean;
  acceptsSocialFactor: boolean;
  mainBank: string;
  commercialDifferential: string;
  type: string;
  status: string;
  images: string[];
  videoUrl?: string; // URL for iframe embed or video file
  description: string;
  differentials: string[];
  bookPdfUrl?: string;
  contact: {
    name: string;
    phone: string;
    email: string;
    role: string;
    avatar: string;
  };
  coordinates: {
    lat: number;
    lng: number;
  };
}

export const MOCK_DEVELOPMENTS: Development[] = [
  {
    id: '1',
    name: 'Reserva Imperial',
    builder: 'Moura Dubeux',
    location: 'Boa Viagem, Recife',
    address: 'Av. Boa Viagem, 4500 - Boa Viagem, Recife - PE, 51021-000',
    price: 'R$ 450k - R$ 890k',
    minPrice: 450000,
    maxPrice: 890000,
    minIncome: 'R$ 12.000',
    minIncomeValue: 12000,
    maxIncomeValue: 30000,
    financingType: 'SBPE',
    acceptsCotista: true,
    acceptsSocialFactor: false,
    mainBank: 'Bradesco',
    commercialDifferential: 'Alto padrão à beira-mar com condições especiais de lançamento.',
    type: 'Apartamento',
    status: 'Lançamento',
    images: [
      'https://picsum.photos/seed/imp/800/600',
      'https://picsum.photos/seed/imp2/800/600',
      'https://picsum.photos/seed/imp3/800/600',
      'https://picsum.photos/seed/imp4/800/600'
    ],
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Placeholder
    description: 'O Reserva Imperial redefine o conceito de luxo à beira-mar. Com arquitetura moderna e acabamentos de altíssimo padrão, oferece uma experiência de vida exclusiva para quem não abre mão de sofisticação e conforto.',
    differentials: [
      'Vista definitiva para o mar',
      'Piscina com borda infinita no rooftop',
      'Academia panorâmica equipada',
      'Automação residencial integrada',
      'Vagas para carros elétricos',
      'Concierge 24h'
    ],
    bookPdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    contact: {
      name: 'Roberto Almeida',
      phone: '(81) 99999-8888',
      email: 'roberto@mouradubeux.com.br',
      role: 'Gerente de Produto',
      avatar: 'https://picsum.photos/seed/roberto/200'
    },
    coordinates: {
      lat: -8.1234,
      lng: -34.9000
    }
  },
  {
    id: '2',
    name: 'Grand Tower',
    builder: 'Rio Ave',
    location: 'Pina, Recife',
    address: 'Av. Antônio de Góes, 200 - Pina, Recife - PE',
    price: 'R$ 800k - R$ 1.5M',
    minPrice: 800000,
    maxPrice: 1500000,
    minIncome: 'R$ 25.000',
    minIncomeValue: 25000,
    maxIncomeValue: 50000,
    financingType: 'SBPE / Direto',
    acceptsCotista: true,
    acceptsSocialFactor: true,
    mainBank: 'Itaú',
    commercialDifferential: 'Rentabilidade garantida e localização no polo empresarial.',
    type: 'Flat',
    status: 'Em Construção',
    images: [
      'https://picsum.photos/seed/grand/800/600',
      'https://picsum.photos/seed/grand2/800/600',
      'https://picsum.photos/seed/grand3/800/600'
    ],
    description: 'Localizado no coração do polo empresarial, o Grand Tower é a escolha ideal para investidores e executivos. Flats modernos com serviços de hotelaria e rentabilidade garantida.',
    differentials: [
      'Localização estratégica',
      'Serviços Pay-Per-Use',
      'Coworking integrado',
      'Restaurante internacional no térreo'
    ],
    contact: {
      name: 'Carla Souza',
      phone: '(81) 98888-7777',
      email: 'carla@rioave.com.br',
      role: 'Coordenadora de Vendas',
      avatar: 'https://picsum.photos/seed/carla/200'
    },
    coordinates: {
      lat: -8.0900,
      lng: -34.8900
    }
  },
  {
    id: '3',
    name: 'Vila Verde',
    builder: 'MRV',
    location: 'Candeias, Jaboatão',
    address: 'Rua da Paz, 100 - Candeias, Jaboatão dos Guararapes - PE',
    price: 'R$ 220k - R$ 350k',
    minPrice: 220000,
    maxPrice: 350000,
    minIncome: 'R$ 4.000',
    minIncomeValue: 4000,
    maxIncomeValue: 8000,
    financingType: 'MCMV Faixa 3',
    acceptsCotista: true,
    acceptsSocialFactor: true,
    mainBank: 'Caixa',
    commercialDifferential: 'Entrada facilitada em até 60x e subsídio do governo.',
    type: 'Casa',
    status: 'Pronto',
    images: [
      'https://picsum.photos/seed/vila/800/600',
      'https://picsum.photos/seed/vila2/800/600'
    ],
    description: 'O condomínio clube mais completo da região. Casas com jardim privativo e segurança 24h, perfeito para sua família crescer com tranquilidade.',
    differentials: [
      'Condomínio Clube',
      'Área verde preservada',
      'Pet Place',
      'Financiamento facilitado'
    ],
    contact: {
      name: 'Felipe Santos',
      phone: '(81) 97777-6666',
      email: 'felipe@mrv.com.br',
      role: 'Consultor Imobiliário',
      avatar: 'https://picsum.photos/seed/felipe/200'
    },
    coordinates: {
      lat: -8.1800,
      lng: -34.9200
    }
  }
];
