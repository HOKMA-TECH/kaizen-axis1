# 🎨 Exemplos de Componentes com Nova Identidade Visual

## 🔵 Azul como Cor Principal

Todos os exemplos abaixo usam a nova paleta azul (`#1F6FE5` como principal).

---

## 🔘 Botões

### Botão Primário (Azul Sólido)
```tsx
<button className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium px-6 py-3 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg">
  Confirmar
</button>
```

### Botão Secundário (Azul Claro)
```tsx
<button className="bg-primary-100 hover:bg-primary-200 active:bg-primary-300 text-primary-700 font-medium px-6 py-3 rounded-lg transition-colors">
  Cancelar
</button>
```

### Botão com Borda (Outline)
```tsx
<button className="border-2 border-primary-600 hover:bg-primary-50 text-primary-600 font-medium px-6 py-3 rounded-lg transition-colors">
  Saiba Mais
</button>
```

### Botão de Ícone
```tsx
<button className="bg-primary-600 hover:bg-primary-700 text-white p-3 rounded-full transition-colors">
  <Plus size={20} />
</button>
```

---

## 🏷️ Badges/Tags

### Badge Padrão
```tsx
<span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium">
  Novo
</span>
```

### Badge com Ícone
```tsx
<span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
  <Sparkles size={14} />
  +50 XP
</span>
```

### Badge de Status
```tsx
<span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
  Ativo
</span>
```

### Badge Outline
```tsx
<span className="border-2 border-primary-600 text-primary-600 px-3 py-1 rounded-full text-sm font-medium">
  Premium
</span>
```

---

## 📦 Cards

### Card Simples
```tsx
<div className="bg-white border border-gray-200 hover:border-primary-400 rounded-lg p-6 transition-all hover:shadow-lg">
  <h3 className="text-lg font-semibold text-gray-900 mb-2">Título do Card</h3>
  <p className="text-gray-600">Conteúdo do card aqui.</p>
</div>
```

### Card com Header Azul
```tsx
<div className="bg-white rounded-lg shadow-lg overflow-hidden">
  <div className="bg-primary-600 text-white px-6 py-4">
    <h3 className="text-lg font-semibold">Título do Card</h3>
  </div>
  <div className="p-6">
    <p className="text-gray-600">Conteúdo do card aqui.</p>
  </div>
</div>
```

### Card com Borda Azul
```tsx
<div className="bg-white border-l-4 border-primary-600 rounded-lg p-6 shadow-md">
  <h3 className="text-lg font-semibold text-gray-900 mb-2">Destaque</h3>
  <p className="text-gray-600">Informação importante aqui.</p>
</div>
```

### Card Hover (Interativo)
```tsx
<div className="bg-white border-2 border-transparent hover:border-primary-600 rounded-lg p-6 transition-all cursor-pointer hover:shadow-xl">
  <h3 className="text-lg font-semibold text-gray-900 mb-2">Clique aqui</h3>
  <p className="text-gray-600">Card interativo com hover.</p>
</div>
```

---

## 📝 Inputs/Forms

### Input com Foco Azul
```tsx
<input
  type="text"
  className="w-full border border-gray-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-200 rounded-lg px-4 py-3 outline-none transition-all"
  placeholder="Digite aqui..."
/>
```

### Select/Dropdown
```tsx
<select className="w-full border border-gray-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-200 rounded-lg px-4 py-3 outline-none transition-all">
  <option>Selecione uma opção</option>
  <option>Opção 1</option>
  <option>Opção 2</option>
</select>
```

### Checkbox
```tsx
<label className="flex items-center gap-3 cursor-pointer">
  <input
    type="checkbox"
    className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-2 focus:ring-primary-200"
  />
  <span className="text-gray-700">Aceito os termos</span>
</label>
```

### Radio Button
```tsx
<label className="flex items-center gap-3 cursor-pointer">
  <input
    type="radio"
    name="option"
    className="w-5 h-5 text-primary-600 border-gray-300 focus:ring-2 focus:ring-primary-200"
  />
  <span className="text-gray-700">Opção 1</span>
</label>
```

---

## 🔗 Links

### Link Padrão
```tsx
<a href="#" className="text-primary-600 hover:text-primary-700 underline">
  Saiba mais
</a>
```

### Link sem Underline
```tsx
<a href="#" className="text-primary-600 hover:text-primary-700 hover:underline">
  Clique aqui
</a>
```

### Link com Ícone
```tsx
<a href="#" className="text-primary-600 hover:text-primary-700 flex items-center gap-2">
  <span>Documentação</span>
  <ExternalLink size={16} />
</a>
```

---

## 🔔 Notificações/Alertas

