'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Bot, Smartphone, Heart, Clock, Layers, Shield, CheckCircle2, DollarSign, TrendingUp, ArrowRight } from 'lucide-react'

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] overflow-hidden" style={{background: 'hsl(222 47% 2%)'}}>

      {/* Glow sutil no topo do footer */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[30%] h-[1px] blur-sm bg-primary/30" />

      {/* Mini CTA Banner */}
      <div style={{borderBottom: '1px solid hsl(217 33% 10%)'}} className="py-8">
        <div className="container-7xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">7 dias grátis.</span> Sem cartão. Cancele quando quiser.
            </p>
          </div>
          <Link
            href="/register?plan=basico"
            className="gradient-primary text-black text-[13px] font-bold px-6 py-2.5 rounded-lg hover:opacity-90 transition-all whitespace-nowrap shadow-[0_0_20px_rgba(20,184,166,0.2)]"
          >
            Começar agora →
          </Link>
        </div>
      </div>

      {/* Main Footer Grid */}
      <div className="container-7xl py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-10 md:gap-8">

          {/* Brand */}
          <div className="col-span-2 md:col-span-4 space-y-5">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="CodControl AI" width={36} height={36} className="w-9 h-9 rounded-xl" />
              <span className="font-black text-xl tracking-tight">
                CodControl <span className="text-primary">AI</span>
              </span>
            </Link>
            <p className="text-[13px] text-muted-foreground leading-[1.7] max-w-[260px] opacity-70">
              O sistema completo que transforma WhatsApp em canal de vendas automático para negócios brasileiros.
            </p>
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 border border-white/[0.07] rounded-full px-3 py-1.5 bg-white/[0.02]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-muted-foreground font-medium">Todos sistemas operacionais</span>
            </div>
          </div>

          {/* Produto */}
          <div className="col-span-1 md:col-span-2 space-y-4">
            <h6 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Produto</h6>
            <ul className="space-y-3">
              {[
                { label: 'Funcionalidades', href: '/#solucao' },
                { label: 'Planos e Preços', href: '/#planos' },
                { label: 'Demo ao vivo', href: '/#demo' },
                { label: 'Casos de uso', href: '/#recursos' },
              ].map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 font-medium">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte */}
          <div className="col-span-1 md:col-span-2 space-y-4">
            <h6 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Suporte</h6>
            <ul className="space-y-3">
              {[
                { label: 'Central de Ajuda', href: '#' },
                { label: 'Fale no WhatsApp', href: 'https://wa.me/5598984426359' },
                { label: 'Política de Privacidade', href: '/politica-de-privacidade' },
                { label: 'Termos de Uso', href: '/termos-de-uso' },
              ].map((l) => (
                <li key={l.label}>
                  {l.href.startsWith('/') && !l.href.startsWith('/#') ? (
                    <a 
                      href={l.href} 
                      className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 font-medium cursor-pointer"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link 
                      href={l.href} 
                      target={l.href.startsWith('http') ? '_blank' : undefined} 
                      rel={l.href.startsWith('http') ? "noopener noreferrer" : undefined}
                      className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 font-medium"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Empresa */}
          <div className="col-span-2 md:col-span-4 space-y-4">
            <h6 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Empresa</h6>
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-foreground/70">R G Barros Representação</p>
              <p className="text-[11px] text-muted-foreground/40 font-mono tracking-wide">CNPJ: 60.047.949/0001-79</p>
            </div>
            {/* Selos de confiança */}
            <div className="flex flex-wrap gap-2 pt-2">
              {[
                '🔒 Dados Protegidos',
                '🇧🇷 100% Brasileiro',
                '⚡ IA Avançada',
              ].map((badge) => (
                <span key={badge} className="text-[10px] font-semibold text-muted-foreground/50 border border-white/[0.06] rounded-full px-3 py-1 bg-white/[0.02]">
                  {badge}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div style={{borderTop: '1px solid hsl(217 33% 9%)'}}>
        <div className="container-7xl py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground/30 font-medium" suppressHydrationWarning>
            © {new Date().getFullYear()} CodControl AI. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-[10px] text-muted-foreground/20 uppercase tracking-[0.2em] font-black">Inovação · Escala · Resultado</span>
          </div>
        </div>
      </div>

    </footer>
  )
}
