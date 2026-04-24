'use client'
import { useState } from 'react'
import { 
    PlayCircle, 
    BookOpen, 
    Download, 
    CheckCircle2, 
    Clock, 
    ExternalLink,
    GraduationCap,
    FileText
} from 'lucide-react'

const courses = [
    {
        title: 'Dominando o CodControl',
        lessons: [
            {
                id: 'Hds8BGvwe8s',
                title: 'Aula 1 – Dashboard Performance | Apresentação do Sistema',
                duration: '05:20',
                description: 'Uma visão geral completa do dashboard e como monitorar a performance do seu sistema.'
            },
            {
                id: 'hxjOMTTxWEE',
                title: 'Aula 2 – Como Conectar WhatsApp no CRM Passo a Passo',
                duration: '04:15',
                description: 'Aprenda o passo a passo seguro para conectar sua instância do WhatsApp via QR Code.'
            },
            {
                id: 'ERQwE4KRW6U',
                title: 'Aula 3 – Configurar a IA + Conectar API do GPT',
                duration: '08:30',
                description: 'Automatize seu atendimento no WhatsApp configurando a IA e conectando a API do GPT.'
            },
            {
                id: 'R0CWtRnskGE',
                title: 'Aula 4 – Como Vender Vários Produtos com 1 WhatsApp',
                duration: '06:45',
                description: 'Estratégias para gerenciar e vender múltiplos produtos usando apenas uma instância de WhatsApp.'
            },
            {
                id: '3Jmf8yJ3E0Y',
                title: 'Aula 5 – CRM Organizado + Chat ao Vivo',
                duration: '07:20',
                description: 'Como atender seus clientes de forma organizada sem perder nenhuma oportunidade de venda.'
            },
            {
                id: 'vMosfzlZDZM',
                title: 'Aula 6 – Funis de Venda no CRM',
                duration: '09:15',
                description: 'Aprenda a criar e gerenciar funis de venda automáticos diretamente no seu CRM.'
            },
            {
                id: 'Z7V1tnwPwDk',
                title: 'Aula 7 – Como Treinar a IA do CRM (Base de Conhecimento)',
                duration: '11:40',
                description: 'Alimente sua IA com informações específicas para que ela atenda seus clientes com precisão.'
            },
            {
                id: 'lqA8FdfTPcs',
                title: 'Aula 8 – Encerramento do Treinamento',
                duration: '03:50',
                description: 'Considerações finais e os próximos passos para escalar seu negócio com o CodControl.'
            },
            {
                id: 'R8CRcUliIHU',
                title: 'Aula 9 — Como usar Gerador de Prompt de Elite',
                duration: '06:15',
                description: 'Aprenda a criar prompts impossíveis de serem ignorados usando nosso gerador inteligente.'
            },
            {
                id: '3sWWzFI4Zmg',
                title: 'Aula 10 — Como ativar para a IA falar por áudio',
                duration: '04:50',
                description: 'Configure a voz da sua atendente e humanize seu atendimento com mensagens de voz automáticas.'
            }
        ]
    },
    {
        title: 'Mini Curso: Primeira Venda',
        lessons: [
            {
                id: 'JdNC2E1ccdk',
                title: 'AULA 1 — Boas-vindas + Mapa do jogo',
                duration: '08:12',
                description: 'Boas-vindas ao mini-curso de primeira venda e visão geral do mapa do jogo para começar com o pé direito.'
            },
            {
                id: 'UvXc7UZClGw',
                title: 'AULA 2 — Escolhendo o produto certo',
                duration: '12:45',
                description: 'Aprenda a estratégia para escolher o produto ideal, com alta conversão e baixa barreira de entrada.'
            },
            {
                id: 'LuAK8bbDN0c',
                title: 'AULA 3 — Criativo que vende',
                duration: '15:20',
                description: 'Como criar anúncios impossíveis de serem ignorados usando IA, focados totalmente em conversão.'
            }
        ]
    }
]

export default function AcademyClient({ materials }: { materials: any[] }) {
    const [activeLesson, setActiveLesson] = useState(courses[0].lessons[0])

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                        <GraduationCap className="w-8 h-8 text-primary" />
                        Academy CodControl
                    </h1>
                    <p className="text-muted-foreground mt-1">Domine a automação e escale suas vendas hoje mesmo.</p>
                </div>
                <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2 rounded-xl border border-primary/20">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Acesso Vitalício Ativado</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Video Area */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="relative aspect-video rounded-3xl overflow-hidden border border-border shadow-2xl bg-black glow-primary/10">
                        <iframe
                            className="absolute inset-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${activeLesson.id}?autoplay=0&rel=0`}
                            title={activeLesson.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>

                    <div className="gradient-card border border-border rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold text-foreground">{activeLesson.title}</h2>
                            <div className="flex items-center gap-2 text-sm text-primary font-medium">
                                <Clock className="w-4 h-4" />
                                {activeLesson.duration}
                            </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                            {activeLesson.description}
                        </p>
                    </div>

                    {/* Materiais de Apoio */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            Materiais de Estudo
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {materials.length === 0 ? (
                                <div className="md:col-span-2 text-center py-8 border border-dashed border-border rounded-xl opacity-50">
                                    <span className="text-xs text-muted-foreground italic">Nenhum material cadastrado ainda.</span>
                                </div>
                            ) : (
                                materials.map((material, idx) => (
                                    <div 
                                        key={idx}
                                        className="flex items-center justify-between p-4 bg-secondary/20 border border-border rounded-xl hover:border-primary/50 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                {material.type === 'PDF' ? <FileText className="w-5 h-5 text-primary" /> : material.type === 'VIDEO' ? <PlayCircle className="w-5 h-5 text-primary" /> : <ExternalLink className="w-5 h-5 text-primary" />}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground leading-tight">{material.title}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">{material.type}</div>
                                            </div>
                                        </div>
                                        <a 
                                            href={material.link} 
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 rounded-lg bg-secondary hover:bg-primary hover:text-black transition-colors"
                                        >
                                            <Download className="w-4 h-4" />
                                        </a>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Playlist Sidebar */}
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-foreground flex items-center gap-2 px-2">
                        <PlayCircle className="w-5 h-5 text-primary" />
                        Conteúdo do Curso
                    </h3>
                    
                    <div className="space-y-8 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                        {courses.map((course) => (
                            <div key={course.title} className="space-y-3">
                                <div className="flex items-center gap-2 px-2">
                                    <div className="h-4 w-1 bg-primary rounded-full" />
                                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                                        {course.title}
                                    </h4>
                                </div>
                                <div className="space-y-2">
                                    {course.lessons.map((lesson, index) => {
                                        const isActive = activeLesson.id === lesson.id
                                        return (
                                            <button
                                                key={lesson.id}
                                                onClick={() => setActiveLesson(lesson)}
                                                className={`w-full flex text-left gap-4 p-4 rounded-xl transition-all border ${
                                                    isActive 
                                                    ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/20' 
                                                    : 'bg-secondary/10 border-transparent hover:bg-secondary/30 hover:border-border'
                                                }`}
                                            >
                                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-semibold truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>
                                                        {lesson.title}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                                                            <Clock className="w-3 h-3" />
                                                            {lesson.duration}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isActive && (
                                                    <div className="flex items-center">
                                                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                                    </div>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
