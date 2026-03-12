# 🎨 Design Tokens - Guia de Referência Rápida

## 🔵 Cores Primárias (Azul)

### Tailwind Classes

```tsx
bg-primary-50    // #EFF6FF - Fundo muito claro
bg-primary-100   // #DBEAFE - Fundo claro
bg-primary-200   // #BFDBFE - Fundo suave
bg-primary-300   // #93C5FD - Bordas claras
bg-primary-400   // #60A5FA - Elementos secundários
bg-primary-500   // #3B82F6 - Primary Light
bg-primary-600   // #1F6FE5 - Primary MAIN ⭐
bg-primary-700   // #0F4FBF - Primary Dark
bg-primary-800   // #1E40AF - Muito escuro
bg-primary-900   // #1E3A8A - Quase preto azulado
```

### Variáveis CSS

```css
var(--color-primary)        // #1F6FE5 - Principal
var(--color-primary-dark)   // #0F4FBF - Escuro
var(--color-primary-light)  // #3B82F6 - Claro
var(--color-primary-hover)  // #1E5FCF - Estado hover
```

---

## ✅ Cores de Status

### Success (Verde)
```tsx
bg-green-500     // #16A34A
text-green-600   // Texto verde
```

### Warning (Amarelo/Laranja)
```tsx
bg-yellow-500    // #F59E0B
text-yellow-600  // Texto warning
```

### Error (Vermelho)
```tsx
bg-red-500       // #DC2626
text-red-600     // Texto erro
```

### Info (Azul)
```tsx
bg-blue-500      // #3B82F6
text-blue-600    // Texto informativo
```

---

## 📦 Componentes Comuns

### Botão Primário
```tsx
<button className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white px-4 py-2 rounded-lg transition-colors">
  Confirmar
</button>
```

### Botão Secundário
```tsx
<button className="bg-primary-100 hover:bg-primary-200 text-primary-700 px-4 py-2 rounded-lg transition-colors">
  Cancelar
</button>
```

### Badge/Tag
```tsx
<span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium">
  Novo
</span>
```

### Link
```tsx
<a className="text-primary-600 hover:text-primary-700 underline">
  Saiba mais
</a>
```

### Card com borda azul
```tsx
<div className="bg-white border-2 border-primary-200 hover:border-primary-400 rounded-lg p-4 transition-colors">
  Conteúdo
</div>
```

### Input com foco azul
```tsx
<input className="border border-gray-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-200 rounded-lg px-4 py-2 outline-none transition-all" />
```

### Ícone destaque
```tsx
<IconComponent className="text-primary-600" size={24} />
```

### Divisor azul
```tsx
<div className="h-px bg-primary-200 my-4" />
```

---

## 🌓 Dark Mode

As cores se ajustam automaticamente no dark mode:

```tsx
// Light mode: #1F6FE5
// Dark mode: #3B82F6 (mais claro para melhor contraste)
<div className="bg-primary-600">
  Adapta automaticamente
</div>
```

---

## 🔄 Compatibilidade com Código Antigo

Classes `gold-*` ainda funcionam (renderizam em azul):

```tsx
// ANTES (dourado)
<div className="bg-gold-400">Dourado</div>

// AGORA (renderiza em azul automaticamente!)
<div className="bg-gold-400">Azul</div>

// RECOMENDADO (mais semântico)
<div className="bg-primary-600">Azul</div>
```

---

## 📱 Exemplos Práticos

### Sidebar
```tsx
<aside className="bg-primary-700 text-white">
  <nav>
    <a className="hover:bg-primary-600 px-4 py-2">
      Dashboard
    </a>
  </nav>
</aside>
```

### Notificação de Sucesso
```tsx
<div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg">
  ✅ Salvo com sucesso!
</div>
```

### Modal
```tsx
<div className="bg-white rounded-lg shadow-xl">
  <div className="bg-primary-600 text-white px-6 py-4 rounded-t-lg">
    Título
  </div>
  <div className="p-6">
    Conteúdo
  </div>
</div>
```

### Badge XP (Gamificação)
```tsx
<div className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full flex items-center gap-2">
  <Sparkles size={14} />
  <span>+50 XP</span>
</div>
```

---

## 🎨 Gradientes

### Linear Gradient (Vertical)
```tsx
<div className="bg-gradient-to-b from-primary-500 to-primary-700">
  Gradiente vertical
</div>
```

### Linear Gradient (Horizontal)
```tsx
<div className="bg-gradient-to-r from-primary-600 to-blue-600">
  Gradiente horizontal
</div>
```

### Gradiente com transparência
```tsx
<div style={{
  background: 'linear-gradient(to bottom, rgba(31,111,229,0.3), rgba(31,111,229,0))'
}}>
  Gradiente fade
</div>
```

---

## 🚫 O que NÃO fazer

❌ **Não use cores hardcoded:**
```tsx
// ERRADO
<div style={{ backgroundColor: '#1F6FE5' }}>

// CERTO
<div className="bg-primary-600">
```

❌ **Não use hex direto em gráficos:**
```tsx
// ERRADO
<Area stroke="#1F6FE5" />

// CERTO (use variável CSS)
<Area stroke="var(--color-primary)" />
```

---

## ✅ Checklist de Uso

Ao criar um novo componente:

- [ ] Usa classes Tailwind (`bg-primary-600`) em vez de hex
- [ ] Respeita dark mode
- [ ] Usa cores de status apropriadas (success, warning, error)
- [ ] Tem bom contraste de texto
- [ ] Hover states funcionam
- [ ] É responsivo

---

**Última atualização:** 12/03/2026