### Alerta de Sucesso
```tsx
<div className="bg-green-50 border-l-4 border-green-500 text-green-800 p-4 rounded-lg flex items-start gap-3">
  <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
  <div>
    <p className="font-medium">Sucesso!</p>
    <p className="text-sm">Operação concluída com sucesso.</p>
  </div>
</div>
```

### Alerta de Informação (Azul)
```tsx
<div className="bg-primary-50 border-l-4 border-primary-600 text-primary-800 p-4 rounded-lg flex items-start gap-3">
  <Info size={20} className="text-primary-600 flex-shrink-0 mt-0.5" />
  <div>
    <p className="font-medium">Informação</p>
    <p className="text-sm">Este é um aviso informativo importante.</p>
  </div>
</div>
```

### Alerta de Atenção
```tsx
<div className="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-lg flex items-start gap-3">
  <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
  <div>
    <p className="font-medium">Atenção!</p>
    <p className="text-sm">Revise os dados antes de continuar.</p>
  </div>
</div>
```

### Alerta de Erro
```tsx
<div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-lg flex items-start gap-3">
  <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
  <div>
    <p className="font-medium">Erro!</p>
    <p className="text-sm">Algo deu errado. Tente novamente.</p>
  </div>
</div>
```

---

## 📊 Progress Bar

### Barra de Progresso Azul
```tsx
<div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
  <div className="bg-primary-600 h-full rounded-full transition-all duration-500" style={{ width: '65%' }} />
</div>
```

### Barra de Progresso com Gradiente
```tsx
<div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
  <div
    className="h-full rounded-full bg-gradient-to-r from-primary-600 to-blue-600 transition-all duration-500"
    style={{ width: '75%' }}
  />
</div>
```

---

## 🎛️ Switches/Toggles

### Toggle Switch
```tsx
<label className="relative inline-flex items-center cursor-pointer">
  <input type="checkbox" className="sr-only peer" />
  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-primary-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
  <span className="ml-3 text-sm text-gray-700">Ativar notificações</span>
</label>
```

---

## 📋 Tabelas

### Linha de Tabela com Hover
```tsx
<tr className="border-b hover:bg-primary-50 transition-colors">
  <td className="px-6 py-4 text-gray-900">João Silva</td>
  <td className="px-6 py-4 text-gray-600">joão@email.com</td>
  <td className="px-6 py-4">
    <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm">
      Ativo
    </span>
  </td>
</tr>
```

### Header de Tabela
```tsx
<thead className="bg-primary-600 text-white">
  <tr>
    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
      Nome
    </th>
    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
      Email
    </th>
    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
      Status
    </th>
  </tr>
</thead>
```

---

## 🖼️ Modais

### Modal Completo
```tsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
    {/* Header */}
    <div className="bg-primary-600 text-white px-6 py-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Confirmar Ação</h2>
      <button className="text-white hover:text-gray-200">
        <X size={20} />
      </button>
    </div>

    {/* Body */}
    <div className="p-6">
      <p className="text-gray-600">
        Tem certeza que deseja continuar com esta ação?
      </p>
    </div>

    {/* Footer */}
    <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end">
      <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg">
        Cancelar
      </button>
      <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg">
        Confirmar
      </button>
    </div>
  </div>
</div>
```

---

## 🎨 Gradientes

### Gradiente Vertical
```tsx
<div className="h-32 bg-gradient-to-b from-primary-500 to-primary-700 rounded-lg" />
```

### Gradiente Horizontal
```tsx
<div className="h-32 bg-gradient-to-r from-primary-600 to-blue-600 rounded-lg" />
```

### Gradiente com Transparência
```tsx
<div className="h-32 bg-gradient-to-t from-primary-600/20 to-transparent rounded-lg" />
```

---

## 🎯 Ícones Destacados

### Ícone em Círculo Azul
```tsx
<div className="bg-primary-100 p-3 rounded-full inline-flex">
  <Star size={24} className="text-primary-600" />
</div>
```

### Ícone com Fundo Sólido
```tsx
<div className="bg-primary-600 p-3 rounded-lg inline-flex">
  <Trophy size={24} className="text-white" />
</div>
```

---

## 📱 Navegação/Sidebar

### Item de Menu Ativo
```tsx
<a
  href="#"
  className="bg-primary-600 text-white px-4 py-3 rounded-lg flex items-center gap-3 font-medium"
>
  <Home size={20} />
  <span>Dashboard</span>
</a>
```

### Item de Menu Inativo
```tsx
<a
  href="#"
  className="text-gray-600 hover:bg-primary-50 hover:text-primary-600 px-4 py-3 rounded-lg flex items-center gap-3 transition-colors"
>
  <Users size={20} />
  <span>Clientes</span>
</a>
```

---

**Última atualização:** 12/03/2026
**Paleta:** Azul (`#1F6FE5` como principal)
