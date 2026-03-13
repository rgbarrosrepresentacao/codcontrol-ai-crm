import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'CodControl AI CRM — Automação de WhatsApp com IA',
  description: 'Plataforma SaaS para automação de WhatsApp com Inteligência Artificial. Conecte seu WhatsApp, configure sua IA e automatize o atendimento.',
  keywords: 'WhatsApp, IA, CRM, automação, chatbot, n8n, Evolution API',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Google Tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-17985947430"
          strategy="afterInteractive"
        />
        <Script id="google-ads-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17985947430');
          `}
        </Script>

        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
