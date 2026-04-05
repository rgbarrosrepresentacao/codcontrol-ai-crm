'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Settings, User, Save, Loader2, Bell, Shield, Eye, EyeOff, Phone } from 'lucide-react'

export default function ConfiguracoesPage() {
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [vapiKey, setVapiKey] = useState('')
    const [savingVapi, setSavingVapi] = useState(false)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: p } = await supabase.from('profiles').select('*, plans(name)').eq('id', user.id).single()
            setProfile(p)
            setName(p?.name || '')
            setEmail(user.email || '')
            setIsAdmin(p?.is_admin === true)
            setVapiKey(p?.vapi_api_key || '')
            setLoading(false)
        }
        load()
    }, [])

    const saveProfile = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            await supabase.from('profiles').update({ name }).eq('id', user.id)
            toast.success('Perfil atualizado!')
        } catch {
            toast.error('Erro ao salvar perfil')
        } finally {
            setSaving(false)
        }
    }

    const changePassword = async () => {
        if (!newPassword || newPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return }
        setChangingPassword(true)
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) toast.error(error.message)
        else { toast.success('Senha alterada com sucesso!'); setNewPassword('') }
        setChangingPassword(false)
    }

    if (loading) return <div className="p-8 flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Settings className="w-6 h-6 text-primary" />Configurações
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Gerencie seu perfil e preferências</p>
            </div>

            {/* Profile */}
            <div className="gradient-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2"><User className="w-4 h-4 text-primary" />Perfil</h2>

                <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-xl">
                        {name.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                        <div className="font-semibold text-foreground">{name || 'Usuário'}</div>
                        <div className="text-muted-foreground text-sm">{email}</div>
                        <div className="mt-1">
                            <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-xs rounded-full">
                                Plano {(profile as any)?.plans?.name || 'Básico'}
                            </span>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Nome completo</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <input
                        value={email}
                        disabled
                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-muted-foreground text-sm cursor-not-allowed opacity-70"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Email não pode ser alterado</p>
                </div>
                <button onClick={saveProfile} disabled={saving} className="gradient-primary text-black font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar perfil'}
                </button>
            </div>

            {/* Password */}
            <div className="gradient-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />Segurança</h2>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                        />
                        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <button onClick={changePassword} disabled={changingPassword || !newPassword} className="border border-border text-foreground font-medium px-4 py-2.5 rounded-lg hover:bg-secondary transition-colors flex items-center gap-2 text-sm disabled:opacity-60">
                    {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Alterar senha
                </button>
            </div>

            {/* Integrations Info - só admin */}
            {isAdmin && (
                <div className="gradient-card border border-border rounded-xl p-6 space-y-3">
                    <h2 className="font-semibold text-foreground flex items-center gap-2"><Bell className="w-4 h-4 text-primary" />Integrações</h2>
                    <div className="space-y-2">
                        {[
                            { label: 'Evolution API', value: 'api.codcontrolpro.bond', status: true },
                            { label: 'Supabase', value: 'jzbsutrmprzfuvaripwb.supabase.co', status: true },
                        ].map(i => (
                            <div key={i.label} className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5">
                                <div>
                                    <div className="text-sm font-medium text-foreground">{i.label}</div>
                                    <div className="text-xs text-muted-foreground">{i.value}</div>
                                </div>
                                <div className={`flex items-center gap-1.5 text-xs font-medium ${i.status ? 'text-emerald-400' : 'text-red-400'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${i.status ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                    {i.status ? 'Conectado' : 'Desconectado'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    )
}


