'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Edit3, Save, X, Megaphone, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Sidebar } from '@/components/Sidebar'

interface Campaign {
  id: string
  name: string
  trigger_phrase: string
  system_prompt: string
  instance_id: string
  is_active: boolean
}

interface Instance {
  id: string
  instance_name: string
  display_name: string
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // New Campaign Form
  const [newName, setNewName] = useState('')
  const [newTrigger, setNewTrigger] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newInstanceId, setNewInstanceId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    checkAdmin()
    fetchData()
  }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) {
        window.location.href = '/dashboard'
      } else {
        setIsAdmin(true)
      }
    }
  }

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: camps }, { data: insts }] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('whatsapp_instances').select('id, instance_name, display_name').eq('status', 'connected')
      ])

      setCampaigns(camps || [])
      setInstances(insts || [])
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!newName || !newTrigger || !newPrompt || !newInstanceId) {
      toast.error('Preencha todos os campos')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (isEditing) {
        const { error } = await supabase.from('campaigns').update({
          name: newName,
          trigger_phrase: newTrigger,
          system_prompt: newPrompt,
          instance_id: newInstanceId,
        }).eq('id', isEditing)

        if (error) throw error
        setCampaigns(campaigns.map(c => c.id === isEditing ? { ...c, name: newName, trigger_phrase: newTrigger, system_prompt: newPrompt, instance_id: newInstanceId } : c))
        toast.success('Campanha atualizada!')
      } else {
        const { data, error } = await supabase.from('campaigns').insert({
          name: newName,
          trigger_phrase: newTrigger,
          system_prompt: newPrompt,
          instance_id: newInstanceId,
          user_id: user?.id,
          is_active: true
        }).select().single()

        if (error) throw error
        setCampaigns([data, ...campaigns])
        toast.success('Campanha criada com sucesso!')
      }

      setIsAdding(false)
      setIsEditing(null)
      // Reset form
      setNewName('')
      setNewTrigger('')
      setNewPrompt('')
      setNewInstanceId('')
    } catch (error) {
        console.error(error)
      toast.error('Erro ao salvar campanha')
    }
  }

  function startEdit(camp: Campaign) {
    setNewName(camp.name)
    setNewTrigger(camp.trigger_phrase)
    setNewPrompt(camp.system_prompt)
    setNewInstanceId(camp.instance_id)
    setIsEditing(camp.id)
    setIsAdding(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza?')) return
    try {
      await supabase.from('campaigns').delete().eq('id', id)
      setCampaigns(campaigns.filter(c => c.id !== id))
      toast.success('Campanha excluída')
    } catch (error) {
      toast.error('Erro ao excluir')
    }
  }

  if (!isAdmin) return null

  return (
    <div className="p-8">
      <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Megaphone className="text-emerald-500" />
              Gestão de Múltiplos Produtos (Beta Admin)
            </h1>
            <p className="text-zinc-400 mt-1">Crie personas e prompts específicos para cada produto no mesmo WhatsApp.</p>
          </div>
          <button 
            onClick={() => {
                setIsEditing(null)
                setNewName('')
                setNewTrigger('')
                setNewPrompt('')
                setNewInstanceId('')
                setIsAdding(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
          >
            <Plus size={20} />
            Nova Campanha
          </button>
        </header>

        {isAdding && (
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-lg font-semibold mb-4 text-emerald-400">
                {isEditing ? 'Editar Configuração do Produto' : 'Configurar Novo Produto'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Nome do Produto/Persona</label>
                <input 
                  value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 focus:border-emerald-500 outline-none"
                  placeholder="Ex: Liso Mágico"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Frase de Gatilho (Mensagem enviada pelo cliente)</label>
                <input 
                  value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 focus:border-emerald-500 outline-none"
                  placeholder="Ex: Quero o Liso Mágico"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-zinc-400 mb-1">Selecione o WhatsApp</label>
                <select 
                  value={newInstanceId} onChange={e => setNewInstanceId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 focus:border-emerald-500 outline-none"
                >
                  <option value="">Selecione uma instância conectada...</option>
                  {instances.map(i => (
                    <option key={i.id} value={i.id}>{i.display_name || i.instance_name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-zinc-400 mb-1">Instrução da IA (Prompt Específico deste Produto)</label>
                <textarea 
                  value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 h-32 focus:border-emerald-500 outline-none"
                  placeholder="Você é uma vendedora especialista no produto X. Suas regras são..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setIsAdding(false); setIsEditing(null); }} className="text-zinc-400 hover:text-white transition-colors">Cancelar</button>
              <button 
                onClick={handleAdd}
                className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-semibold"
              >
                {isEditing ? 'Salvar Alterações' : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Loader2 className="animate-spin mb-2" />
            Carregando campanhas...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
            <Megaphone size={48} className="mx-auto mb-4 text-zinc-700" />
            <p className="text-zinc-400">Nenhuma campanha multi-produto cadastrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campaigns.map(camp => (
              <div key={camp.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl hover:border-emerald-900/50 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-emerald-400">{camp.name}</h3>
                    <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded mt-1 inline-block">
                      Instância: {instances.find(i => i.id === camp.instance_id)?.display_name || 'Desconectada'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(camp)} className="p-2 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => handleDelete(camp.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <p className="text-xs uppercase text-zinc-500 font-bold mb-1">Gatilho da Mensagem</p>
                    <p className="text-sm italic text-zinc-300">"{camp.trigger_phrase}"</p>
                  </div>
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <p className="text-xs uppercase text-zinc-500 font-bold mb-1">Instrução de Venda</p>
                    <p className="text-sm text-zinc-400 line-clamp-3">{camp.system_prompt}</p>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2 text-xs text-zinc-500 bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
                  <AlertCircle size={14} className="text-emerald-500" />
                  <span>Ativa e monitorando mensagens.</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
