/* Tema Copa temporário — REMOVER APÓS COPA */
'use client'

import { useState, useEffect } from 'react'
import { X, Star, Trophy } from 'lucide-react'

const STORAGE_KEY = 'copa_banner_dismissed'

export function CopaBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // silently ignore storage errors
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="copa-banner relative flex items-center justify-center gap-3 px-4 py-2 text-white text-xs font-semibold"
      role="banner"
      aria-label="Banner Clima de Copa"
    >
      {/* Estrelas decorativas */}
      <span className="copa-star hidden sm:inline-block text-[13px]" aria-hidden="true">⭐</span>
      <Trophy className="w-3.5 h-3.5 shrink-0 text-yellow-300" aria-hidden="true" />

      <span className="tracking-wide">
        🇧🇷 <span className="font-black">CodControl</span> em clima de Copa — vamos junto até o final! ⚽
      </span>

      <Star className="w-3.5 h-3.5 shrink-0 text-yellow-300" aria-hidden="true" />
      <span className="copa-star hidden sm:inline-block text-[13px]" aria-hidden="true">⭐</span>

      {/* Botão fechar */}
      <button
        onClick={handleClose}
        aria-label="Fechar banner Copa"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors rounded-full p-0.5 hover:bg-white/10"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
