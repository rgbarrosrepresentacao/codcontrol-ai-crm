'use client'

import { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { ArrowLeft, ScrollText } from 'lucide-react'
import Link from 'next/link'

interface LegalLayoutProps {
  children: ReactNode
  title: string
  lastUpdated: string
}

export function LegalLayout({ children, title, lastUpdated }: LegalLayoutProps) {
  return (
    <div className="min-h-screen gradient-hero relative flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container-7xl">
          {/* Breadcrumb / Back Link */}
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Voltar para o início
          </Link>

          <div className="max-w-4xl mx-auto">
            {/* Header Page */}
            <div className="mb-12 space-y-6">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md">
                <ScrollText className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Documento Oficial de Conformidade</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tightest leading-none">
                {title}
              </h1>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Última atualização: <span className="text-foreground font-bold">{lastUpdated}</span>
                </p>
                <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                <p className="text-sm text-muted-foreground">Válido para: <span className="text-foreground font-bold">CodControl AI</span></p>
              </div>
            </div>

            {/* Content Area */}
            <div className="glass-card rounded-[40px] p-8 md:p-12 border-white/5 relative overflow-hidden">
               {/* Ambient Glow Internal */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none" />
               
               <div className="relative max-w-none legal-prose"
               >
                 {children}
               </div>
            </div>

            {/* Support Box */}
            <div className="mt-12 p-8 rounded-3xl border border-white/5 bg-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <h4 className="font-bold text-lg">Ainda tem dúvidas sobre nossos termos?</h4>
                <p className="text-sm text-muted-foreground">Nossa equipe de suporte está pronta para te ajudar.</p>
              </div>
              <Link 
                href="https://wa.me/5598984426359" 
                target="_blank"
                className="gradient-primary text-black font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all glow-primary"
              >
                Falar com Suporte
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
