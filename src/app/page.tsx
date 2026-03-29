'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { 
  Bot, Zap, Shield, BarChart3, MessageSquare, Users, ArrowRight, 
  CheckCircle2, Star, Clock, Heart, Sparkles, TrendingUp, 
  DollarSign, HelpCircle, ChevronDown, Rocket, Smartphone, 
  Target, Lock, Layers, PlayCircle, Plus, Minus
} from 'lucide-react'

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen gradient-hero relative">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 pointer-events-none opacity-20 animate-pulse-glow z-[-1] bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${scrolled ? 'py-4' : 'py-6'}`}>
        <div className="container-7xl">
          <div className="glass px-6 py-3 rounded-2xl flex items-center justify-between border-white/5 mx-4 md:mx-0">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="CodControl Logo" width={32} height={32} className="w-8 h-8 rounded-lg" />
              <div className="flex flex-col">
                <span className="font-black text-lg md:text-xl tracking-tighter leading-none">
                  CodControl <span className="text-primary tracking-normal">AI</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest -mt-0.5">Sales CRM</span>
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#solucao" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Solução</a>
              <a href="#recursos" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Recursos</a>
              <a href="#faq" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Dúvidas</a>
              <div className="w-px h-6 bg-border/40 mx-2" />
              <Link href="/login" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">Entrar</Link>
              <Link href="/register?plan=basico" className="gradient-primary text-black font-black px-6 py-2.5 rounded-xl text-sm hover:scale-105 active:scale-95 transition-all glow-primary leading-none">
                COMEÇAR POR R$10
              </Link>
            </div>

            <div className="md:hidden">
                <Link href="/register?plan=basico" className="gradient-primary text-black font-black px-4 py-2 rounded-xl text-xs hover:scale-105 transition-all glow-primary leading-none">
                    TESTAR AGORA
                </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 md:pt-64 pb-24 relative overflow-hidden">
        <div className="container-7xl text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-5 py-2 mb-8 animate-slide-up shadow-[0_0_20px_rgba(20,184,166,0.1)]">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-primary text-[11px] font-bold uppercase tracking-[0.2em]">O futuro das vendas no WhatsApp</span>
          </div>

          <h1 className="text-5xl md:text-8xl font-black text-foreground mb-8 animate-slide-up leading-[0.95] tracking-tightest px-4">
            Transforme seu WhatsApp em uma <br className="hidden md:block" />
            <span className="text-gradient from-primary to-cyan-400 text-glow-primary">Máquina de Vendas 24h</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-2xl max-w-3xl mx-auto mb-12 animate-slide-up leading-relaxed text-balance px-4 opacity-80">
            A vendedora com Inteligência Artificial que responde seus clientes, quebra objeções e fecha vendas pra você — <span className="text-white font-medium">mesmo enquanto você dorme.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center animate-slide-up px-4">
            <Link href="/register?plan=basico" className="w-full sm:w-auto gradient-primary text-black font-black px-12 py-5 rounded-2xl text-xl hover:scale-105 active:scale-95 transition-all glow-primary flex items-center justify-center gap-3">
              TESTAR POR R$10 AGORA
              <ArrowRight className="w-6 h-6" />
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex -space-x-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-9 h-9 rounded-full border-[3px] border-background bg-secondary flex items-center justify-center overflow-hidden">
                     <Users className="w-4 h-4 text-primary/50" />
                  </div>
                ))}
              </div>
              <span className="text-sm font-semibold ml-2">+2.400 vendedores já automatizando</span>
            </div>
          </div>
        </div>

        {/* Visual Elements Background */}
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[150px] animate-pulse-glow" />
        <div className="absolute bottom-0 left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[150px] animate-pulse-glow" />
      </section>

      {/* Demo Section (Chat Simulator) */}
      <section className="pb-32 container-7xl px-4 md:px-6">
        <div className="relative animate-reveal">
           <div className="absolute inset-0 bg-primary/10 blur-[120px] rounded-full opacity-30" />
           <div className="relative glass border border-white/5 rounded-[40px] p-2 overflow-hidden shadow-2xl">
              <div className="bg-background/40 rounded-[38px] overflow-hidden p-6 md:p-12">
                 <div className="grid md:grid-cols-2 gap-12 items-center text-left">
                    <div className="space-y-6">
                       <span className="text-primary font-black text-xs tracking-widest uppercase">Demonstração Real</span>
                       <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">Venda acontecendo no <br /> <span className="italic opacity-50">Piloto Automático.</span></h2>
                       <p className="text-muted-foreground text-lg leading-relaxed text-balance">
                          Enquanto seu concorrente demora 10 minutos para responder e perde o cliente, o CodControl inicia o fechamento em 5 segundos.
                       </p>
                       <div className="pt-4 flex flex-wrap gap-8 items-center">
                          <div className="flex flex-col">
                             <span className="text-4xl font-black text-primary">100%</span>
                             <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Nuvem</span>
                          </div>
                          <div className="w-px h-12 bg-white/10" />
                          <div className="flex flex-col">
                            <span className="text-4xl font-black text-primary">24h</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Ativo</span>
                          </div>
                          <div className="w-px h-12 bg-white/10" />
                          <div className="flex flex-col">
                            <span className="text-4xl font-black text-primary">1s</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Resposta</span>
                          </div>
                       </div>
                    </div>
                    
                    {/* Chat Simulator */}
                    <div className="glass shadow-2xl rounded-3xl border-white/5 p-6 space-y-4 max-w-sm mx-auto w-full relative">
                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                                <Bot className="w-6 h-6 text-black" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-foreground">Camila (Vendedora IA)</h4>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] text-primary uppercase font-black tracking-widest">Online</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 h-80 overflow-y-auto pr-2 custom-scrollbar">
                           {[
                             { sender: 'user', text: 'Olá! Tenho interesse no pacote Liso Mágico.' },
                             { sender: 'ai', text: 'Oi! Tudo bem? Ótima escolha! O Liso Mágico é nosso campeão de vendas. Você quer garantir o desconto de lançamento agora? 😊' },
                             { sender: 'user', text: 'Sim, mas como é entregue?' },
                             { sender: 'ai', text: 'É tudo 100% digital e rápido! Assim que o sistema reconhecer o PIX, você recebe seus dados no e-mail na hora. Posso gerar seu link de desconto? 🚀' }
                           ].map((msg, i) => (
                             <div key={i} className={`${msg.sender === 'ai' ? 'gradient-primary text-black font-semibold self-end shadow-lg' : 'bg-white/5 text-foreground self-start'} px-4 py-3 rounded-2xl ${msg.sender === 'ai' ? 'rounded-tr-none' : 'rounded-tl-none'} text-xs max-w-[85%] animate-slide-up`}>
                               {msg.text}
                             </div>
                           ))}
                           <div className="bg-white/5 border border-white/10 p-3 rounded-xl border-dashed animate-pulse text-[10px] text-muted-foreground text-center">
                              IA preparando link de checkout...
                           </div>
                        </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-24 bg-white/[0.01]">
        <div className="container-7xl">
          <div className="text-center mb-20 space-y-4 max-w-3xl mx-auto">
             <span className="text-destructive font-black text-xs uppercase tracking-[0.3em] leading-none mb-4 block">A DURA REALIDADE</span>
             <h2 className="text-4xl md:text-6xl font-black tracking-tightest leading-none">Você está <span className="text-destructive border-b-4 border-destructive/20 italic">perdendo vendas</span> todos os dias.</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
             {[
               { title: 'Demora mata o lucro', desc: 'Cliente mandou mensagem às 2h da manhã? Ele não vai esperar você acordar para comprar de outro.' },
               { title: 'Leads esfriando agora', desc: 'Cada minuto de espera diminui drasticamente sua conversão. Velocidade é faturamento imediato.' },
               { title: 'Limite Humano Real', desc: 'Você não consegue atender 100 pessoas ao mesmo tempo com qualidade. A IA consegue e nunca se cansa.' }
             ].map((item, i) => (
                <div key={i} className="glass-card p-10 rounded-[40px] space-y-4 border-red-500/5 hover:bg-red-500/5 hover:border-red-500/20 transition-all duration-500 group">
                   <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Minus className="w-6 h-6 text-red-500" />
                   </div>
                   <h3 className="text-xl font-black text-foreground">{item.title}</h3>
                   <p className="text-muted-foreground text-sm leading-relaxed opacity-70">{item.desc}</p>
                </div>
             ))}
          </div>
          <div className="mt-16 text-center">
             <p className="text-xl md:text-2xl font-bold opacity-30 italic">"O problema não é falta de cliente… é falta de velocidade de resposta."</p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="solucao" className="py-32 relative">
        <div className="container-7xl text-center">
            <h2 className="text-4xl md:text-6xl font-black mb-24 tracking-tightest">CodControl Resolve Tudo em <span className="text-primary italic">3 Passos Rápidos</span></h2>
            
            <div className="grid md:grid-cols-3 gap-16 relative">
                <div className="hidden md:block absolute top-[48px] left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-transparent via-white/5 to-transparent border-t border-dashed border-white/20" />
                
                {[
                    { icon: Smartphone, title: 'Conecte o App', desc: 'Abra o sistema, escaneie o QR Code em 5 segundos. Seu número está pronto para a guerra.' },
                    { icon: Target, title: 'Configure a IA', desc: 'Diga para a Camila o que você vende, seus preços e tom de voz. Ela aprende em segundos.' },
                    { icon: Rocket, title: 'Escala Ativada', desc: 'Sinta o alívio. Suas mensagens são respondidas e suas vendas fechadas no automático.' }
                ].map((step, i) => (
                    <div key={i} className="flex flex-col items-center group relative z-10">
                        <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mb-8 rotate-3 group-hover:rotate-0 group-hover:scale-110 transition-all duration-500 shadow-2xl shadow-primary/20">
                            <step.icon className="w-10 h-10 text-black" />
                            <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-black flex items-center justify-center border-2 border-primary text-primary font-black text-xl shadow-xl">
                                {i + 1}
                            </div>
                        </div>
                        <h4 className="text-2xl font-black text-foreground mb-4">{step.title}</h4>
                        <p className="text-muted-foreground leading-relaxed px-4 opacity-80">{step.desc}</p>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* Benefits Focus */}
      <section className="py-32 bg-primary/[0.02]">
         <div className="container-7xl">
            <div className="grid md:grid-cols-2 gap-24 items-center">
               <div className="space-y-8">
                  <span className="text-primary font-black text-xs uppercase tracking-[0.3em]">POR QUE VOCÊ PRECISA DISSO AGORA</span>
                  <h2 className="text-4xl md:text-7xl font-black tracking-tightest leading-[0.9]">Venda 24h sem gastar <br /> com <span className="text-primary border-b-4 border-primary/20 italic">funcionários.</span></h2>
                  <p className="text-muted-foreground text-lg leading-relaxed opacity-80">
                     A vendedora IA não cansa, não reclama e não esquece de responder. Ela é o ativo mais valioso do seu negócio hoje.
                  </p>
                  
                  <div className="grid gap-6">
                     {[
                        { icon: Zap, title: 'Venda enquanto dorme', desc: 'O horário de pico muitas vezes é quando você não pode atender.' },
                        { icon: Users, title: 'Atendimento em Massa', desc: 'Atenda 10 ou 10.000 pessoas com a mesma perfeição e paciência.' },
                        { icon: DollarSign, title: 'Menor Custo, Maior Lucro', desc: 'Uma fração do custo de um vendedor humano, com 10x mais eficiência.' }
                     ].map((item, i) => (
                        <div key={i} className="flex gap-6 items-start">
                           <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 neon-border-hover">
                              <item.icon className="w-7 h-7 text-primary" />
                           </div>
                           <div className="pt-1">
                              <h4 className="font-black text-xl text-foreground mb-2">{item.title}</h4>
                              <p className="text-muted-foreground text-sm opacity-70">{item.desc}</p>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               <div className="relative group p-4">
                   <div className="absolute inset-x-0 -inset-y-5 bg-primary/10 blur-[120px] rounded-full group-hover:bg-primary/20 transition-all duration-700" />
                   <div className="relative glass border border-white/10 rounded-[50px] p-12 transform rotate-2 group-hover:rotate-0 transition-all duration-700 shadow-2xl">
                      <div className="flex flex-col gap-8">
                         <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-3xl gradient-primary flex items-center justify-center shadow-2xl">
                               <TrendingUp className="w-10 h-10 text-black" />
                            </div>
                            <div>
                               <h5 className="font-black text-4xl leading-none">+400%</h5>
                               <span className="text-[10px] text-primary uppercase font-black tracking-widest mt-2 block">ROI Médio em Automação</span>
                            </div>
                         </div>
                         <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full w-[92%] gradient-primary shadow-[0_0_15px_rgba(20,184,166,0.6)]" />
                         </div>
                         <p className="text-xl text-foreground font-medium italic opacity-90 leading-relaxed">
                            "Eu não conseguia dar conta do volume de leads. A IA salvou o meu faturamento. É a melhor vendedora que já tive."
                         </p>
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full gradient-primary p-0.5">
                               <div className="w-full h-full rounded-full bg-background flex items-center justify-center font-black text-primary">R</div>
                            </div>
                            <div className="flex flex-col">
                               <span className="font-black text-lg">Rafael Akilys</span>
                               <span className="text-[10px] text-muted-foreground uppercase font-black leading-none mt-1">Produtor e Fundador</span>
                            </div>
                         </div>
                      </div>
                   </div>
               </div>
            </div>
         </div>
      </section>

      {/* Differentials Cards */}
      <section className="py-32">
        <div className="container-7xl">
           <div className="text-center mb-24">
              <h2 className="text-4xl md:text-7xl font-black mb-6 tracking-tightest">O que nos torna <span className="text-primary italic">ABSURDOS.</span></h2>
              <p className="text-muted-foreground max-w-2xl mx-auto opacity-70">Não somos um "bot" comum. Somos inteligência de vendas focada em conversão.</p>
           </div>
           
           <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                  { title: 'IA Humana', desc: 'Nossa inteligência entende tom de voz, gírias e quebra objeções como ninguém.', icon: Heart, color: 'primary' },
                  { title: 'Memória Total', desc: 'Ela nunca esquece. Sabe exatamente o que o lead falou na conversa anterior.', icon: Clock, color: 'blue' },
                  { title: 'Cloud Mastery', desc: 'Celular desligado? Sem bateria? Não importa. A vendedora continua online.', icon: Layers, color: 'purple' },
                  { title: 'Anti-Bloqueio', desc: 'Usamos tecnologia que simula comportamento humano para máxima segurança.', icon: Shield, color: 'green' }
              ].map((item, i) => (
                 <div key={i} className="glass-card p-12 rounded-[40px] group border-white/5 hover:border-primary/20 transition-all duration-500">
                    <div className={`w-14 h-14 rounded-2xl bg-${item.color}/10 flex items-center justify-center mb-8`}>
                       <item.icon className={`w-7 h-7 text-${item.color}`} />
                    </div>
                    <h4 className="text-2xl font-black mb-4">{item.title}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed opacity-70">{item.desc}</p>
                 </div>
              ))}
           </div>
        </div>
      </section>

      {/* Pricing - Irresistible Offer */}
      <section id="planos" className="py-40 relative">
        <div className="container-7xl text-center">
           <div className="max-w-3xl mx-auto mb-20 text-balance px-4">
              <h2 className="text-5xl md:text-8xl font-black tracking-tightest mb-8 leading-[0.9]">Aumente o lucro <br /> <span className="text-primary italic">praticamente de graça.</span></h2>
              <p className="text-muted-foreground text-xl opacity-80">Teste a potência total do nosso CRM sem nenhum risco.</p>
           </div>
           
           {/* Trail Box */}
           <div className="max-w-5xl mx-auto mb-16 relative group px-4">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-primary via-cyan-400 to-purple-600 rounded-[50px] blur-xl opacity-20 group-hover:opacity-40 transition duration-700" />
              <div className="relative glass p-8 md:p-16 rounded-[44px] flex flex-col lg:flex-row items-center justify-between gap-12 border-white/20">
                 <div className="text-left space-y-4">
                    <div className="inline-block bg-primary text-black text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg uppercase tracking-[0.2em] mb-4">Oferta de Experimentação</div>
                    <h3 className="text-4xl md:text-6xl font-black italic tracking-tighter">30 DIAS POR R$10</h3>
                    <p className="text-muted-foreground text-lg opacity-70">Acesse tudo: IA, CRM, Métricas e Dashboards. Verifique o resultado você mesmo.</p>
                    <div className="pt-4 flex items-center gap-6 opacity-40">
                       <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Lock className="w-4 h-4" /> Pagamento Seguro</div>
                       <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Shield className="w-4 h-4" /> Sem Multas</div>
                    </div>
                 </div>
                 <div className="flex flex-col items-center lg:items-end gap-6 w-full lg:w-auto">
                    <div className="flex flex-col items-center lg:items-end">
                       <span className="text-muted-foreground line-through text-xl opacity-40 mb-1">R$ 97,00</span>
                       <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black opacity-50">R$</span>
                          <span className="text-9xl font-black text-primary tracking-tighter leading-none">10</span>
                       </div>
                    </div>
                    <Link href="/register?plan=basico" className="w-full lg:w-auto gradient-primary text-black font-black px-16 py-7 rounded-3xl text-2xl hover:scale-110 active:scale-95 transition-all glow-primary shadow-[0_20px_40px_rgba(20,184,166,0.3)] text-center leading-none">
                       COMEÇAR AGORA
                    </Link>
                 </div>
              </div>
           </div>

           {/* More Plans */}
           <div className="grid lg:grid-cols-3 gap-8 items-stretch pt-24 px-4">
              <div className="glass-card p-12 rounded-[44px] flex flex-col border-white/5 opacity-50 hover:opacity-100 transition-all duration-500">
                 <h4 className="text-xl font-black mb-8">Intermediário</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black">R$ 97</span>
                      <span className="text-muted-foreground font-black text-xs uppercase opacity-60">/mês</span>
                    </div>
                 </div>
                 <ul className="space-y-4 mb-12 flex-1 text-left list-none">
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> 1 Canal WhatsApp</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> IA c/ Memória Contextual</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> CRM Kanban Completo</li>
                 </ul>
                 <Link href="/register?plan=basico" className="w-full border-2 border-white/10 text-white font-black py-5 rounded-2xl hover:bg-white/5 transition-all text-center">COMEÇAR TESTE</Link>
              </div>

              <div className="glass-card p-14 rounded-[50px] flex flex-col transform lg:-translate-y-12 relative border-primary shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-20">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 gradient-primary text-black text-[10px] font-black px-8 py-2.5 rounded-full uppercase tracking-[0.3em] shadow-2xl">MUITO RECOMENDADO</div>
                 <h4 className="text-3xl font-black mb-8">Professional</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-2">
                       <span className="text-sm font-black opacity-40">R$</span>
                       <span className="text-7xl font-black text-primary tracking-tighter leading-none">497</span>
                       <span className="text-sm font-black uppercase tracking-widest opacity-60 ml-1">/mês</span>
                    </div>
                 </div>
                 <ul className="space-y-6 mb-14 flex-1 text-left list-none">
                    <li className="flex items-center gap-4 text-lg font-black"><CheckCircle2 className="w-6 h-6 text-primary" /> 3 Canais WhatsApp</li>
                    <li className="flex items-center gap-4 text-lg font-black text-primary"><CheckCircle2 className="w-6 h-6 text-primary" /> IA Premium (GPT-4o)</li>
                    <li className="flex items-center gap-4 text-lg font-black"><CheckCircle2 className="w-6 h-6 text-primary" /> Multi-Campanhas</li>
                    <li className="flex items-center gap-4 text-lg font-black text-primary"><CheckCircle2 className="w-6 h-6 text-primary" /> Treinamento Prioritário</li>
                 </ul>
                 <Link href="/register?plan=pro" className="w-full gradient-primary text-black font-black py-6 rounded-3xl text-2xl hover:scale-105 transition-all glow-primary shadow-2xl text-center leading-none">QUERO ESCALAR AGORA</Link>
              </div>

              <div className="glass-card p-12 rounded-[44px] flex flex-col border-white/5 opacity-50 hover:opacity-100 transition-all duration-500">
                 <h4 className="text-xl font-black mb-8">Elite / Agência</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black">R$ 997</span>
                      <span className="text-muted-foreground font-black text-xs uppercase opacity-60">/mês</span>
                    </div>
                 </div>
                 <ul className="space-y-4 mb-12 flex-1 text-left list-none">
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> 10 Canais WhatsApp</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Mensagens Ilimitadas</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Gerente VIP Dedicado</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> API Open (Beta)</li>
                 </ul>
                 <Link href="/register?plan=agencia" className="w-full border-2 border-white/10 text-white font-black py-5 rounded-2xl hover:bg-white/5 transition-all text-center">FALAR COM TIME ELITE</Link>
              </div>
           </div>
        </div>
      </section>

      {/* Final Aggressive CTA */}
      <section className="py-40 relative group">
          <div className="absolute inset-0 gradient-primary opacity-[0.05] group-hover:opacity-[0.1] transition-opacity" />
          <div className="container-7xl text-center relative z-10 px-4">
              <h2 className="text-5xl md:text-8xl font-black tracking-tightest mb-16 leading-[0.9]">Chega de perder dinheiro. <br /> Deixe a <span className="text-primary italic">IA Vender</span> por você.</h2>
              <div className="flex flex-col items-center gap-10">
                  <Link href="/register?plan=basico" className="w-full sm:w-auto gradient-primary text-black font-black px-16 py-8 rounded-[40px] text-2xl md:text-3xl hover:scale-105 active:scale-95 transition-all glow-primary flex items-center justify-center gap-6 shadow-[0_40px_80px_rgba(20,184,166,0.3)]">
                      QUERO MEU VENDEDOR AGORA!
                      <ArrowRight className="w-12 h-12" />
                  </Link>
                  <p className="font-black text-xl opacity-60 italic tracking-tighter">Oferta Única: Comece hoje por R$10 e mude o rumo da sua empresa.</p>
              </div>
          </div>
      </section>

      {/* Minimalistic Footer */}
      <footer className="py-24 border-t border-white/5 bg-black/60 relative backdrop-blur-3xl overflow-hidden">
         <div className="container-7xl">
            <div className="grid md:grid-cols-4 gap-16 mb-24">
               <div className="md:col-span-2 space-y-8 text-left">
                  <div className="flex items-center gap-4">
                    <Image src="/logo.png" alt="Logo" width={48} height={48} className="w-12 h-12 rounded-xl" />
                    <span className="font-black text-3xl tracking-tightest">CodControl <span className="text-primary italic">AI</span></span>
                  </div>
                  <p className="text-muted-foreground max-w-sm leading-relaxed text-lg opacity-60">
                     A vanguarda da automação de vendas. Tecnologia feita para quem não aceita nada menos que o topo.
                  </p>
               </div>
               
               <div className="space-y-8 text-left">
                  <h5 className="font-black uppercase tracking-[0.3em] text-[10px] text-primary">Navegação</h5>
                  <ul className="space-y-4">
                     <li><a href="#solucao" className="text-sm font-bold text-muted-foreground hover:text-white transition-colors">Sistema</a></li>
                     <li><a href="#planos" className="text-sm font-bold text-muted-foreground hover:text-white transition-colors">Planos</a></li>
                     <li><a href="#recursos" className="text-sm font-bold text-muted-foreground hover:text-white transition-colors">Funcionalidades</a></li>
                  </ul>
               </div>

               <div className="space-y-8 text-left">
                  <h5 className="font-black uppercase tracking-[0.3em] text-[10px] text-primary">Companhia</h5>
                  <div className="flex flex-col gap-4">
                      <p className="text-xs text-muted-foreground font-bold">R G BARROS REPRESENTACAO</p>
                      <p className="text-xs text-muted-foreground/60 leading-relaxed uppercase tracking-widest">CNPJ: 60.047.949/0001-79</p>
                      <p className="text-[10px] text-muted-foreground/40 italic">&copy; {new Date().getFullYear()} CodControl AI. Todos os vendedos reservados.</p>
                  </div>
               </div>
            </div>
            
            <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 opacity-20 text-[9px] uppercase font-black tracking-[0.4em] grayscale">
                <span>Engenharia de Software de Alta Performance</span>
                <div className="flex gap-4">
                  <span>Inovação</span>
                  <span>Evolução</span>
                  <span>Escala</span>
                </div>
            </div>
         </div>
      </footer>
    </div>
  )
}
