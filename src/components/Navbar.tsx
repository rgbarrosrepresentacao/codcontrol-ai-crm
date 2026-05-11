'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${scrolled ? 'py-4' : 'py-6'}`}>
      <div className="container-7xl">
        <div className="glass px-6 py-3 rounded-2xl flex items-center justify-between border-white/5 mx-4 md:mx-0">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="CodControl Logo" width={32} height={32} className="w-8 h-8 rounded-lg" />
            <div className="flex flex-col">
              <span className="font-black text-lg md:text-xl tracking-tighter leading-none">
                CodControl <span className="text-primary tracking-normal">AI</span>
              </span>
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest -mt-0.5">Sales CRM</span>
            </div>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#solucao" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Solução</Link>
            <Link href="/#recursos" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Recursos</Link>
            <Link href="/#faq" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">Dúvidas</Link>
            <div className="w-px h-6 bg-border/40 mx-2" />
            <Link href="/login" className="text-sm font-semibold text-foreground hover:text-primary transition-colors">Entrar</Link>
            <Link href="/register?plan=basico" className="gradient-primary text-black font-black px-6 py-2.5 rounded-xl text-sm hover:scale-105 active:scale-95 transition-all glow-primary leading-none">
              TESTAR 7 DIAS GRÁTIS
            </Link>
          </div>

          <div className="md:hidden">
              <Link href="/register?plan=basico" className="gradient-primary text-black font-black px-4 py-2 rounded-xl text-xs hover:scale-105 transition-all glow-primary leading-none">
                  TESTAR GRÁTIS
              </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
