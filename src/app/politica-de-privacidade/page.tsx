import { LegalLayout } from '@/components/LegalLayout'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — CodControl AI CRM',
  description: 'Conheça nossa política de privacidade e como tratamos seus dados.',
}

export default function PoliticaDePrivacidade() {
  return (
    <LegalLayout 
      title="Política de Privacidade" 
      lastUpdated="11 de Maio de 2026"
    >
      <section>
        <p>
          A sua privacidade é importante para nós. Esta Política de Privacidade descreve como o <strong>CodControl AI CRM</strong> coleta, usa, processa e compartilha suas informações.
        </p>

        <h2>1. DADOS COLETADOS</h2>
        <p>Para o funcionamento da plataforma e prestação dos nossos serviços, podemos coletar os seguintes dados:</p>
        <ul>
          <li><strong>Identificação:</strong> Nome completo e empresa.</li>
          <li><strong>Contato:</strong> E-mail e número de telefone/WhatsApp.</li>
          <li><strong>Pagamento:</strong> Informações de faturamento necessárias para processar transações.</li>
          <li><strong>Operacionais:</strong> Dados técnicos e históricos de integrações com a API do WhatsApp para execução das automações.</li>
        </ul>

        <h2>2. FINALIDADE</h2>
        <p>
          Os dados coletados são utilizados exclusivamente para:
        </p>
        <ul>
          <li>Prestação dos serviços contratados e execução de automações;</li>
          <li>Suporte técnico e atendimento ao cliente;</li>
          <li>Processamento de cobranças e faturamento;</li>
          <li>Garantia da segurança da plataforma e prevenção de fraudes;</li>
          <li>Cumprimento de obrigações legais e regulatórias.</li>
        </ul>

        <h2>3. COMPARTILHAMENTO</h2>
        <p>
          Seus dados poderão ser compartilhados com terceiros apenas quando estritamente necessário, incluindo:
        </p>
        <ul>
          <li><strong>Meta/WhatsApp:</strong> Para a viabilização das integrações de chat.</li>
          <li><strong>Gateways de Pagamento:</strong> Para o processamento seguro de assinaturas.</li>
          <li><strong>Parceiros Tecnológicos:</strong> Provedores de infraestrutura e serviços em nuvem essenciais para o sistema.</li>
        </ul>
        <p>
          <strong>Importante:</strong> Nunca vendemos seus dados pessoais para terceiros.
        </p>

        <h2>4. SEGURANÇA</h2>
        <p>
          Adotamos medidas técnicas e administrativas rigorosas para a proteção dos seus dados contra acessos indevidos, vazamentos, alterações ou destruição. Utilizamos criptografia e protocolos de segurança avançados.
        </p>

        <h2>5. DIREITOS DO TITULAR</h2>
        <p>
          Em conformidade com a <strong>LGPD</strong> (Lei Geral de Proteção de Dados), o usuário possui o direito de solicitar a qualquer momento:
        </p>
        <ul>
          <li>Acesso aos seus dados;</li>
          <li>Correção de dados incompletos ou inexatos;</li>
          <li>Exclusão de seus dados de nossa base;</li>
          <li>Informações sobre o compartilhamento de dados.</li>
        </ul>

        <h2>6. RETENÇÃO</h2>
        <p>
          Os dados serão mantidos pelo período estritamente necessário para a execução contratual, suporte ao cliente e cumprimento de exigências legais. Após esse período, os dados serão excluídos ou anonimizados.
        </p>

        <div className="mt-12 pt-8 border-t border-white/5 space-y-4">
          <div>
            <h4 className="font-bold text-foreground">Contato para Privacidade:</h4>
            <p className="text-sm"><strong>E-mail:</strong> contato@codcontrolpro.bond</p>
            <p className="text-sm"><strong>WhatsApp:</strong> +55 98 98442-6359</p>
          </div>
          
          <div className="opacity-50 text-xs space-y-1">
            <p>R G Barros Representação</p>
            <p>CNPJ: 60.047.949/0001-79</p>
            <p>São Bernardo – MA</p>
          </div>
        </div>
      </section>
    </LegalLayout>
  )
}
