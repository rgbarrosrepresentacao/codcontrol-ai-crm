'use client'
import '@xyflow/react/dist/style.css'
import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  Handle, Position, useNodesState, useEdgesState, addEdge,
  useReactFlow, BackgroundVariant, MarkerType, Panel
} from '@xyflow/react'
import type { Node, Edge, NodeTypes, Connection, NodeProps } from '@xyflow/react'
import { supabase } from '@/lib/supabase'
import {
  MessageSquare, Mic, Video, Image as ImageIcon, Clock, GitBranch,
  Zap, Flag, Play, Plus, Save, Trash2, Star, ChevronRight,
  Loader2, X, Settings, Check, AlertCircle, Info, Upload
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Funnel { id: string; name: string; is_active: boolean; is_default: boolean }
type NType = 'start' | 'text' | 'audio' | 'image' | 'video' | 'delay' | 'condition' | 'action' | 'end'

// ─── Node Visual Config ───────────────────────────────────────────────────────
const NC: Record<NType, { label: string; icon: any; color: string; bg: string }> = {
  start:     { label: 'Início',    icon: Play,          color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  text:      { label: 'Texto',     icon: MessageSquare, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  audio:     { label: 'Áudio',     icon: Mic,           color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  image:     { label: 'Imagem',    icon: ImageIcon,     color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  video:     { label: 'Vídeo',     icon: Video,         color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  delay:     { label: 'Espera',    icon: Clock,         color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  condition: { label: 'Condição',  icon: GitBranch,     color: '#facc15', bg: 'rgba(250,204,21,0.12)' },
  action:    { label: 'Ação/Link', icon: Zap,           color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
  end:       { label: 'Finalizar', icon: Flag,          color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
}

// ─── Default data for each node type ──────────────────────────────────────────
function defaultData(type: NType): Record<string, unknown> {
  const map: Record<NType, Record<string, unknown>> = {
    start: {},
    text: { content: '', wait_for_reply: false },
    audio: { content: '', wait_for_reply: false },
    image: { content: '', caption: '', wait_for_reply: false },
    video: { content: '', caption: '', wait_for_reply: false },
    delay: { delay_seconds: 5 },
    condition: { condition_label: 'Se cliente demonstrar interesse...' },
    action: { url: '', caption: '', wait_for_reply: false },
    end: { content: 'Obrigada! Em breve nossa equipe entrará em contato. 😊' },
  }
  return map[type] || {}
}

// ─── Custom Node Component ─────────────────────────────────────────────────────
function FlowNode({ data, selected, type: rawType }: NodeProps) {
  const type = (rawType as NType) || 'text'
  const cfg = NC[type] || NC.text
  const Icon = cfg.icon
  const isStart = type === 'start'
  const isEnd = type === 'end'
  const isCond = type === 'condition'

  const preview = () => {
    if (type === 'delay') return `⏱ Aguardar ${(data as any).delay_seconds || 0}s`
    if (type === 'condition') return (data as any).condition_label || 'Se cliente responder...'
    if (type === 'start') return 'Início do fluxo automático'
    const c = (data as any).content || ''
    return c ? (c.length > 55 ? c.slice(0, 55) + '…' : c) : 'Clique para editar…'
  }

  return (
    <div style={{
      background: selected ? cfg.bg.replace('0.12', '0.22') : cfg.bg,
      border: `2px solid ${selected ? cfg.color : cfg.color + '55'}`,
      borderRadius: 14, minWidth: 210, maxWidth: 250,
      boxShadow: selected ? `0 0 22px ${cfg.color}44` : '0 4px 16px rgba(0,0,0,0.5)',
      transition: 'all 0.2s',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {!isStart && (
        <Handle type="target" position={Position.Top}
          style={{ background: cfg.color, border: '2.5px solid #0f172a', width: 14, height: 14, top: -7 }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px', borderBottom: `1px solid ${cfg.color}30` }}>
        <div style={{ background: cfg.color + '25', borderRadius: 7, padding: 5, display: 'flex' }}>
          <Icon size={13} color={cfg.color} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {cfg.label}
        </span>
      </div>
      <div style={{ padding: '10px 14px', fontSize: 12, color: (data as any).content || type !== 'text' ? '#cbd5e1' : '#64748b', fontStyle: !((data as any).content) && type === 'text' ? 'italic' : 'normal', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {preview()}
        {((data as any).wait_for_reply && !isEnd && !isStart) && (
          <div style={{ marginTop: 6, fontSize: 10, color: '#a78bfa', background: '#a78bfa15', padding: '3px 8px', borderRadius: 5, display: 'inline-block' }}>
            ⏸ Aguarda resposta
          </div>
        )}
      </div>
      {!isEnd && !isCond && (
        <Handle type="source" position={Position.Bottom}
          style={{ background: cfg.color, border: '2.5px solid #0f172a', width: 14, height: 14, bottom: -7 }} />
      )}
      {isCond && (
        <>
          <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>✓ SIM</span>
            <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>✗ NÃO</span>
          </div>
          <Handle id="yes" type="source" position={Position.Bottom}
            style={{ background: '#10b981', border: '2.5px solid #0f172a', width: 14, height: 14, left: '28%', bottom: -7 }} />
          <Handle id="no" type="source" position={Position.Bottom}
            style={{ background: '#f87171', border: '2.5px solid #0f172a', width: 14, height: 14, left: '72%', bottom: -7 }} />
        </>
      )}
    </div>
  )
}

// Stable nodeTypes reference (outside component, no re-creation)
const makeNode = (t: NType) => (p: NodeProps) => <FlowNode {...p} type={t} />
const nodeTypes: NodeTypes = {
  start: makeNode('start'), text: makeNode('text'), audio: makeNode('audio'),
  image: makeNode('image'), video: makeNode('video'), delay: makeNode('delay'),
  condition: makeNode('condition'), action: makeNode('action'), end: makeNode('end'),
}

// ─── Node Editor Panel ─────────────────────────────────────────────────────────
function NodeEditor({ node, onChange, onDelete, onClose }: {
  node: Node; onChange: (data: any) => void; onDelete: () => void; onClose: () => void
}) {
  const type = (node.type as NType) || 'text'
  const cfg = NC[type] || NC.text
  const d = node.data as any

  const [uploading, setUploading] = useState(false)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const toastId = toast.loading('Fazendo upload do arquivo...')
    
    try {
      const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
      if (!user) throw new Error('Não autenticado')

      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('funnel-assets')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('funnel-assets')
        .getPublicUrl(fileName)

      onChange({ ...d, content: publicUrl, url: publicUrl })
      toast.success('Upload concluído!', { id: toastId })
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao fazer upload: ' + err.message, { id: toastId })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 300, zIndex: 10,
      background: '#0d1117', borderLeft: '1px solid #1e293b',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: cfg.color + '20', borderRadius: 8, padding: 7, display: 'flex' }}>
            <cfg.icon size={16} color={cfg.color} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Editar Bloco</div>
            <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(type === 'text' || type === 'end') && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
              💬 Mensagem
            </label>
            <textarea
              value={d.content || ''}
              onChange={e => onChange({ ...d, content: e.target.value })}
              placeholder="Digite a mensagem que será enviada..."
              style={{ width: '100%', minHeight: 120, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#f1f5f9', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {(type === 'audio' || type === 'image' || type === 'video' || type === 'action') && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
              🔗 URL do arquivo
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={d.content || d.url || ''}
                onChange={e => onChange({ ...d, content: e.target.value, url: e.target.value })}
                placeholder={type === 'audio' ? 'https://... (.ogg, .mp3)' : type === 'image' ? 'https://... (.jpg, .png)' : 'https://...'}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box', minWidth: 0 }}
              />
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#334155', borderRadius: 10, width: 42, height: 42, flexShrink: 0,
                cursor: uploading ? 'wait' : 'pointer', border: '1px solid #475569', color: '#f1f5f9'
              }}>
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} accept={type === 'audio' ? 'audio/*' : type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'} />
              </label>
            </div>
            {type === 'audio' && (
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>💡 Use .ogg para aparecer como áudio gravado</p>
            )}
            {(type === 'image' || type === 'video') && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>📝 Legenda (opcional)</label>
                <input
                  type="text"
                  value={d.caption || ''}
                  onChange={e => onChange({ ...d, caption: e.target.value })}
                  placeholder="Legenda da mídia..."
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
            {type === 'action' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>📝 Texto da mensagem</label>
                <input
                  type="text"
                  value={d.caption || ''}
                  onChange={e => onChange({ ...d, caption: e.target.value })}
                  placeholder="Texto que acompanha o link..."
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>
        )}

        {type === 'delay' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>⏱ Tempo de espera (segundos)</label>
            <input
              type="number"
              min={1} max={3600}
              value={d.delay_seconds || 5}
              onChange={e => onChange({ ...d, delay_seconds: parseInt(e.target.value) || 5 })}
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Ex: 5 = 5seg · 60 = 1min · 3600 = 1hora
            </p>
          </div>
        )}

        {type === 'condition' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>❓ O que verificar</label>
            <input
              type="text"
              value={d.condition_label || ''}
              onChange={e => onChange({ ...d, condition_label: e.target.value })}
              placeholder="Ex: Se cliente demonstrar interesse..."
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: 12, padding: 12, background: '#facc1510', border: '1px solid #facc1530', borderRadius: 10 }}>
              <p style={{ fontSize: 11, color: '#facc15', margin: 0 }}>
                <strong>SIM</strong> → caminho da esquerda<br />
                <strong>NÃO</strong> → caminho da direita<br />
                A IA decide baseado na resposta do cliente.
              </p>
            </div>
          </div>
        )}

        {/* wait_for_reply for media and action nodes */}
        {(type === 'text' || type === 'action' || type === 'audio' || type === 'image' || type === 'video') && (
          <div>
            <button
              onClick={() => onChange({ ...d, wait_for_reply: !d.wait_for_reply })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: d.wait_for_reply ? '#a78bfa15' : '#1e293b',
                border: `1px solid ${d.wait_for_reply ? '#a78bfa50' : '#334155'}`,
                borderRadius: 10, cursor: 'pointer', color: d.wait_for_reply ? '#a78bfa' : '#94a3b8'
              }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>⏸ Pausar e aguardar resposta</span>
              <div style={{
                width: 38, height: 22, borderRadius: 11, background: d.wait_for_reply ? '#a78bfa' : '#334155',
                position: 'relative', transition: 'all 0.2s'
              }}>
              <div style={{
                  position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  top: 3, left: d.wait_for_reply ? 19 : 3, transition: 'all 0.2s'
                }} />
              </div>
            </button>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Quando ativo, o funil pausa aqui e aguarda o cliente responder antes de continuar.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {type !== 'start' && (
        <div style={{ padding: '14px 18px', borderTop: '1px solid #1e293b' }}>
          <button
            onClick={onDelete}
            style={{ width: '100%', padding: '10px', background: '#f8717115', border: '1px solid #f8717130', borderRadius: 10, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <Trash2 size={14} /> Remover este bloco
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Funnel Canvas (inner — has access to useReactFlow) ────────────────────────
function FunnelCanvas({ selectedFunnel, onFunnelUpdate }: { selectedFunnel: Funnel; onFunnelUpdate: (f: Funnel) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const { screenToFlowPosition } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadFunnel() }, [selectedFunnel.id])

  async function loadFunnel() {
    setLoading(true)
    setSelectedNode(null)

    const [{ data: steps }, { data: fedges }] = await Promise.all([
      supabase.from('funnel_steps').select('*').eq('funnel_id', selectedFunnel.id).order('order_index', { ascending: true }),
      supabase.from('funnel_edges').select('*').eq('funnel_id', selectedFunnel.id),
    ])

    if (steps && steps.length > 0) {
      const loadedNodes: Node[] = steps.map((s, i) => ({
        id: s.id,
        type: s.node_type || s.type || 'text',
        position: { x: s.pos_x ?? 150, y: s.pos_y ?? (i * 180 + 50) },
        data: { content: s.content || '', ...(s.node_data || {}), delay_seconds: s.delay_seconds || 0, wait_for_reply: s.wait_for_reply || false },
      }))
      setNodes(loadedNodes)

      if (fedges && fedges.length > 0) {
        const loadedEdges: Edge[] = fedges.map(e => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: e.source_handle === 'default' ? null : (e.source_handle || null),
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
          style: { stroke: '#10b981', strokeWidth: 2 },
          animated: true,
        }))
        setEdges(loadedEdges)
      } else {
        // Auto-generate edges from linear order for old funnels
        const autoEdges: Edge[] = steps.slice(0, -1).map((s, i) => ({
          id: `auto-${s.id}-${steps[i + 1].id}`,
          source: s.id,
          target: steps[i + 1].id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
          style: { stroke: '#10b981', strokeWidth: 2 },
          animated: true,
        }))
        setEdges(autoEdges)
      }
    } else {
      // Empty funnel — add a START node automatically
      setNodes([{
        id: `start-${Date.now()}`,
        type: 'start',
        position: { x: 150, y: 80 },
        data: {},
      }])
      setEdges([])
    }
    setLoading(false)
  }

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds: Edge[]) => addEdge({
      ...conn,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
      style: { stroke: '#10b981', strokeWidth: 2 },
      animated: true,
    }, eds))
  }, [setEdges])

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow') as NType
    if (!type) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: defaultData(type),
    }
    setNodes((nds: Node[]) => [...nds, newNode])
  }, [screenToFlowPosition, setNodes])

  const addNodeAtCenter = useCallback((type: NType) => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    // Adiciona no centro da área visível do canvas
    const position = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    })

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: defaultData(type),
    }
    setNodes((nds: Node[]) => [...nds, newNode])
    setSelectedNode(newNode)
    toast.success(`${NC[type].label} adicionado ao centro`)
  }, [screenToFlowPosition, setNodes])

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  const updateNodeData = useCallback((data: any) => {
    if (!selectedNode) return
    setNodes((nds: Node[]) => nds.map(n => n.id === selectedNode.id ? { ...n, data } : n))
    setSelectedNode((prev: Node | null) => prev ? { ...prev, data } : prev)
  }, [selectedNode, setNodes])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return
    setNodes((nds: Node[]) => nds.filter(n => n.id !== selectedNode.id))
    setEdges((eds: Edge[]) => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }, [selectedNode, setNodes, setEdges])

  async function saveFunnel() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
      if (!user) throw new Error('Não autenticado')

      // Helper to generate local UUID
      const genUUID = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
          return v.toString(16);
        });
      }

      const stableIdMap: Record<string, string> = {}
      nodes.forEach(n => {
        const isTemp = n.id.startsWith('start-') || n.id.startsWith('text-') || n.id.startsWith('audio-') ||
          n.id.startsWith('image-') || n.id.startsWith('video-') || n.id.startsWith('delay-') ||
          n.id.startsWith('condition-') || n.id.startsWith('action-') || n.id.startsWith('end-');
        
        stableIdMap[n.id] = isTemp ? genUUID() : n.id;
      })

      // 1. Delete all existing steps + edges
      await supabase.from('funnel_edges').delete().eq('funnel_id', selectedFunnel.id)
      await supabase.from('funnel_steps').delete().eq('funnel_id', selectedFunnel.id)

      // 2. Insert nodes as funnel_steps
      const stepsPayload = nodes.map((n, i) => ({
        id: stableIdMap[n.id],
        funnel_id: selectedFunnel.id,
        node_type: n.type || 'text',
        type: ['text', 'audio', 'image', 'video'].includes(n.type || '') ? n.type : 'text',
        pos_x: n.position.x,
        pos_y: n.position.y,
        content: (n.data as any).content || (n.data as any).url || '',
        delay_seconds: (n.data as any).delay_seconds || 0,
        wait_for_reply: (n.data as any).wait_for_reply || false,
        node_data: n.data,
        order_index: i,
      }))

      const { error: stepsErr } = await supabase.from('funnel_steps').insert(stepsPayload)
      if (stepsErr) throw stepsErr

      // 3. Insert edges
      if (edges.length > 0) {
        const edgesPayload = edges.map(e => ({
          funnel_id: selectedFunnel.id,
          source_node_id: stableIdMap[e.source] || e.source,
          target_node_id: stableIdMap[e.target] || e.target,
          source_handle: e.sourceHandle || 'default',
        }))
        const { error: edgesErr } = await supabase.from('funnel_edges').insert(edgesPayload)
        if (edgesErr) throw edgesErr
      }

      toast.success('Funil salvo com sucesso! 🎉')
      await loadFunnel() // reload to get real DB ids
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao salvar: ${err.message}`)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#0d1117', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginRight: 4 }}>ARRASTE:</span>
        {(Object.entries(NC).filter(([t]) => t !== 'start') as [NType, typeof NC.text][]).map(([type, cfg]) => {
          const Icon = cfg.icon
          return (
            <div
              key={type}
              draggable
              onDragStart={e => { e.dataTransfer.setData('application/reactflow', type); e.dataTransfer.effectAllowed = 'move' }}
              onClick={() => addNodeAtCenter(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                background: cfg.bg, border: `1px solid ${cfg.color}50`, borderRadius: 8,
                cursor: 'grab', fontSize: 12, color: cfg.color, fontWeight: 600, userSelect: 'none',
                touchAction: 'none' // Evita que o navegador tente rolar ao arrastar no mobile
              }}>
              <Icon size={12} /> {cfg.label}
            </div>
          )
        })}
        <button onClick={saveFunnel} disabled={saving}
          style={{ marginLeft: 'auto', marginRight: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: 'linear-gradient(135deg,#10b981,#0891b2)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar Funil'}
        </button>
      </div>

      {/* React Flow Canvas */}
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} nodeTypes={nodeTypes}
          onNodeClick={onNodeClick} onPaneClick={onPaneClick}
          fitView fitViewOptions={{ padding: 0.3 }}
          style={{ background: '#050a0e' }}
          deleteKeyCode="Delete"
          defaultEdgeOptions={{ animated: true, style: { stroke: '#10b981', strokeWidth: 2 } }}>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#1e293b" />
          <Controls style={{ button: { background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' } } as any} />
          <MiniMap nodeColor={(n) => NC[(n.type as NType) || 'text']?.color || '#60a5fa'} style={{ background: '#0d1117', border: '1px solid #1e293b' }} />
          {nodes.length === 0 && (
            <Panel position="top-center">
              <div style={{ padding: '16px 28px', background: '#1e293b', border: '1px dashed #334155', borderRadius: 16, color: '#64748b', textAlign: 'center', marginTop: 120 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🧩</div>
                <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Canvas vazio</div>
                <div style={{ fontSize: 13 }}>Arraste blocos da barra acima para começar a construir seu funil</div>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Node Editor Panel */}
        {selectedNode && (
          <NodeEditor
            node={selectedNode}
            onChange={updateNodeData}
            onDelete={deleteSelectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selected, setSelected] = useState<Funnel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadFunnels() }, [])

  async function loadFunnels() {
    const { data } = await supabase.from('funnels').select('*').order('created_at', { ascending: false })
    if (data) { setFunnels(data); if (data.length > 0 && !selected) setSelected(data[0]) }
    setLoading(false)
  }

  async function createFunnel() {
    const name = prompt('Nome do Funil:')
    if (!name) return
    const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
    if (!user) return
    const { data, error } = await supabase.from('funnels').insert({ name, user_id: user.id }).select().single()
    if (error) { toast.error('Erro ao criar funil'); return }
    setFunnels([data, ...funnels])
    setSelected(data)
    toast.success('Funil criado!')
  }

  async function toggleDefault(f: Funnel) {
    const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
    if (!user) return
    if (!f.is_default) {
      await supabase.from('funnels').update({ is_default: false }).eq('user_id', user.id)
    }
    await supabase.from('funnels').update({ is_default: !f.is_default }).eq('id', f.id)
    loadFunnels()
    toast.success(f.is_default ? 'Padrão removido' : 'Funil definido como padrão ⭐')
  }

  async function deleteFunnel(f: Funnel) {
    if (!confirm(`Excluir "${f.name}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('funnels').delete().eq('id', f.id)
    setFunnels(funnels.filter(x => x.id !== f.id))
    if (selected?.id === f.id) setSelected(null)
    toast.success('Funil excluído')
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Left Sidebar ── */}
      <div style={{ width: 260, background: '#0d1117', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, color: '#f1f5f9', fontSize: 16 }}>Funis de Venda</h2>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>Automações do WhatsApp</p>
            </div>
            <button onClick={createFunnel}
              style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#10b981,#0891b2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Carregando...</div>
          ) : funnels.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🗂️</div>
              Nenhum funil ainda.<br />Clique em + para criar.
            </div>
          ) : (
            funnels.map(f => (
              <div key={f.id}
                onClick={() => setSelected(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                  background: selected?.id === f.id ? 'rgba(16,185,129,0.12)' : 'transparent',
                  border: `1px solid ${selected?.id === f.id ? '#10b98140' : 'transparent'}`,
                  transition: 'all 0.15s',
                }}>
                {f.is_default && <Star size={12} style={{ color: '#facc15', flexShrink: 0, fill: '#facc15' }} />}
                <span style={{ flex: 1, fontSize: 13, fontWeight: selected?.id === f.id ? 700 : 500, color: selected?.id === f.id ? '#10b981' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <div style={{ display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s' }} className="funnel-actions">
                  <button onClick={e => { e.stopPropagation(); toggleDefault(f) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: f.is_default ? '#facc15' : '#64748b' }}>
                    <Star size={12} fill={f.is_default ? '#facc15' : 'none'} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteFunnel(f) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#f87171' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info box */}
        <div style={{ padding: 14, borderTop: '1px solid #1e293b' }}>
          <div style={{ padding: '10px 12px', background: '#10b98110', border: '1px solid #10b98130', borderRadius: 10 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#10b981', lineHeight: 1.6 }}>
              ⭐ <strong>Funil Padrão</strong> é enviado automaticamente para novos contatos.<br /><br />
              🔗 Conecte blocos arrastando do ponto de saída (●) para a entrada.
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Canvas ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <ReactFlowProvider>
            <FunnelCanvas selectedFunnel={selected} onFunnelUpdate={f => setFunnels(fns => fns.map(x => x.id === f.id ? f : x))} />
          </ReactFlowProvider>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: 16 }}>
            <div style={{ fontSize: 56 }}>🧩</div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, color: '#94a3b8', fontSize: 20, fontWeight: 700 }}>Selecione um Funil</h3>
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>Escolha um funil na lateral ou crie um novo</p>
            </div>
            <button onClick={createFunnel}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'linear-gradient(135deg,#10b981,#0891b2)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              <Plus size={16} /> Novo Funil
            </button>
          </div>
        )}
      </div>

      <style>{`
        .funnel-actions { opacity: 0 }
        div:hover > .funnel-actions { opacity: 1 !important }
        .react-flow__node { cursor: pointer }
        .react-flow__node.selected { filter: none }
        .react-flow__controls button { background: #1e293b !important; border-color: #334155 !important; color: #94a3b8 !important; }
        .react-flow__controls button:hover { background: #334155 !important; }
        .react-flow__minimap { border: 1px solid #1e293b !important; border-radius: 10px !important; }
      `}</style>
    </div>
  )
}

