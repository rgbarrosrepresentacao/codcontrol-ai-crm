import Link from 'next/link'
import { Bot, Zap, Shield, BarChart3, MessageSquare, Users, ArrowRight, CheckCircle2, Star, Clock, Heart, Sparkles, TrendingUp, DollarSign, HelpCircle, ChevronDown } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen gradient-hero overflow-x-hidden">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
              <Bot className="w-6 h-6 text-black" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl tracking-tight text-foreground">CodControl</span>
                <span className="text-[10px] bg-primary/20 text-primary font-black px-1.5 py-0.5 rounded-md border border-primary/30 uppercase tracking-tighter">BETA</span>
              </div>
              <span className="text-[10px] text-primary font-bold tracking-widest uppercase -mt-1">AI SALES CRM</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-10">
            <a href="#solucao" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Solução</a>
            <a href="#recursos" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Recursos</a>
            <a href="#planos" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Planos</a>
            <div className="w-px h-4 bg-border/50 mx-2" />
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">Entrar</Link>
            <Link href="/register?plan=basico" className="gradient-primary text-black font-bold px-6 py-2.5 rounded-full text-sm hover:scale-105 transition-all shadow-lg hover:shadow-primary/20">
              Começar grátis
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-24 md:pt-48 md:pb-40">
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-5 py-2 mb-8 animate-slide-up shadow-[0_0_20px_rgba(20,184,166,0.1)]">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-primary text-xs font-bold uppercase tracking-wider">A Nova Era do CRM de WhatsApp</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-foreground mb-8 animate-slide-up leading-[0.9] tracking-tighter">
            Sua Vendedora <br />
            <span className="text-transparent bg-clip-text gradient-primary">que nunca dorme.</span>
          </h1>

          <p className="text-muted-foreground text-xl md:text-2xl max-w-3xl mx-auto mb-12 animate-slide-up leading-relaxed">
            Transforme seu WhatsApp em uma máquina de vendas automática 24/7.
            Atendimento humano, inteligente e focado em captar e fechar pedidos enquanto você escala seu negócio.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center animate-slide-up">
            <Link href="/register?plan=basico" className="gradient-primary text-black font-black px-12 py-5 rounded-2xl text-xl hover:scale-105 transition-all glow-primary flex items-center gap-3">
              TESTAR POR 7 DIAS GRÁTIS
              <ArrowRight className="w-6 h-6" />
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-secondary" />
                ))}
              </div>
              <span className="text-sm font-medium">+2.400 vendedores ativos</span>
            </div>
          </div>

          <div className="mt-20 relative animate-fade-in group">
            <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full group-hover:bg-primary/30 transition-all duration-700" />
            <div className="relative glass border border-primary/20 rounded-3xl p-4 md:p-8 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-4 mb-6 border-b border-border/50 pb-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <div className="bg-muted px-4 py-1 rounded-md text-[10px] text-muted-foreground font-mono">codcontrol.crm/dashboard</div>
              </div>
              <div className="grid grid-cols-12 gap-6 items-start">
                <div className="col-span-12 md:col-span-4 space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 gradient-card border border-border/50 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                        <div className="h-2 w-1/2 bg-muted/50 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="col-span-12 md:col-span-8 flex flex-col gap-4">
                  <div className="h-64 gradient-card border border-border/50 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-4 right-4 bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/30">BOT ATIVO</div>
                    <div className="flex flex-col gap-4 h-full">
                      <div className="bg-secondary self-start px-4 py-3 rounded-2xl rounded-tl-none text-xs max-w-[80%] text-left">
                        Olá! Quero saber mais sobre o produto Liso Mágico
                      </div>
                      <div className="gradient-primary text-black self-end px-4 py-3 rounded-2xl rounded-tr-none text-xs max-w-[80%] font-medium text-left">
                        Olá, tudo bem? Sou a Camila! O Liso Mágico é ideal para quem busca praticidade. Ele não tem formol e o resultado é na hora! Você quer garantir o desconto de hoje? 😊
                      </div>
                      <div className="bg-secondary self-start px-4 py-3 rounded-2xl rounded-tl-none text-xs max-w-[80%] text-left">
                        Sim! Como faço para comprar?
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="solucao" className="max-w-7xl mx-auto px-6 py-32 border-t border-border/30">
        <div className="grid md:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
              Não perca mais nenhuma venda <br />
              <span className="text-primary italic">por demora no atendimento.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              A maioria dos clientes compra no primeiro que responder. Enquanto você dorme ou está ocupado, o CodControl atende, tira dúvidas e encaminha para o pagamento.
            </p>
            <div className="space-y-6">
              {[
                { icon: Clock, title: 'Resposta Instantânea', desc: 'Atenda em menos de 5 segundos, 24 horas por dia.' },
                { icon: Heart, title: 'IA Ultra-Humana', desc: 'Sua IA aprende seu tom de voz e responde de forma natural.' },
                { icon: TrendingUp, title: 'Foco Total em Vendas', desc: 'Configurado para fechar pedidos e não apenas "tirar dúvidas".' }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground mb-1">{item.title}</h4>
                    <p className="text-muted-foreground text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square gradient-card border border-border/50 rounded-[40px] rotate-3 shadow-2xl p-8 flex flex-col justify-center gap-6 overflow-hidden relative">
              <div className="absolute inset-0 bg-primary/5 -z-10 animate-pulse-soft" />
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <span className="text-xl font-bold text-foreground">Aumento de 400% na conversão</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <span className="text-xl font-bold text-foreground">Zero leads perdidos</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <span className="text-xl font-bold text-foreground">Atendimento escalável</span>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-border/50">
                <div className="flex gap-1 text-yellow-500 mb-2">
                  {[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-sm italic text-muted-foreground">"O CodControl dobrou meu faturamento no primeiro mês. O robô vende mais que eu!"</p>
                <p className="text-xs font-bold text-foreground mt-4">— Rafael Akilys, Info-produtor</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="recursos" className="bg-secondary/30 py-32">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Toda a potência de um CRM moderno</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-20 animate-slide-up leading-relaxed">
            Tudo o que você precisa para gerenciar seus vendedores automáticos e organizar seus leads de forma profissional.
          </p>
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              { icon: MessageSquare, title: 'Cérebro com ChatGPT', desc: 'Configure o prompt do seu jeito. Dê uma personalidade, um catálogo e veja a mágica acontecer.', color: 'from-emerald-500/10 to-teal-500/10' },
              { icon: Zap, title: 'Dashboard de Performance', desc: 'Métricas reais. Quantas mensagens enviadas, quanto tempo economizado e taxa de conversão.', color: 'from-blue-500/10 to-cyan-500/10' },
              { icon: Users, title: 'CRM de Contatos', desc: 'Organize leads por tags: "Comprador", "Em dúvida", "Boleto". Não perca ninguém de vista.', color: 'from-purple-500/10 to-pink-500/10' },
              { icon: Clock, title: 'Memória Total', desc: 'O robô nunca esquece o que o cliente falou ontem. Continuamos a conversa de onde parou.', color: 'from-orange-500/10 to-red-500/10' },
              { icon: Shield, title: 'Fácil & Seguro', desc: 'Conexão via QR Code criptografado. Total segurança para o seu número oficial do WhatsApp.', color: 'from-green-500/10 to-emerald-500/10' },
              { icon: DollarSign, title: 'Foco no Lucro', desc: 'Nossa IA é treinada para identificar gatilhos de compra e direcionar para o checkout.', color: 'from-yellow-500/10 to-orange-500/10' },
            ].map((f, idx) => (
              <div key={idx} className="gradient-card border border-border/50 rounded-2xl p-8 hover:border-primary/50 transition-all hover:-translate-y-2 group">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.color} border border-border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="max-w-7xl mx-auto px-6 py-32 text-center">
        <h2 className="text-4xl font-bold text-foreground mb-20 leading-tight tracking-tight italic">3 Passos para seu Vendedor 24h</h2>
        <div className="grid md:grid-cols-3 gap-12 relative">
          <div className="hidden md:block absolute top-10 left-1/4 right-1/4 h-px border-t border-dashed border-primary/30" />
          {[
            { step: '01', title: 'Conecte o WhatsApp', desc: 'Escaneie o QR Code em 5 segundos e pronto.' },
            { step: '02', title: 'Defina o Prompt', desc: 'Diga para a IA quem ela deve ser e o que ela vende.' },
            { step: '03', title: 'Escala Ativada', desc: 'Deixe o robô atender 1 ou 10.000 pessoas ao mesmo tempo.' },
          ].map((s, idx) => (
            <div key={idx} className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full gradient-primary text-black font-black text-xl flex items-center justify-center mb-6 shadow-xl shadow-primary/20">
                {s.step}
              </div>
              <h4 className="text-xl font-bold text-foreground mb-3">{s.title}</h4>
              <p className="text-muted-foreground text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="relative py-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] bg-primary/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-block bg-secondary px-4 py-1.5 rounded-full border border-border text-xs font-bold text-muted-foreground mb-4 uppercase tracking-widest">Pricing</div>
          <h2 className="text-5xl md:text-6xl font-black text-foreground mb-6">Investimento Ideal <br /> <span className="text-primary italic">para seu Lucro.</span></h2>
          <p className="text-muted-foreground text-lg mb-16">Pague menos que um café por dia e tenha um time de elite atendendo seus clientes.</p>

          <div className="grid md:grid-cols-3 gap-8 items-end max-w-6xl mx-auto">
            {/* Basic */}
            <div className="gradient-card border border-border/50 rounded-3xl p-10 text-left hover:border-primary/20 transition-all flex flex-col h-full">
              <h3 className="text-xl font-bold text-foreground mb-2">Standard</h3>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-muted-foreground text-sm font-medium">R$</span>
                <span className="text-5xl font-black text-foreground">97</span>
                <span className="text-muted-foreground text-sm font-medium">/mês</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> 1 WhatsApp Conectado</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> IA c/ Memória Contextual</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> CRM Completo</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> Dashboard Simples</li>
              </ul>
              <Link href="/register?plan=basico" className="w-full text-center border border-border text-foreground font-bold py-4 rounded-xl hover:bg-secondary transition-all">
                COMEÇAR AGORA
              </Link>
            </div>

            {/* Pro */}
            <div className="relative gradient-card border-2 border-primary glow-primary rounded-[32px] p-12 text-left scale-110 z-20 flex flex-col h-full shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 gradient-primary text-black text-[10px] font-black px-4 py-1.5 rounded-full tracking-widest flex items-center gap-2">
                <Star className="w-3 h-3 fill-black" /> O MAIS VENDIDO
              </div>
              <h3 className="text-2xl font-black text-foreground mb-2">Professional</h3>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-muted-foreground text-sm font-medium">R$</span>
                <span className="text-6xl font-black text-foreground tracking-tighter">497</span>
                <span className="text-muted-foreground text-sm font-medium">/mês</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center gap-3 text-md text-foreground font-bold"><CheckCircle2 className="w-5 h-5 text-primary" /> 3 WhatsApps Conectados</li>
                <li className="flex items-center gap-3 text-sm text-foreground/80 font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> IA Premium (GPT-4o)</li>
                <li className="flex items-center gap-3 text-sm text-foreground/80 font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> CRM Avançado com Tags</li>
                <li className="flex items-center gap-3 text-sm text-foreground/80 font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> Relatórios de Performance</li>
                <li className="flex items-center gap-3 text-sm text-foreground/80 font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> Suporte Prioritário</li>
              </ul>
              <Link href="/register?plan=pro" className="w-full text-center gradient-primary text-black font-black py-5 rounded-2xl hover:scale-[1.02] transition-all shadow-xl shadow-primary/20">
                GARANTIR MINHA VAGA
              </Link>
            </div>

            {/* Agency */}
            <div className="gradient-card border border-border/50 rounded-3xl p-10 text-left hover:border-primary/20 transition-all flex flex-col h-full">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-foreground">Elite / Agência</h3>
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-muted-foreground text-sm font-medium">R$</span>
                <span className="text-5xl font-black text-foreground">997</span>
                <span className="text-muted-foreground text-sm font-medium">/mês</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> 10 WhatsApps Conectados</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> Mensagens Ilimitadas</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> White Label (Breve)</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> API de Integração</li>
                <li className="flex items-center gap-3 text-sm text-muted-foreground font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> Gerente Dedicado</li>
              </ul>
              <Link href="/register?plan=agencia" className="w-full text-center border border-border text-foreground font-bold py-4 rounded-xl hover:bg-secondary transition-all">
                FALAR COM TIME ELITE
              </Link>
            </div>
          </div>

          <p className="mt-12 text-muted-foreground text-sm font-medium">Precisa de algo customizado? <Link href="#" className="text-primary underline font-bold">Consulte nosso time de vendas.</Link></p>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-6 py-32">
        <h2 className="text-4xl font-black text-center mb-16">Dúvidas Frequentes</h2>
        <div className="space-y-4">
          {[
            { q: 'O robô consegue imitar minha voz?', a: 'Sim! Você configura o tom de voz (formal, casual, informal) e ele aprende sobre seu produto para responder igual a um vendedor real.' },
            { q: 'Corre risco de banimento?', a: 'Nós usamos a API oficial da Evolution que segue padrões seguros. O segredo está no comportamento humano da nossa IA, o que reduz drasticamente riscos em relação a disparadores de massa.' },
            { q: 'Preciso deixar o celular ligado?', a: 'Não! Uma vez conectado via QR Code, o sistema roda em nuvem 24h por dia, mesmo com seu celular desligado ou sem internet.' },
            { q: 'Tem fidelidade no contrato?', a: 'Zero fidelidade. Você pode cancelar sua assinatura mensal a qualquer momento com apenas um clique.' },
          ].map((item, i) => (
            <div key={i} className="gradient-card border border-border/50 rounded-2xl p-6 group cursor-pointer hover:border-primary/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-foreground flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  {item.q}
                </h4>
                <ChevronDown className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all" />
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed hidden group-hover:block animate-fade-in mt-4 border-t border-border/50 pt-4">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="max-w-7xl mx-auto px-6 mb-32">
        <div className="gradient-primary rounded-[40px] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl shadow-primary/20">
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 blur-3xl rounded-full" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-black/10 blur-3xl rounded-full" />

          <h2 className="text-4xl md:text-6xl font-black text-black mb-8 leading-tight tracking-tight">
            Pronto para ver sua empresa <br /> vendendo no piloto automático?
          </h2>
          <div className="flex flex-col items-center gap-6 relative z-10">
            <Link href="/register?plan=basico" className="bg-black text-white font-black px-12 py-6 rounded-2xl text-2xl hover:scale-105 transition-all shadow-2xl flex items-center gap-3">
              QUERO MINHA CONTA GRÁTIS AGORA!
              <ArrowRight className="w-8 h-8" />
            </Link>
            <p className="text-black/70 font-bold text-sm">Nenhum cartão de crédito necessário nos primeiros 7 dias.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight italic">CodControl AI</span>
          </div>
          <p className="text-muted-foreground text-xs font-medium italic">© 2026 CodControl. Todos os direitos reservados. v1.0.0-beta</p>
          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Termos</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
