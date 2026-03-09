import Link from 'next/link'
import { Bot, Zap, Shield, BarChart3, MessageSquare, Users, ArrowRight, CheckCircle2, Star } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">CodControl AI CRM</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Recursos</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Planos</a>
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors text-sm">Entrar</Link>
            <Link href="/register" className="gradient-primary text-black font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
              Começar grátis
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6 animate-slide-up">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-primary text-xs font-medium">Automação inteligente de WhatsApp</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 animate-slide-up leading-tight">
          WhatsApp com IA<br />
          <span className="text-transparent bg-clip-text gradient-primary">no piloto automático</span>
        </h1>

        <p className="text-muted-foreground text-xl max-w-2xl mx-auto mb-10 animate-slide-up">
          Conecte seu WhatsApp, configure sua IA com ChatGPT e deixe o sistema responder seus clientes automaticamente 24/7.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
          <Link href="/register" className="gradient-primary text-black font-bold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-all hover:scale-105 flex items-center gap-2 justify-center glow-primary">
            Criar conta grátis
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/login" className="border border-border text-foreground font-semibold px-8 py-4 rounded-xl text-lg hover:bg-secondary transition-colors flex items-center gap-2 justify-center">
            Já tenho conta
          </Link>
        </div>

        <div className="flex items-center justify-center gap-8 mt-12 text-muted-foreground text-sm animate-fade-in">
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" />7 dias grátis</div>
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" />Sem cartão</div>
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" />Cancele quando quiser</div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '2.4k+', label: 'Usuários ativos' },
            { value: '98%', label: 'Uptime garantido' },
            { value: '5M+', label: 'Mensagens/mês' },
            { value: '4.9★', label: 'Avaliação média' },
          ].map((stat) => (
            <div key={stat.label} className="gradient-card border border-border rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
              <div className="text-muted-foreground text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Tudo que você precisa</h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">Uma plataforma completa para automatizar seu atendimento no WhatsApp com IA.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: MessageSquare, title: 'IA com ChatGPT', desc: 'Use sua própria API OpenAI. Configure o prompt, o tom e o comportamento do assistente.', color: 'from-emerald-500/20 to-teal-500/20' },
            { icon: Zap, title: 'Conexão instantânea', desc: 'Conecte seu WhatsApp em segundos escaneando o QR Code. Sem instalar nada.', color: 'from-blue-500/20 to-cyan-500/20' },
            { icon: BarChart3, title: 'Dashboard completo', desc: 'Veja métricas em tempo real: mensagens, conversas ativas, uso de IA e muito mais.', color: 'from-purple-500/20 to-pink-500/20' },
            { icon: Users, title: 'CRM integrado', desc: 'Gerencie contatos, histórico de conversas, tags, notas e status de atendimento.', color: 'from-orange-500/20 to-red-500/20' },
            { icon: Shield, title: 'Multi-tenant seguro', desc: 'Cada cliente vê apenas seus dados. Row Level Security com Supabase.', color: 'from-green-500/20 to-emerald-500/20' },
            { icon: Bot, title: 'n8n integrado', desc: 'Todo WhatsApp conectado envia mensagens automaticamente pro seu servidor n8n.', color: 'from-yellow-500/20 to-orange-500/20' },
          ].map((f) => (
            <div key={f.title} className="gradient-card border border-border rounded-xl p-6 hover:border-primary/30 transition-all hover:scale-[1.02] group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-foreground font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Planos e preços</h2>
          <p className="text-muted-foreground text-lg">Comece com 7 dias grátis, sem cartão de crédito.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-center">
          {[
            {
              name: 'Básico', price: 97, popular: false,
              features: ['1 WhatsApp conectado', '1.000 mensagens IA/mês', 'Dashboard completo', 'Suporte por email'],
              whatsapps: 1, messages: '1.000'
            },
            {
              name: 'Pro', price: 197, popular: true,
              features: ['3 WhatsApps conectados', '5.000 mensagens IA/mês', 'CRM completo', 'Suporte prioritário', 'Relatórios avançados'],
              whatsapps: 3, messages: '5.000'
            },
            {
              name: 'Agência', price: 397, popular: false,
              features: ['10 WhatsApps conectados', 'Mensagens ilimitadas', 'Multi-tenant', 'Suporte dedicado', 'API de integração'],
              whatsapps: 10, messages: 'Ilimitadas'
            },
          ].map((plan) => (
            <div key={plan.name} className={`relative rounded-2xl border p-8 ${plan.popular ? 'border-primary glow-primary gradient-card scale-105' : 'border-border gradient-card'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="gradient-primary text-black text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" /> MAIS POPULAR
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-foreground font-bold text-xl mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-muted-foreground text-sm">R$</span>
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={`block text-center font-semibold py-3 rounded-xl transition-all ${plan.popular ? 'gradient-primary text-black hover:opacity-90' : 'border border-border hover:bg-secondary text-foreground'}`}>
                Começar agora
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-muted-foreground text-sm">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md gradient-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-foreground">CodControl AI CRM</span>
          </div>
          <p>© 2026 CodControl. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
