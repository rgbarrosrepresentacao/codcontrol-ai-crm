'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Upload, Loader2, CheckCircle2, Image as ImageIcon, Video, Mic, FileText } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BlastCampaign {
    id: string
    name: string
    description: string | null
    status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
    total_contacts: number
    sent_count: number
    failed_count: number
    delay_min: number
    delay_max: number
    warming_enabled: boolean
    message_variants: { text: string }[]
    instance_ids: string[]
    created_at: string
    started_at: string | null
    completed_at: string | null
}

interface WhatsAppInstance {
    id: string
    instance_name: string
    status: string
    phone_number?: string
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    draft: { label: 'Rascunho', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: '📝' },
    running: { label: 'Enviando', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: '🚀' },
    paused: { label: 'Pausado', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏸️' },
    completed: { label: 'Concluído', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: '✅' },
    cancelled: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '🚫' },
}

function parseCSV(text: string): { phone: string; name: string; variables: Record<string, string> }[] {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = cols[i] || '' })
        return {
            phone: obj['telefone'] || obj['phone'] || obj['numero'] || obj['número'] || cols[0] || '',
            name: obj['nome'] || obj['name'] || '',
            variables: obj,
        }
    }).filter(c => c.phone)
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function MetricCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 120,
        }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 26, fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        </div>
    )
}

function ProgressBar({ value, max, color = '#22c55e' }: { value: number; max: number; color?: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
    return (
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 6, overflow: 'hidden', width: '100%' }}>
            <div style={{
                width: `${pct}%`,
                height: '100%',
                background: color,
                borderRadius: 99,
                transition: 'width 0.5s ease',
            }} />
        </div>
    )
}

// ─── Painel de Status da Campanha Ativa ───────────────────────────────────────

