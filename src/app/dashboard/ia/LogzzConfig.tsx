
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logzzApi } from '@/lib/logzz'
import { toast } from 'sonner'
import { Package, Save, Loader2, Plus, Trash2, ExternalLink, ShieldCheck, ShoppingBag, Info, ShieldAlert } from 'lucide-react'

interface LogzzConfigData {
  id?: string
  api_key: string
  is_active: boolean
}

interface LogzzProductMapping {
  id?: string
  product_name_crm: string
  logzz_product_code: string
  logzz_offer_hash?: string
  price?: number
}

export default function LogzzConfig() {
  const [config, setConfig] = useState<LogzzConfigData>({ api_key: '', is_active: false })
  const [products, setProducts] = useState<LogzzProductMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState<LogzzProductMapping>({
    product_name_crm: '',
    logzz_product_code: '',
  })
  const [logzzProductsList, setLogzzProductsList] = useState<any[]>([])
  const [loadingLogzzProducts, setLoadingLogzzProducts] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
    if (!user) return

    const [configRes, productsRes] = await Promise.all([
      supabase.from('logzz_configurations').select('*').eq('user_id', user.id).single(),
      supabase.from('logzz_products').select('*').eq('user_id', user.id)
    ])

    if (configRes.data) setConfig(configRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    setLoading(false)
  }

  async function handleSaveConfig() {
    if (!config.api_key.trim()) {
      toast.error('Insira a API Key da Logzz antes de salvar')
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
    if (!user) { setSaving(false); return }

    const payload = {
      user_id: user.id,
      api_key: config.api_key.trim(),
      is_active: config.is_active,
      updated_at: new Date().toISOString()
    }

    // Usamos upsert com onConflict user_id para evitar erro de UNIQUE constraint
    const { error } = await supabase
      .from('logzz_configurations')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      console.error('Erro Logzz config:', error)
      toast.error(`Erro ao salvar: ${error.message}`)
    } else {
      toast.success('Configuração Logzz salva!')
      loadData()
    }
    setSaving(false)
  }

  async function handleAddProduct() {
      if (!newProduct.product_name_crm || !newProduct.logzz_product_code) {
          toast.error('Preencha os campos obrigatórios')
          return
      }

      setSaving(true)
      const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
      if (!user) return

      const { error } = await supabase.from('logzz_products').insert({
          ...newProduct,
          user_id: user.id
      })

      if (error) {
          toast.error('Erro ao mapear produto')
      } else {
          toast.success('Produto mapeado com sucesso!')
          setShowAddProduct(false)
          setNewProduct({ product_name_crm: '', logzz_product_code: '' })
          loadData()
      }
      setSaving(false)
  }

  async function handleDeleteProduct(id: string) {
      const { error } = await supabase.from('logzz_products').delete().eq('id', id)
      if (error) toast.error('Erro ao remover')
      else {
          setProducts(products.filter(p => p.id !== id))
          toast.success('Mapeamento removido')
      }
  }

  async function fetchLogzzProducts() {
      if (!config.api_key) {
          toast.error('Insira sua API Key primeiro')
          return
      }
      setLoadingLogzzProducts(true)
      try {
          const data = await logzzApi.getProducts(config.api_key)
          // Na resposta da Logzz os produtos podem vir em 'producer', 'affiliate', etc.
          const all = [
              ...(data.data?.producer || []),
              ...(data.data?.affiliate || []),
              ...(data.data?.coproducer || [])
          ]
          setLogzzProductsList(all)
          if (all.length === 0) toast.info('Nenhum produto encontrado na sua conta Logzz')
      } catch (err) {
          toast.error('Erro ao buscar produtos na Logzz. Verifique sua chave.')
      } finally {
          setLoadingLogzzProducts(false)
      }
  }

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="gradient-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Integração Logzz (Exclusivo Admin)
            </h2>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">BETA TESTER</span>
            </div>
        </div>

        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center justify-between">
                    Logzz API Key
                    <a href="https://app.logzz.com.br/integracoes/api-tokens" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                        Onde achar? <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                </label>
                <div className="flex gap-2">
                    <input 
                        type={showKey ? 'text' : 'password'}
                        value={config.api_key}
                        onChange={e => setConfig({...config, api_key: e.target.value})}
                        placeholder="Ex: 123456|abcdef..."
                        className="flex-1 bg-input border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="px-3 bg-secondary rounded-lg hover:bg-secondary/80">
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/10 rounded-xl">
                <div>
                    <h4 className="text-sm font-semibold text-foreground">Gerar Pedidos Automaticamente</h4>
                    <p className="text-[11px] text-muted-foreground">Quando a Camila fechar uma venda, o sistema criará o pedido na Logzz.</p>
                </div>
                <button 
                   onClick={() => setConfig({...config, is_active: !config.is_active})}
                   className={`w-12 h-6 rounded-full transition-all relative ${config.is_active ? 'bg-primary' : 'bg-border'}`}
                >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.is_active ? 'right-1' : 'left-1'}`} />
                </button>
            </div>

            <button 
                onClick={handleSaveConfig}
                disabled={saving}
                className="w-full gradient-primary text-black font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configuração Logzz
            </button>
        </div>
      </div>

      {(config.id || config.api_key) && (
        <div className="gradient-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" /> Mapeamento de Produtos
                    </h2>
                    <p className="text-xs text-muted-foreground">Vincule os produtos da sua IA com os códigos da Logzz.</p>
                </div>
                <button 
                    onClick={() => {
                        setShowAddProduct(!showAddProduct);
                        if (!showAddProduct && logzzProductsList.length === 0) fetchLogzzProducts();
                    }}
                    className="p-2 bg-secondary hover:bg-primary hover:text-black rounded-lg transition-all"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {showAddProduct && (
                <div className="mb-6 p-4 bg-secondary/20 border border-border rounded-xl space-y-4 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Nome no CRM (IA Identificar)</label>
                            <input 
                                value={newProduct.product_name_crm}
                                onChange={e => setNewProduct({...newProduct, product_name_crm: e.target.value})}
                                placeholder="Ex: Liso Magico"
                                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Código Logzz (Hash)</label>
                            <select 
                                value={newProduct.logzz_product_code}
                                onChange={e => {
                                    const selected = logzzProductsList.find(p => p.hash === e.target.value);
                                    setNewProduct({
                                        ...newProduct, 
                                        logzz_product_code: e.target.value,
                                        price: selected?.offers?.[0]?.price || 0
                                    });
                                }}
                                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="">Selecione o produto na Logzz</option>
                                {logzzProductsList.map(p => (
                                    <option key={p.hash} value={p.hash}>{p.name} ({p.hash})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-between items-center bg-primary/5 p-3 rounded-lg border border-primary/10">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-primary" />
                            <span className="text-[10px] text-muted-foreground">Preço base capturado: <b>R$ {newProduct.price || '0.00'}</b></span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAddProduct(false)} className="text-xs text-muted-foreground">Cancelar</button>
                            <button onClick={handleAddProduct} className="text-xs font-bold text-primary">Confirmar Mapeamento</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {products.length === 0 && !showAddProduct && (
                    <div className="text-center py-8 opacity-50 flex flex-col items-center">
                        <ShoppingBag className="w-8 h-8 mb-2" />
                        <span className="text-xs">Nenhum mapeamento de produto ainda.</span>
                    </div>
                )}
                {products.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-secondary/10 border border-border rounded-xl group hover:border-primary/50 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                                {p.product_name_crm.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-foreground">{p.product_name_crm}</h4>
                                <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                                    LOGZZ CODE: <code className="bg-secondary px-1.5 py-0.5 rounded text-primary">{p.logzz_product_code}</code>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right hidden md:block">
                                <div className="text-xs font-bold text-foreground">R$ {p.price || '--'}</div>
                                <div className="text-[9px] text-muted-foreground">VENDA AUTOMATIZADA</div>
                            </div>
                            <button 
                                onClick={() => p.id && handleDeleteProduct(p.id)}
                                className="p-2 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 p-4 bg-secondary/30 rounded-xl border border-border flex gap-3">
                <Info className="w-5 h-5 text-primary shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <b>Como funciona:</b> Quando a Camila identificar que o cliente quer comprar o <b>[Nome no CRM]</b>, ela vai usar o <b>[Código Logzz]</b> correspondente para criar o pedido na sua conta Logzz. Se o preço for identificado na conversa, ele será usado; caso contrário, usaremos o preço do mapeamento.
                </p>
            </div>
        </div>
      )}
    </div>
  )
}

function Eye({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> }
function EyeOff({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg> }

