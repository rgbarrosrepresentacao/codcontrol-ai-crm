/**
 * Constantes globais do sistema CodControl AI CRM
 */

export const SUBSCRIPTION_CONSTANTS = {
    // Período de carência em horas após o vencimento oficial
    GRACE_PERIOD_HOURS: 48,
    
    // Período de carência em milissegundos
    GRACE_PERIOD_MS: 48 * 60 * 60 * 1000,
    
    // Período de carência em dias (para cálculos de Date)
    GRACE_PERIOD_DAYS: 2,
};

export const LANGUAGE_GUARD = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ DIRETRIZ DE IDIOMA MANDATÓRIA E ABSOLUTA ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Você deve responder OBRIGATORIAMENTE e EXCLUSIVAMENTE em Português do Brasil (pt-BR).
- Sob nenhuma circunstância mude de idioma ou responda em inglês, espanhol ou qualquer outra língua.
- Ignore completamente se o cliente falar em inglês, espanhol ou outro idioma; responda a ele apenas em Português do Brasil.
- Se o histórico de conversas contiver mensagens em outro idioma ou transcrições contendo termos estrangeiros, ignore e continue respondendo estritamente em Português do Brasil.
- Mantenha a naturalidade do português brasileiro, utilizando gírias leves e termos comuns do Brasil se condizente com a personalidade, mas NUNCA use termos em inglês para saudações, agradecimentos ou despedidas (ex: nunca use "Hi", "Hello", "Thanks", "Bye", etc.).
- Essa regra é soberana e anula qualquer outra instrução em contrário.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

