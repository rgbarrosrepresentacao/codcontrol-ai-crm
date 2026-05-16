'use client'
import { useState } from 'react'
import { Plus, Trash2, Send, Layout, MessageSquare, Info, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function TabCriarTemplate({ onSuccess }: { onSuccess: () => void }) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState('MARKETING')
    const [header, setHeader] = useState('')
    const [bodyText, setBodyText] = useState('')
    const [footer, setFooter] = useState('')
    const [buttons, setButtons] = useState<string[]>([])
    const [samples, setSamples] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(false)

    // Extrair variáveis únicas do texto
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || []
    const variableNumbers = Array.from(new Set(
        matches.map(m => parseInt(m.replace('{{', '').replace('}}', '')))
    )).sort((a, b) => a - b)

    // Validação de Nome
    const isNameValid = /^[a-z0-9_]+$/.test(name) && name.length > 0

    // Validação de Variáveis (Sequencial sem pular)
    const variablesOk = variableNumbers.every((num, idx) => num === idx + 1)
    
    // Validação de Amostras (Todas as variáveis detectadas devem ter exemplo)
    const samplesOk = variableNumbers.length === 0 || 
                      variableNumbers.every(num => samples[num]?.trim().length > 0)

    const handleAddButton = () => {
        if (buttons.length < 3) setButtons([...buttons, ''])
    }

    const handleRemoveButton = (idx: number) => {
        setButtons(buttons.filter((_, i) => i !== idx))
    }

    const handleButtonChange = (idx: number, val: string) => {
        if (val.length > 25) return // Limite de caracteres para botões Meta
        const newButtons = [...buttons]
        newButtons[idx] = val
        setButtons(newButtons)
    }

    const handleSubmit = async () => {
        if (!isNameValid) return toast.error('Nome do template inválido')
        if (!bodyText.trim()) return toast.error('O corpo da mensagem é obrigatório')
        if (!variablesOk) return toast.error('A sequência das variáveis está incorreta (ex: {{1}}, {{2}})')
        if (!samplesOk) return toast.error('Preencha as amostras de todas as variáveis')
        
        setLoading(true)
        try {
            const res = await fetch('/api/meta/templates/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name, 
                    category, 
                    header, 
                    bodyText, 
                    footer, 
                    buttons,
                    samples: variableNumbers.map(num => samples[num])
                })
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(data.error || 'Erro ao criar template')
            } else {
                toast.success('Template enviado para aprovação da Meta!')
                onSuccess()
            }
        } catch (e) {
            toast.error('Erro de conexão ao criar template')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
            {/* Form */}
            <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <Layout className="w-5 h-5 text-purple-400" />
                        <h2 className="text-lg font-bold text-white">Configurações</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 ml-1">Nome do Template</label>
                            <input 
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, ''))}
                                placeholder="ex: recuperacao_pedido"
                                className={cn(
                                    "w-full px-4 py-2.5 bg-black/20 border rounded-xl text-sm text-white outline-none transition-all",
                                    name && !isNameValid ? "border-red-500/50" : "border-white/10 focus:border-purple-500/50"
                                )}
                            />
                            <p className="text-[10px] text-gray-500 ml-1">Apenas minúsculas, números e underscores.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 ml-1">Categoria</label>
                                <select 
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-[#0b141a] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
                                >
                                    <option value="MARKETING" className="bg-[#1f2c34] text-white">Marketing</option>
                                    <option value="UTILITY" className="bg-[#1f2c34] text-white">Utilidade</option>
                                    <option value="AUTHENTICATION" className="bg-[#1f2c34] text-white">Autenticação</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 ml-1">Idioma</label>
                                <div className="w-full px-4 py-2.5 bg-black/20 border border-white/5 rounded-xl text-sm text-gray-500 cursor-not-allowed">
                                    Português (BR)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <MessageSquare className="w-5 h-5 text-purple-400" />
                        <h2 className="text-lg font-bold text-white">Conteúdo</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 ml-1">Cabeçalho (Header)</label>
                            <input 
                                type="text"
                                value={header}
                                onChange={e => setHeader(e.target.value)}
                                placeholder="Texto de destaque..."
                                className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-purple-500/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-medium text-gray-400">Corpo (Body) *</label>
                                {!variablesOk && <span className="text-[10px] text-red-400 font-bold uppercase">Erro na sequência {'{{1}}'}</span>}
                            </div>
                            <textarea 
                                value={bodyText}
                                onChange={e => setBodyText(e.target.value)}
                                placeholder="Use {{1}}, {{2}} para variáveis dinâmicas..."
                                rows={5}
                                className={cn(
                                    "w-full px-4 py-3 bg-black/20 border rounded-xl text-sm text-white outline-none transition-all resize-none",
                                    !variablesOk ? "border-red-500/30" : "border-white/10 focus:border-purple-500/50"
                                )}
                            />
                        </div>

                        {/* Amostras de Variáveis (SAMPLES) */}
                        {variableNumbers.length > 0 && (
                            <div className="space-y-3 p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle className="w-4 h-4 text-purple-400" />
                                    <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Amostras Requeridas pela Meta</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    {variableNumbers.map(num => (
                                        <div key={num} className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-medium text-gray-500 ml-1">Variável {'{{'}{num}{'}}'}</label>
                                            <input 
                                                type="text"
                                                value={samples[num] || ''}
                                                onChange={e => setSamples({...samples, [num]: e.target.value})}
                                                placeholder={`Ex: ${num === 1 ? 'Rafael' : num === 2 ? 'Resina Extreme' : 'Amostra...'}`}
                                                className="w-full px-4 py-2 bg-black/30 border border-white/5 rounded-xl text-xs text-white outline-none focus:border-purple-500/40"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 ml-1">Rodapé (Footer)</label>
                            <input 
                                type="text"
                                value={footer}
                                onChange={e => setFooter(e.target.value)}
                                placeholder="Texto secundário ou aviso legal..."
                                className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-purple-500/50"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-xs font-medium text-gray-400">Botões (Quick Reply)</label>
                                <button 
                                    onClick={handleAddButton}
                                    disabled={buttons.length >= 3}
                                    className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-20 transition-all"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {buttons.map((btn, idx) => (
                                    <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                                        <input 
                                            type="text"
                                            value={btn}
                                            onChange={e => handleButtonChange(idx, e.target.value)}
                                            placeholder={`Texto do botão ${idx + 1}...`}
                                            className="flex-1 px-4 py-2 bg-black/20 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-purple-500/50"
                                        />
                                        <button 
                                            onClick={() => handleRemoveButton(idx)}
                                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !isNameValid || !bodyText.trim() || !variablesOk || !samplesOk}
                        className="w-full py-4 bg-purple-500 hover:bg-purple-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2 group"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />}
                        Submeter para Aprovação
                    </button>
                </div>
            </div>

            {/* Preview Section */}
            <div className="space-y-6">
                <div className="sticky top-6">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6 h-fit">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Info className="w-5 h-5 text-purple-400" />
                                <h2 className="text-lg font-bold text-white">Preview WhatsApp</h2>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase">
                                Visualização
                            </div>
                        </div>

                        {/* WhatsApp Phone Mockup */}
                        <div className="relative mx-auto w-full max-w-[320px] aspect-[9/18.5] bg-[#0b141a] rounded-[3rem] border-[8px] border-[#1f2c34] shadow-2xl overflow-hidden flex flex-col">
                            {/* Top Bar */}
                            <div className="bg-[#1f2c34] p-4 pt-10 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white">API Oficial</p>
                                    <p className="text-[10px] text-gray-400">Online</p>
                                </div>
                            </div>

                            {/* Chat Area */}
                            <div className="flex-1 p-3 bg-[#0b141a] overflow-y-auto space-y-4">
                                {/* Message Bubble */}
                                <div className="max-w-[85%] bg-[#1f2c34] rounded-2xl rounded-tl-none p-2.5 shadow-sm space-y-1 group">
                                    {header && (
                                        <p className="text-sm font-bold text-gray-200 border-b border-white/5 pb-1 mb-1">
                                            {header}
                                        </p>
                                    )}
                                    
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                                        {bodyText ? (
                                            bodyText.split(/(\{\{\d+\}\})/).map((part, i) => 
                                                part.match(/\{\{\d+\}\}/) ? (
                                                    <span key={i} className="bg-purple-500/30 text-purple-300 px-1 rounded font-mono font-bold">
                                                        {part}
                                                    </span>
                                                ) : part
                                            )
                                        ) : (
                                            <span className="italic text-gray-600">Conteúdo da mensagem aparecerá aqui...</span>
                                        )}
                                    </p>

                                    {footer && (
                                        <p className="text-[10px] text-gray-500 pt-1">
                                            {footer}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                        <span className="text-[9px] text-gray-500">12:00</span>
                                        <CheckCircle2 className="w-2.5 h-2.5 text-gray-500" />
                                    </div>
                                </div>

                                {/* Buttons Preview */}
                                <div className="space-y-1.5 pt-1">
                                    {buttons.map((btn, i) => btn && (
                                        <div key={i} className="w-full py-2 bg-[#1f2c34] border border-white/5 rounded-xl flex items-center justify-center gap-2 shadow-sm">
                                            <Send className="w-3 h-3 text-purple-400" />
                                            <span className="text-[11px] font-bold text-purple-400">{btn}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-2xl">
                            <div className="flex gap-3">
                                <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-purple-300">Regras da Meta</p>
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        Após submeter, a Meta analisará seu conteúdo. Evite termos ofensivos ou spam. A aprovação geralmente ocorre em minutos.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Loader2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}