function CampaignStatusPanel({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
    const [data, setData] = useState<any>(null)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    const fetchStatus = useCallback(async () => {
        const res = await fetch(`/api/blast/status?campaign_id=${campaignId}`)
        if (res.ok) setData(await res.json())
    }, [campaignId])

    useEffect(() => {
        fetchStatus()
        intervalRef.current = setInterval(fetchStatus, 8000)
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [fetchStatus])

    if (!data) return (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Carregando...</div>
    )

    const { campaign: c, pending_count, fail_rate, recent_queue } = data
    const statusCfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG]

    return (
        <div style={{
            background: 'rgba(10,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 18, color: '#fff' }}>{c.name}</h3>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        marginTop: 6, padding: '3px 10px', borderRadius: 99,
                        background: statusCfg.bg, color: statusCfg.color, fontSize: 13,
                    }}>
                        {statusCfg.icon} {statusCfg.label}
                    </span>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            {/* Progresso */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    <span>Progresso</span>
                    <span>{c.sent_count} / {c.total_contacts}</span>
                </div>
                <ProgressBar value={c.sent_count} max={c.total_contacts} />
            </div>

            {/* Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                <MetricCard label="Enviados" value={c.sent_count} color="#22c55e" icon="✅" />
                <MetricCard label="Pendentes" value={pending_count} color="#f59e0b" icon="⏳" />
                <MetricCard label="Falhas" value={c.failed_count} color="#ef4444" icon="❌" />
                <MetricCard label="Taxa de Falha" value={`${(fail_rate * 100).toFixed(1)}%`} color={fail_rate > 0.1 ? '#ef4444' : '#22c55e'} icon="📊" />
            </div>

            {/* Log ao vivo */}
            {recent_queue && recent_queue.length > 0 && (
                <div>
                    <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Log Recente</p>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        maxHeight: 200,
                        overflowY: 'auto',
                    }}>
                        {recent_queue.map((item: any) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                                <span style={{ fontSize: 16 }}>
                                    {item.status === 'sent' ? '✅' : item.status === 'failed' ? '❌' : item.status === 'processing' ? '⏳' : '🔵'}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                                    {item.blast_contacts?.phone || 'N/A'}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.resolved_message?.slice(0, 50)}...
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Aviso de taxa alta */}
            {fail_rate > 0.1 && c.status === 'running' && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    color: '#ef4444',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    🚨 Taxa de falha acima de 10%. O sistema pausará automaticamente se ultrapassar 15%.
                </div>
            )}
        </div>
    )
}

// ─── Formulário de Nova Campanha ──────────────────────────────────────────────

function NewCampaignForm({ instances, onCreated }: { instances: WhatsAppInstance[]; onCreated: () => void }) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Campos da campanha
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [variants, setVariants] = useState([{ text: '' }])
    const [mediaUrl, setMediaUrl] = useState('')
    const [mediaType, setMediaType] = useState('')
    const [mediaCaption, setMediaCaption] = useState('')
    const [selectedInstances, setSelectedInstances] = useState<string[]>([])
    const [delayMin, setDelayMin] = useState(30)
    const [delayMax, setDelayMax] = useState(90)
    const [warmingEnabled, setWarmingEnabled] = useState(false)

    // CSV
    const [csvText, setCsvText] = useState('')
    const [csvPreview, setCsvPreview] = useState<any[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const mediaFileInputRef = useRef<HTMLInputElement>(null)

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Limite de 15MB para WhatsApp dependendo do provedor, mas vamos deixar subir
        setUploading(true)
        const toastId = toast.loading('Subindo arquivo para a nuvem...')

        try {
            // Verifica se o usuário tem permissão/sessão
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Sessão expirada. Faça login novamente.')

            const ext = file.name.split('.').pop()
            const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
            const path = `blast-media/${session.user.id}/${filename}`

            const { error: uploadErr } = await supabase.storage
                .from('funnel-assets')
                .upload(path, file)

            if (uploadErr) throw uploadErr

            const { data: { publicUrl } } = supabase.storage
                .from('funnel-assets')
                .getPublicUrl(path)

            setMediaUrl(publicUrl)
            
            // Detectar tipo
            if (file.type.startsWith('image/')) setMediaType('image')
            else if (file.type.startsWith('video/')) setMediaType('video')
            else if (file.type.startsWith('audio/')) setMediaType('audio')
            else setMediaType('document')

            toast.success('Mídia enviada com sucesso! 🚀', { id: toastId })
        } catch (err: any) {
            console.error('Upload error:', err)
            toast.error('Erro no upload: ' + (err.message || 'Erro desconhecido'), { id: toastId })
        } finally {
            setUploading(false)
            if (mediaFileInputRef.current) mediaFileInputRef.current.value = ''
        }
    }

    const handleCSV = (text: string) => {
        setCsvText(text)
        setCsvPreview(parseCSV(text).slice(0, 5))
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ev => handleCSV(ev.target?.result as string)
        reader.readAsText(file, 'UTF-8')
    }

    const createCampaign = async () => {
        setError('')
        setLoading(true)
        try {
            const res = await fetch('/api/blast/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, description,
                    message_variants: variants.filter(v => v.text.trim()),
                    media_url: mediaUrl || null,
                    media_type: mediaType || null,
                    media_caption: mediaCaption || null,
                    instance_ids: selectedInstances,
                    delay_min: delayMin,
                    delay_max: delayMax,
                    warming_enabled: warmingEnabled,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setCreatedCampaignId(data.campaign.id)
            setStep(3)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const importContacts = async () => {
        if (!createdCampaignId || !csvText) return
        setError('')
        setLoading(true)
        try {
            const contacts = parseCSV(csvText)
            const res = await fetch('/api/blast/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaign_id: createdCampaignId, contacts }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.details || data.error || 'Erro desconhecido')
            setStep(4)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        color: '#fff',
        padding: '10px 14px',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
    }
    const labelStyle: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6, display: 'block' }
    const btnPrimary: React.CSSProperties = {
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: '#fff', border: 'none', borderRadius: 10,
        padding: '11px 24px', fontSize: 14, fontWeight: 600,
        cursor: 'pointer', opacity: loading ? 0.6 : 1,
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stepper */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {['Configurar', 'Instâncias', 'Importar Lista', 'Pronto!'].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: step > i + 1 ? '#22c55e' : step === i + 1 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
                            border: step === i + 1 ? '2px solid #22c55e' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: '#fff', fontWeight: 700,
                        }}>
                            {step > i + 1 ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: 13, color: step === i + 1 ? '#fff' : 'rgba(255,255,255,0.35)' }}>{s}</span>
                        {i < 3 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>›</span>}
                    </div>
                ))}
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* STEP 1: Mensagem */}
            {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                        <label style={labelStyle}>Nome da Campanha *</label>
                        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção Páscoa 2026" />
                    </div>
                    <div>
                        <label style={labelStyle}>Descrição (interna)</label>
                        <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Nota interna sobre a campanha" />
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>✍️ Variantes de Mensagem (anti-repetição)</label>
                            <button
                                onClick={() => setVariants(v => [...v, { text: '' }])}
                                style={{ background: 'none', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                            >+ Variante</button>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 10 }}>
                            Use {'{{nome}}'} para personalizar. Cada envio sorteia uma variante diferente.
                        </div>
                        {variants.map((v, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <textarea
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80, flex: 1 }}
                                    value={v.text}
                                    onChange={e => {
                                        const copy = [...variants]
                                        copy[i].text = e.target.value
                                        setVariants(copy)
                                    }}
                                    placeholder={`Variante ${i + 1}: Oi {{nome}}, tudo bem?...`}
                                />
                                {variants.length > 1 && (
                                    <button
                                        onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                                        style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 18 }}
                                    >×</button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        <label style={labelStyle}>📎 Mídia (opcional)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ ...labelStyle, fontSize: 11 }}>URL ou Upload</label>
                                <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
                                    <input 
                                        style={{ ...inputStyle, flex: 1 }} 
                                        value={mediaUrl} 
                                        onChange={e => setMediaUrl(e.target.value)} 
                                        placeholder="https://..." 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => mediaFileInputRef.current?.click()}
                                        disabled={uploading}
                                        style={{
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 8,
                                            width: 42,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: uploading ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                        title="Fazer Upload de Arquivo"
                                    >
                                        {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={mediaFileInputRef} 
                                        style={{ display: 'none' }} 
                                        onChange={handleMediaUpload}
                                        accept="image/*,video/*,audio/*,application/pdf"
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ ...labelStyle, fontSize: 11 }}>Tipo</label>
                                <select style={inputStyle} value={mediaType} onChange={e => setMediaType(e.target.value)}>
                                    <option value="">Sem mídia</option>
                                    <option value="image">🖼️ Imagem</option>
                                    <option value="video">🎥 Vídeo</option>
                                    <option value="audio">🎙️ Áudio</option>
                                    <option value="document">📄 Documento</option>
                                </select>
                            </div>
                        </div>
                        {mediaUrl && (
                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ 
                                    padding: '10px 14px', 
                                    background: 'rgba(59, 130, 246, 0.08)', 
                                    border: '1px solid rgba(59, 130, 246, 0.2)', 
                                    borderRadius: 12,
                                    fontSize: 12,
                                    color: '#60a5fa',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                        <CheckCircle2 size={16} />
                                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            Mídia pronta: {mediaUrl.split('/').pop()}
                                        </span>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => { setMediaUrl(''); setMediaType(''); }}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                                    >
                                        Remover
                                    </button>
                                </div>
                                {mediaType === 'image' && (
                                    <div style={{ 
                                        width: '100%', 
                                        height: 120, 
                                        borderRadius: 12, 
                                        overflow: 'hidden', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(0,0,0,0.2)'
                                    }}>
                                        <img src={mediaUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                )}
                            </div>
                        )}
                        {mediaType && (
                            <div style={{ marginTop: 10 }}>
                                <label style={{ ...labelStyle, fontSize: 11 }}>Legenda da Mídia</label>
                                <input style={inputStyle} value={mediaCaption} onChange={e => setMediaCaption(e.target.value)} placeholder="Legenda com {{nome}}" />
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>⏱️ Delay Mín. (seg)</label>
                            <input type="number" style={inputStyle} value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} min={15} max={300} />
                        </div>
                        <div>
                            <label style={labelStyle}>⏱️ Delay Máx. (seg)</label>
                            <input type="number" style={inputStyle} value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} min={15} max={300} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <label style={labelStyle}>🔥 Aquecimento</label>
                            <button
                                onClick={() => setWarmingEnabled(w => !w)}
                                style={{
                                    ...inputStyle,
                                    background: warmingEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${warmingEnabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                    color: warmingEnabled ? '#22c55e' : 'rgba(255,255,255,0.5)',
                                    cursor: 'pointer', textAlign: 'center',
                                }}
                            >
                                {warmingEnabled ? '✅ Ativado' : '○ Desativado'}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button style={btnPrimary} onClick={() => setStep(2)} disabled={!name || !variants[0]?.text}>
                            Próximo →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Instâncias */}
            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={labelStyle}>📱 Selecione as Instâncias (rotação automática)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {instances.filter(i => i.status === 'connected').map(inst => (
                                <div
                                    key={inst.id}
                                    onClick={() => setSelectedInstances(sel =>
                                        sel.includes(inst.id) ? sel.filter(s => s !== inst.id) : [...sel, inst.id]
                                    )}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                                        border: `1px solid ${selectedInstances.includes(inst.id) ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                        background: selectedInstances.includes(inst.id) ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                                    }}
                                >
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: selectedInstances.includes(inst.id) ? '#22c55e' : 'transparent',
                                        border: `2px solid ${selectedInstances.includes(inst.id) ? '#22c55e' : 'rgba(255,255,255,0.3)'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                                    }}>
                                        {selectedInstances.includes(inst.id) && '✓'}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{inst.instance_name}</span>
                                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{inst.phone_number ? `(${inst.phone_number})` : ''}</span>
                                        </div>
                                        <div style={{ color: '#22c55e', fontSize: 11 }}>● Conectado</div>
                                    </div>
                                </div>
                            ))}
                            {instances.filter(i => i.status !== 'connected').length > 0 && (
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>
                                    {instances.filter(i => i.status !== 'connected').length} instância(s) desconectada(s) não exibida(s)
                                </div>
                            )}
                            {instances.filter(i => i.status === 'connected').length === 0 && (
                                <div style={{ color: '#ef4444', fontSize: 14, padding: 16 }}>
                                    ⚠️ Nenhuma instância conectada. Conecte um WhatsApp primeiro.
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <button style={{ ...btnPrimary, background: 'rgba(255,255,255,0.08)' }} onClick={() => setStep(1)}>← Voltar</button>
                        <button style={btnPrimary} onClick={createCampaign} disabled={selectedInstances.length === 0 || loading}>
                            {loading ? 'Criando...' : 'Criar Campanha →'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: Importar Contatos */}
            {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', color: '#22c55e', fontSize: 13 }}>
                        ✅ Campanha criada! Agora importe sua lista de contatos.
                    </div>

                    <div>
                        <label style={labelStyle}>📋 Formato do CSV</label>
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            telefone,nome,empresa,cidade<br />
                            5511999999999,João Silva,Empresa X,São Paulo<br />
                            5521988888888,Maria Souza,Empresa Y,Rio de Janeiro
                        </div>
                    </div>

                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                ...inputStyle,
                                cursor: 'pointer',
                                border: '2px dashed rgba(255,255,255,0.15)',
                                textAlign: 'center',
                                padding: '20px',
                                color: 'rgba(255,255,255,0.5)',
                            } as any}
                        >
                            📁 Clique para fazer upload do CSV<br />
                            <span style={{ fontSize: 11 }}>ou cole o conteúdo abaixo</span>
                        </button>
                    </div>

                    <div>
                        <textarea
                            style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                            value={csvText}
                            onChange={e => handleCSV(e.target.value)}
                            placeholder="Cole o CSV aqui..."
                        />
                    </div>

                    {csvPreview.length > 0 && (
                        <div>
                            <label style={labelStyle}>Prévia ({parseCSV(csvText).length} contatos detectados)</label>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
                                {csvPreview.map((c, i) => (
                                    <div key={i} style={{
                                        display: 'flex', gap: 16, padding: '8px 14px',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
                                    }}>
                                        <span style={{ color: '#22c55e', fontFamily: 'monospace' }}>{c.phone}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{c.name || '—'}</span>
                                    </div>
                                ))}
                                {parseCSV(csvText).length > 5 && (
                                    <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                                        ...e mais {parseCSV(csvText).length - 5} contatos
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <button style={{ ...btnPrimary, background: 'rgba(255,255,255,0.08)' }} onClick={() => setStep(2)}>← Voltar</button>
                        <button style={btnPrimary} onClick={importContacts} disabled={!csvText || loading}>
                            {loading ? 'Importando...' : 'Importar e Agendar →'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Sucesso */}
            {step === 4 && (
                <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                    <div style={{ fontSize: 56 }}>🎉</div>
                    <h3 style={{ margin: 0, color: '#22c55e', fontSize: 22 }}>Campanha pronta para disparar!</h3>
                    <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 400 }}>
                        Os contatos foram importados e a fila foi gerada com os delays de humanização. Clique em <strong style={{ color: '#fff' }}>▶ Iniciar</strong> na lista de campanhas quando quiser começar.
                    </p>
                    <button style={btnPrimary} onClick={onCreated}>
                        Ver Campanhas →
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── BlastPanel Principal ─────────────────────────────────────────────────────

export default function BlastPanel() {
    const [campaigns, setCampaigns] = useState<BlastCampaign[]>([])
    const [instances, setInstances] = useState<WhatsAppInstance[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'list' | 'new'>('list')
    const [watchingId, setWatchingId] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [camRes, instRes] = await Promise.all([
                fetch('/api/blast/campaigns'),
                fetch('/api/whatsapp/instances'),
            ])
            if (camRes.ok) {
                const d = await camRes.json()
                setCampaigns(d.campaigns || [])
            }
            if (instRes.ok) {
                const d = await instRes.json()
                setInstances(d.instances || d || [])
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const controlCampaign = async (id: string, action: string) => {
        const res = await fetch('/api/blast/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: id, action }),
        })
        if (res.ok) {
            fetchData()
            if (action === 'start' || action === 'resume') setWatchingId(id)
        }
    }

    const deleteCampaign = async (id: string) => {
        if (!confirm('Deletar esta campanha? Esta ação não pode ser desfeita.')) return
        await fetch(`/api/blast/campaigns?id=${id}`, { method: 'DELETE' })
        fetchData()
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            padding: '4px 0',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
                        🚀 Disparo Inteligente em Massa
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>
                        Anti-bloqueio · Humanizado · Rotação automática de instâncias
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {view === 'new' ? (
                        <button
                            onClick={() => setView('list')}
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: 'none', color: '#fff',
                                borderRadius: 10, padding: '9px 18px',
                                fontSize: 13, cursor: 'pointer',
                            }}
                        >← Voltar</button>
                    ) : (
                        <button
                            onClick={() => setView('new')}
                            style={{
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                border: 'none', color: '#fff',
                                borderRadius: 10, padding: '9px 18px',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                        >+ Nova Campanha</button>
                    )}
                </div>
            </div>

            {/* Monitor ao vivo */}
            {watchingId && (
                <CampaignStatusPanel
                    campaignId={watchingId}
                    onClose={() => setWatchingId(null)}
                />
            )}

            {/* View: Nova Campanha */}
            {view === 'new' && (
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    padding: 28,
                }}>
                    <NewCampaignForm instances={instances} onCreated={() => { setView('list'); fetchData() }} />
                </div>
            )}

            {/* View: Lista de Campanhas */}
            {view === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>Carregando...</div>
                    ) : campaigns.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px dashed rgba(255,255,255,0.08)',
                            borderRadius: 16,
                            color: 'rgba(255,255,255,0.35)',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                            <div style={{ fontSize: 16, marginBottom: 6 }}>Nenhuma campanha ainda</div>
                            <div style={{ fontSize: 14 }}>Clique em "+ Nova Campanha" para começar</div>
                        </div>
                    ) : (
                        campaigns.map(c => {
                            const cfg = STATUS_CONFIG[c.status]
                            const progress = c.total_contacts > 0 ? (c.sent_count / c.total_contacts) * 100 : 0

                            return (
                                <div key={c.id} style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    borderRadius: 14,
                                    padding: '18px 24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 14,
                                    transition: 'border-color 0.2s',
                                }}>
                                    {/* Topo */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>{c.name}</h3>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    padding: '2px 10px', borderRadius: 99,
                                                    background: cfg.bg, color: cfg.color, fontSize: 12,
                                                }}>
                                                    {cfg.icon} {cfg.label}
                                                </span>
                                            </div>
                                            {c.description && (
                                                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{c.description}</p>
                                            )}
                                        </div>
                                        {/* Ações */}
                                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                            {(c.status === 'draft' || c.status === 'paused') && (
                                                <button
                                                    onClick={() => controlCampaign(c.id, c.status === 'draft' ? 'start' : 'resume')}
                                                    style={{
                                                        background: 'rgba(34,197,94,0.15)',
                                                        border: '1px solid rgba(34,197,94,0.3)',
                                                        color: '#22c55e', borderRadius: 8,
                                                        padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                                                    }}
                                                >▶ {c.status === 'draft' ? 'Iniciar' : 'Retomar'}</button>
                                            )}
                                            {c.status === 'running' && (
                                                <>
                                                    <button
                                                        onClick={() => setWatchingId(c.id)}
                                                        style={{
                                                            background: 'rgba(59,130,246,0.15)',
                                                            border: '1px solid rgba(59,130,246,0.3)',
                                                            color: '#3b82f6', borderRadius: 8,
                                                            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                                                        }}
                                                    >📊 Monitor</button>
                                                    <button
                                                        onClick={() => controlCampaign(c.id, 'pause')}
                                                        style={{
                                                            background: 'rgba(245,158,11,0.15)',
                                                            border: '1px solid rgba(245,158,11,0.3)',
                                                            color: '#f59e0b', borderRadius: 8,
                                                            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                                                        }}
                                                    >⏸ Pausar</button>
                                                </>
                                            )}
                                            {(c.status === 'draft' || c.status === 'completed' || c.status === 'cancelled') && (
                                                <button
                                                    onClick={() => deleteCampaign(c.id)}
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)',
                                                        border: '1px solid rgba(239,68,68,0.2)',
                                                        color: '#ef4444', borderRadius: 8,
                                                        padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                                                    }}
                                                >🗑</button>
                                            )}
                                            {c.status === 'running' && (
                                                <button
                                                    onClick={() => controlCampaign(c.id, 'cancel')}
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)',
                                                        border: '1px solid rgba(239,68,68,0.2)',
                                                        color: '#ef4444', borderRadius: 8,
                                                        padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                                                    }}
                                                >🛑 Cancelar</button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Progresso */}
                                    {c.total_contacts > 0 && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                                                <span>{c.sent_count} enviados de {c.total_contacts}</span>
                                                <span>{progress.toFixed(0)}%</span>
                                            </div>
                                            <ProgressBar value={c.sent_count} max={c.total_contacts} color={cfg.color} />
                                        </div>
                                    )}

                                    {/* Info rodapé */}
                                    <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                                        <span>⏱️ {c.delay_min}s–{c.delay_max}s entre msgs</span>
                                        <span>📱 {c.instance_ids.length} instância(s)</span>
                                        <span>✍️ {c.message_variants.length} variante(s)</span>
                                        {c.failed_count > 0 && <span style={{ color: '#ef4444' }}>❌ {c.failed_count} falhas</span>}
                                        {c.warming_enabled && <span style={{ color: '#f59e0b' }}>🔥 Aquecimento ativo</span>}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* Aviso de segurança */}
            <div style={{
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: 12,
                padding: '14px 18px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.45)',
                lineHeight: 1.6,
            }}>
                🛡️ <strong style={{ color: '#f59e0b' }}>Anti-bloqueio automático:</strong> O sistema simula digitação humana, usa delays randômicos entre {' '}
                <strong style={{ color: '#fff' }}>30–90 segundos</strong>, rotaciona instâncias e pausa automaticamente se a taxa de falha ultrapassar 15%.
                Contatos que responderem <em>"sair"</em> são removidos da fila automaticamente.
            </div>
        </div>
    )
}
