import { LegalLayout } from '@/components/LegalLayout'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso — CodControl AI CRM',
  description: 'Leia os termos de uso da plataforma CodControl AI CRM.',
}

export default function TermosDeUso() {
  return (
    <LegalLayout 
      title="Termos de Uso" 
      lastUpdated="11 de Maio de 2026"
    >
      <section>
        <p>
          Bem-vindo ao <strong>CodControl AI CRM</strong>. Ao acessar ou utilizar nossa plataforma, você concorda em cumprir e estar vinculado aos seguintes Termos de Uso.
        </p>

        <h2>1. SOBRE A PLATAFORMA</h2>
        <p>
          O <strong>CodControl AI CRM</strong> é uma plataforma SaaS desenvolvida para automação de vendas, atendimento inteligente, CRM, integração com WhatsApp, disparos automatizados, inteligência artificial aplicada a atendimento comercial e gestão de leads.
        </p>

        <h2>2. CADASTRO E RESPONSABILIDADE DO USUÁRIO</h2>
        <p>
          O usuário declara fornecer informações verdadeiras, possuir capacidade legal para contratar e ser responsável por seu login e senha. É de sua inteira responsabilidade manter a confidencialidade de suas credenciais de acesso.
        </p>

        <h2>3. TESTE GRATUITO</h2>
        <p>
          A plataforma poderá oferecer um período de teste gratuito de <strong>7 dias</strong>. Após este período, a continuidade do serviço dependerá da escolha e pagamento de um dos planos disponíveis.
        </p>

        <h2>4. PLANOS, COBRANÇA E PAGAMENTOS</h2>
        <p>Planos disponíveis:</p>
        <ul>
          <li>Mensal</li>
          <li>Anual</li>
        </ul>
        <p>
          O não pagamento das faturas nas datas de vencimento poderá gerar a <strong>suspensão, bloqueio ou cancelamento</strong> imediato do acesso à plataforma e seus serviços.
        </p>

        <h2>5. USO ADEQUADO</h2>
        <p>
          É terminantemente proibido o uso da plataforma para:
        </p>
        <ul>
          <li>Spam abusivo;</li>
          <li>Fraudes e golpes;</li>
          <li>Atividades ilegais;</li>
          <li>Violações das políticas da Meta (WhatsApp) e da LGPD.</li>
        </ul>
        <p>
          O descumprimento destas regras resultará no banimento imediato da conta sem direito a reembolso.
        </p>

        <h2>6. CANCELAMENTO</h2>
        <p>
          Você pode solicitar o cancelamento ou suporte através dos nossos canais oficiais:
        </p>
        <ul>
          <li><strong>E-mail:</strong> contato@codcontrolpro.bond</li>
          <li><strong>WhatsApp:</strong> +55 98 98442-6359</li>
        </ul>

        <h2>7. FORO</h2>
        <p>
          Fica eleito o foro da comarca de <strong>São Bernardo – MA</strong> para dirimir quaisquer questões oriundas destes Termos.
        </p>

        <div className="mt-12 pt-8 border-t border-white/5 space-y-2 opacity-50 text-xs">
          <p>R G Barros Representação</p>
          <p>CNPJ: 60.047.949/0001-79</p>
          <p>São Bernardo – MA</p>
        </div>
      </section>
    </LegalLayout>
  )
}
