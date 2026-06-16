'use client'

import Link from 'next/link'
import Image from 'next/image'
import { 
  Bot, Zap, Shield, BarChart3, MessageSquare, Users, ArrowRight, 
  CheckCircle2, Star, Clock, Heart, Sparkles, TrendingUp, 
  DollarSign, HelpCircle, ChevronDown, Rocket, Smartphone, 
  Target, Lock, Layers, PlayCircle, Plus, Minus
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'

export default function HomePage() {

  return (
    <div className="min-h-screen gradient-copa-hero relative">{/* Tema Copa temporário */}
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 pointer-events-none opacity-20 animate-pulse-glow z-[-1] bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      {/* Navbar */}
      <Navbar />

      {/* ═══════════════════════════════════════════════
           HERO SECTION — NÍVEL STRIPE / LINEAR
      ═══════════════════════════════════════════════ */}
      <section className="pt-40 md:pt-56 pb-24 relative overflow-hidden">
        <div className="container-7xl">
          <div className="grid lg:grid-cols-2 gap-20 items-center">

            {/* ── ESQUERDA: COPY ── */}
            <div className="space-y-9 animate-slide-up relative z-10">

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2.5 border border-white/8 rounded-full px-4 py-1.5 bg-white/[0.03]">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">Sistema de vendas por WhatsApp</span>
                </div>
                {/* Tema Copa temporário */}
                <span className="copa-badge">⚽ Clima de Copa</span>
              </div>

              {/* Headline Desktop */}
              <h1 className="hidden md:block text-[58px] lg:text-[68px] font-black text-foreground leading-[1.0] tracking-[-0.03em]">
                Seu WhatsApp virando uma máquina de vendas —{' '}
                <span className="text-primary">automaticamente.</span>
              </h1>

              {/* Headline Mobile */}
              <h1 className="md:hidden text-[40px] font-black text-foreground leading-[1.05] tracking-[-0.03em]">
                Seu WhatsApp vendendo{' '}
                <span className="text-primary">no automático.</span>
              </h1>

              {/* Subhead Desktop */}
              <p className="hidden md:block text-[18px] text-muted-foreground leading-[1.7] max-w-[480px] font-normal">
                IA que responde, um CRM que organiza e automações que fecham vendas 24h por você.
              </p>

              {/* Subhead Mobile */}
              <p className="md:hidden text-[16px] text-muted-foreground leading-[1.7] font-normal">
                IA + CRM + automação trabalhando por você 24h.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  href="/register?plan=basico"
                  className="w-full sm:w-auto gradient-copa text-black font-bold text-[15px] px-7 py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 copa-glow"
                >{/* Tema Copa temporário */}
                  Testar 7 dias grátis
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#demo"
                  className="w-full sm:w-auto text-[15px] font-medium text-muted-foreground px-7 py-4 rounded-xl hover:text-foreground hover:bg-white/5 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  Ver como funciona
                </a>
              </div>

              {/* Micro trust */}
              <div className="flex flex-wrap gap-5 pt-1">
                {[
                  'Sem cartão de crédito',
                  'Comece em 2 minutos',
                  'Funciona no seu WhatsApp atual',
                ].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
                    {t}
                  </span>
                ))}
              </div>

              {/* Social proof badges */}
              <div className="flex flex-wrap gap-4 pt-3 border-t border-white/5">
                {[
                  { value: '+2.400', label: 'usuários' },
                  { value: '+400%', label: 'ROI médio' },
                  { value: '1s', label: 'de resposta' },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-4 py-1.5">
                    <span className="text-[14px] font-black text-primary">{m.value}</span>
                    <span className="text-[11px] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── DIREITA: PRODUCT PREVIEW ── */}
            <div className="relative hidden lg:block">
              {/* Ambient glow — sutil */}
              <div className="absolute inset-0 bg-primary/10 blur-[120px] rounded-full opacity-40 animate-pulse-glow pointer-events-none" />

              <div className="relative animate-float">

                {/* ─ Card Principal: CRM Kanban ─ */}
                <div style={{background:'hsl(222 47% 5% / 0.9)', backdropFilter:'blur(24px)', border:'1px solid hsl(217 33% 14% / 0.6)'}} className="rounded-[24px] p-5 shadow-[0_32px_64px_rgba(0,0,0,0.6)]">

                  {/* Barra de título app */}
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/[0.05]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                      </div>
                      <span className="text-[11px] text-muted-foreground/50 font-medium ml-2">CodControl AI — Funil de Vendas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/70 font-semibold">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Sistema ativo
                    </div>
                  </div>

                  {/* Kanban Columns */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Novo Lead', count: '12', color: '#60a5fa', cards: ['Camila S.', 'João M.'] },
                      { label: 'Em contato', count: '8', color: '#a78bfa', cards: ['Ana P.', 'Lucas T.'] },
                      { label: 'Proposta', count: '5', color: 'hsl(168 84% 49%)', cards: ['Maria C.'] },
                      { label: 'Fechado', count: '24', color: '#34d399', cards: ['Pedro A.', 'Roberta K.'] },
                    ].map((col) => (
                      <div key={col.label} className="space-y-2">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: col.color + 'cc'}}>{col.label}</span>
                          <span className="text-[9px] font-black" style={{color: col.color}}>{col.count}</span>
                        </div>
                        {col.cards.map((name) => (
                          <div key={name} style={{background:'hsl(222 47% 8% / 0.8)', border:'1px solid hsl(217 33% 16% / 0.5)'}} className="rounded-xl p-2.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black" style={{background: col.color + '22', color: col.color}}>
                                {name[0]}
                              </div>
                              <span className="text-[10px] font-semibold text-foreground/80">{name}</span>
                            </div>
                            <div className="w-full h-[3px] rounded-full bg-white/5">
                              <div className="h-full rounded-full" style={{width: col.label === 'Fechado' ? '100%' : col.label === 'Proposta' ? '70%' : '40%', background: col.color, opacity: 0.7}} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ─ Card Flutuante: Chat IA ─ */}
                <div
                  style={{background:'hsl(222 47% 4% / 0.95)', backdropFilter:'blur(20px)', border:'1px solid hsl(217 33% 14% / 0.7)'}}
                  className="absolute -bottom-14 -left-14 w-72 rounded-[20px] p-4 shadow-[0_24px_48px_rgba(0,0,0,0.7)] animation-delay-300 animate-slide-up"
                >
                  {/* Header chat */}
                  <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-white/[0.05]">
                    <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center">
                      <Bot className="w-4 h-4 text-black" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Camila · IA</p>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                        <span className="text-[9px] text-primary">respondendo agora</span>
                      </div>
                    </div>
                  </div>
                  {/* Mensagens */}
                  <div className="space-y-2">
                    <div style={{background:'hsl(217 33% 12% / 0.8)'}} className="rounded-2xl rounded-tl-[4px] px-3 py-2 text-[10px] text-muted-foreground max-w-[88%]">
                      Olá! Tenho interesse no Liso Mágico. Como funciona?
                    </div>
                    <div className="gradient-primary rounded-2xl rounded-tr-[4px] px-3 py-2 text-[10px] text-black font-semibold ml-auto max-w-[88%]">
                      Oi! É 100% digital, você recebe no e-mail assim que o PIX for confirmado. Posso gerar seu link agora? 🚀
                    </div>
                    <div style={{background:'hsl(217 33% 12% / 0.8)'}} className="rounded-2xl rounded-tl-[4px] px-3 py-2 text-[10px] text-muted-foreground max-w-[70%] flex items-center gap-1.5">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse animation-delay-300">●</span>
                      <span className="animate-pulse animation-delay-500">●</span>
                    </div>
                  </div>
                </div>

                {/* ─ Notificação Flutuante: Pagamento ─ */}
                <div
                  style={{background:'hsl(222 47% 5% / 0.96)', backdropFilter:'blur(16px)', border:'1px solid hsl(168 84% 49% / 0.18)'}}
                  className="absolute -top-8 -right-10 rounded-2xl px-4 py-3 shadow-[0_8px_32px_rgba(20,184,166,0.15)] flex items-center gap-3 animate-slide-up animation-delay-500"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:'hsl(168 84% 49% / 0.12)'}}>
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Pagamento aprovado</p>
                    <p className="text-[13px] font-black text-foreground">R$ 1.250,00</p>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse ml-1" />
                </div>

              </div>
            </div>

            {/* ── MOBILE: visual simplificado ── */}
            <div className="lg:hidden mt-8">
              <div style={{background:'hsl(222 47% 5% / 0.9)', backdropFilter:'blur(24px)', border:'1px solid hsl(217 33% 14% / 0.6)'}} className="rounded-[20px] p-4 shadow-xl">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-black" />
                    </div>
                    <span className="text-[11px] font-bold">Camila · IA Vendedora</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[9px] text-primary font-semibold">Online</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div style={{background:'hsl(217 33% 12% / 0.8)'}} className="rounded-2xl rounded-tl-[4px] px-3 py-2.5 text-[11px] text-muted-foreground max-w-[85%]">
                    Olá! Tenho interesse no seu produto. Como compro?
                  </div>
                  <div className="gradient-primary rounded-2xl rounded-tr-[4px] px-3 py-2.5 text-[11px] text-black font-semibold ml-auto max-w-[85%]">
                    Oi! Tudo pronto aqui. Vou te enviar o link de pagamento agora! 🚀
                  </div>
                </div>
                <div style={{background:'hsl(168 84% 49% / 0.08)', border:'1px solid hsl(168 84% 49% / 0.15)'}} className="mt-4 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Pagamento confirmado</p>
                    <p className="text-[14px] font-black text-primary">R$ 1.250,00</p>
                  </div>
                  <div className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">PIX ✓</div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Visual Elements Background */}
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[150px] animate-pulse-glow z-[-1]" />
        <div className="absolute bottom-0 left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[150px] animate-pulse-glow z-[-1]" />
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
                    <h3 className="text-4xl md:text-6xl font-black italic tracking-tighter">7 DIAS GRÁTIS</h3>
                    <p className="text-muted-foreground text-lg opacity-70">Acesse tudo: IA, CRM, Métricas e Dashboards. Verifique o resultado você mesmo.</p>
                    <div className="pt-4 flex items-center gap-6 opacity-40">
                       <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Lock className="w-4 h-4" /> Pagamento Seguro</div>
                       <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Shield className="w-4 h-4" /> Sem Multas</div>
                    </div>
                 </div>
                 <div className="flex flex-col items-center lg:items-end gap-6 w-full lg:w-auto">
                    <div className="flex flex-col items-center lg:items-end">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black opacity-50">R$</span>
                          <span className="text-9xl font-black text-primary tracking-tighter leading-none">0</span>
                       </div>
                    </div>
                    <Link href="/register?plan=basico" className="w-full lg:w-auto gradient-primary text-black font-black px-16 py-7 rounded-3xl text-2xl hover:scale-110 active:scale-95 transition-all glow-primary shadow-[0_20px_40px_rgba(20,184,166,0.3)] text-center leading-none">
                       TESTAR GRÁTIS AGORA
                    </Link>
                 </div>
              </div>
           </div>

           {/* More Plans */}
           <div className="grid lg:grid-cols-3 gap-8 items-stretch pt-24 px-4">
              <div className="glass-card p-12 rounded-[44px] flex flex-col border-white/5 hover:border-primary/20 transition-all duration-500">
                 <h4 className="text-xl font-black mb-8">Básico</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black">R$ 59</span>
                      <span className="text-muted-foreground font-black text-xs uppercase opacity-60">/mês</span>
                    </div>
                 </div>
                 <ul className="space-y-4 mb-12 flex-1 text-left list-none">
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> 1 Canal WhatsApp</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-primary"><CheckCircle2 className="w-4 h-4 text-primary" /> IA Premium (GPT-4o)</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> IA c/ Memória Contextual</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Multi-Campanhas</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> CRM Kanban Completo</li>
                 </ul>
                 <Link href="https://pay.kiwify.com.br/i7DjjOL" className="w-full border-2 border-white/10 text-white font-black py-5 rounded-2xl hover:bg-white/5 transition-all text-center">COMEÇAR TESTE</Link>
              </div>

              <div className="glass-card p-14 rounded-[50px] flex flex-col transform lg:-translate-y-12 relative border-primary shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-20">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 gradient-primary text-black text-[10px] font-black px-8 py-2.5 rounded-full uppercase tracking-[0.3em] shadow-2xl">MUITO RECOMENDADO</div>
                 <h4 className="text-3xl font-black mb-8">Pro</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-2">
                       <span className="text-sm font-black opacity-40">R$</span>
                       <span className="text-7xl font-black text-primary tracking-tighter leading-none">120</span>
                       <span className="text-sm font-black uppercase tracking-widest opacity-60 ml-1">/mês</span>
                    </div>
                 </div>
                 <ul className="space-y-6 mb-14 flex-1 text-left list-none">
                    <li className="flex items-center gap-4 text-lg font-black"><CheckCircle2 className="w-6 h-6 text-primary" /> 3 Canais WhatsApp</li>
                    <li className="flex items-center gap-4 text-lg font-black text-primary"><CheckCircle2 className="w-6 h-6 text-primary" /> IA Premium (GPT-4o)</li>
                    <li className="flex items-center gap-4 text-lg font-black"><CheckCircle2 className="w-6 h-6 text-primary" /> Multi-Campanhas</li>
                    <li className="flex items-center gap-4 text-lg font-black text-primary"><CheckCircle2 className="w-6 h-6 text-primary" /> Treinamento Prioritário</li>
                 </ul>
                 <Link href="https://pay.kiwify.com.br/unGMIpe" className="w-full gradient-primary text-black font-black py-6 rounded-3xl text-2xl hover:scale-105 transition-all glow-primary shadow-2xl text-center leading-none">QUERO ESCALAR AGORA</Link>
              </div>

              <div className="glass-card p-12 rounded-[44px] flex flex-col border-white/5 hover:border-primary/20 transition-all duration-500">
                 <h4 className="text-xl font-black mb-8">Elite / Agência</h4>
                 <div className="mb-12">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black">R$ 1.000</span>
                      <span className="text-muted-foreground font-black text-xs uppercase opacity-60">/ano</span>
                    </div>
                 </div>
                 <ul className="space-y-4 mb-12 flex-1 text-left list-none">
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> 10 Canais WhatsApp</li>
                    <li className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Acesso Multi-Usuário</li>
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
                  <p className="font-black text-xl opacity-60 italic tracking-tighter">Oferta Única: Comece seu teste de 7 dias grátis e mude o rumo da sua empresa.</p>
              </div>
          </div>
      </section>

      {/* Footer Premium */}
      <Footer />

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/5598984426359"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-[#25D366] rounded-full shadow-lg hover:scale-110 transition-transform hover:shadow-xl"
        aria-label="Fale conosco no WhatsApp"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
        </svg>
      </a>
    </div>
  )
}
