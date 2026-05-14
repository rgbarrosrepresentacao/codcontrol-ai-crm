'use client'
import { useState, useRef, useEffect } from 'react'
import {
    Send, Loader2, Paperclip, Mic, Image as ImageIcon,
    FileText, X, Command, Smile, StickyNote
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AudioRecorder from './AudioRecorder'
import { supabase } from '@/lib/supabase'

interface QuickReply {
    id: string
    shortcut: string
    content: string
}

interface Props {
    onSend: (text: string) => void
    onSendMedia: (file: File | Blob, type: string) => Promise<void>
    sending: boolean
    disabled?: boolean
    insertText?: string  // Injected text from LeadPanel snippets
}

// Emoji picker — quick common set, no library needed
const EMOJI_GRID = [
    '😊','😄','🎉','👍','❤️','🔥','✅','💪',
    '🙏','😂','🤔','💡','📱','⭐','🚀','💼',
    '😎','🥳','💰','🎯','📊','💬','🤝','📢',
    '😍','🤩','💎','🌟','✨','🎁','📌','🔑',
]

type InputTab = 'message' | 'note'

export default function MessageInput({ onSend, onSendMedia, sending, disabled, insertText }: Props) {
    const [activeTab, setActiveTab] = useState<InputTab>('message')
    const [text, setText] = useState('')
    const [noteText, setNoteText] = useState('')
    const [showAudioRecorder, setShowAudioRecorder] = useState(false)
    const [showAttachments, setShowAttachments] = useState(false)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [suggestions, setSuggestions] = useState<QuickReply[]>([])
    const [allReplies, setAllReplies] = useState<QuickReply[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const emojiRef = useRef<HTMLDivElement>(null)

    const currentText = activeTab === 'message' ? text : noteText
    const setCurrentText = activeTab === 'message' ? setText : setNoteText
    const MAX_CHARS = 4096
    const charCount = currentText.length
    const nearLimit = charCount > MAX_CHARS * 0.8

    // Load quick replies
    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase
                .from('quick_replies')
                .select('*')
                .eq('user_id', user.id)
            setAllReplies(data || [])
        }
        load()
    }, [])

    // Handle injected text from LeadPanel snippets
    useEffect(() => {
        if (insertText) {
            setText(insertText)
            setActiveTab('message')
            setTimeout(() => {
                textareaRef.current?.focus()
                autoResize()
            }, 100)
        }
    }, [insertText])

    // Close emoji on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
                setShowEmojiPicker(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    function autoResize() {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 140) + 'px'
    }

    function handleKey(e: React.KeyboardEvent) {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => (i + 1) % suggestions.length); return }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); useSuggestion(suggestions[selectedIndex]); return }
            if (e.key === 'Escape') { setShowSuggestions(false); return }
        }
        if (e.key === 'Enter' && !e.shiftKey && activeTab === 'message') {
            e.preventDefault()
            submit()
        }
    }

    function useSuggestion(reply: QuickReply) {
        setText(reply.content)
        setShowSuggestions(false)
        setTimeout(() => { textareaRef.current?.focus(); autoResize() }, 0)
    }

    function handleTextChange(val: string) {
        setCurrentText(val)
        if (activeTab === 'message' && val.startsWith('/')) {
            const query = val.slice(1).toLowerCase()
            const filtered = allReplies.filter(r =>
                r.shortcut.toLowerCase().includes(query) ||
                r.content.toLowerCase().includes(query)
            )
            setSuggestions(filtered)
            setShowSuggestions(filtered.length > 0)
            setSelectedIndex(0)
        } else {
            setShowSuggestions(false)
        }
    }

    function submit() {
        const trimmed = text.trim()
        if (!trimmed || sending || disabled) return
        onSend(trimmed)
        setText('')
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }

    function insertEmoji(emoji: string) {
        const el = textareaRef.current
        if (!el) { setCurrentText(prev => prev + emoji); return }
        const start = el.selectionStart
        const end = el.selectionEnd
        const newVal = currentText.slice(0, start) + emoji + currentText.slice(end)
        setCurrentText(newVal)
        setShowEmojiPicker(false)
        setTimeout(() => {
            el.focus()
            el.setSelectionRange(start + emoji.length, start + emoji.length)
            autoResize()
        }, 0)
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setShowAttachments(false)
        await onSendMedia(file, file.type)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleAudioSend = async (blob: Blob) => {
        setShowAudioRecorder(false)
        await onSendMedia(blob, 'audio/webm')
    }

    const canSend = text.trim().length > 0 && !sending && !disabled

    return (
        <div className="flex-shrink-0 border-t border-border bg-sidebar/95 backdrop-blur-sm">
            {/* ── Tabs ── */}
            <div className="flex border-b border-border/60">
                <button
                    onClick={() => setActiveTab('message')}
                    className={cn(
                        'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2',
                        activeTab === 'message'
                            ? 'text-primary border-primary'
                            : 'text-muted-foreground border-transparent hover:text-foreground/70'
                    )}
                >
                    <Send className="w-3 h-3" />
                    Mensagem
                </button>
                <button
                    onClick={() => setActiveTab('note')}
                    className={cn(
                        'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2',
                        activeTab === 'note'
                            ? 'text-amber-400 border-amber-400'
                            : 'text-muted-foreground border-transparent hover:text-foreground/70'
                    )}
                >
                    <StickyNote className="w-3 h-3" />
                    Nota Interna
                </button>
            </div>

            {/* ── Note mode notice ── */}
            {activeTab === 'note' && (
                <div className="px-4 py-2 bg-amber-500/8 border-b border-amber-500/15 flex items-center gap-2">
                    <StickyNote className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <p className="text-[11px] text-amber-400 font-medium">
                        Notas internas não são enviadas ao cliente — apenas para sua equipe.
                    </p>
                </div>
            )}

            <div className="px-3 py-3 relative">
                {/* Attachment popup */}
                {showAttachments && (
                    <div className="absolute bottom-full left-3 mb-2 p-2 bg-popover border border-border rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-1 z-50 w-48">
                        <button
                            onClick={() => { fileInputRef.current?.click(); setShowAttachments(false) }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary rounded-xl transition-colors text-sm"
                        >
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-blue-500" />
                            </div>
                            <span className="font-medium">Fotos e Vídeos</span>
                        </button>
                        <button
                            onClick={() => { fileInputRef.current?.click(); setShowAttachments(false) }}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary rounded-xl transition-colors text-sm"
                        >
                            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-purple-500" />
                            </div>
                            <span className="font-medium">Documento</span>
                        </button>
                        <div className="h-px bg-border mx-2 my-0.5" />
                        <button
                            onClick={() => setShowAttachments(false)}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-secondary rounded-xl transition-colors text-xs text-muted-foreground"
                        >
                            <X className="w-3 h-3" />
                            <span>Cancelar</span>
                        </button>
                    </div>
                )}

                {showAudioRecorder ? (
                    <div className="flex items-center gap-2">
                        <AudioRecorder
                            onSend={handleAudioSend}
                            onCancel={() => setShowAudioRecorder(false)}
                        />
                    </div>
                ) : (
                    <div className="flex items-end gap-2">
                        {/* Left icons */}
                        <div className="flex items-center gap-0.5 mb-1.5">
                            {/* Emoji */}
                            <div className="relative" ref={emojiRef}>
                                <button
                                    disabled={disabled}
                                    onClick={() => setShowEmojiPicker(o => !o)}
                                    className={cn(
                                        'p-2 rounded-xl transition-colors disabled:opacity-50',
                                        showEmojiPicker
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                                    )}
                                >
                                    <Smile className="w-5 h-5" />
                                </button>

                                {showEmojiPicker && (
                                    <div className="absolute bottom-full left-0 mb-2 p-3 bg-popover border border-border rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="grid grid-cols-8 gap-1">
                                            {EMOJI_GRID.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    onClick={() => insertEmoji(emoji)}
                                                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-secondary rounded-lg transition-colors"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Attach */}
                            <button
                                disabled={disabled || sending}
                                onClick={() => setShowAttachments(!showAttachments)}
                                className={cn(
                                    'p-2 rounded-xl transition-colors disabled:opacity-50',
                                    showAttachments
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                                )}
                            >
                                <Paperclip className="w-5 h-5" />
                            </button>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            className="hidden"
                            accept="image/*,video/*,audio/*,application/*,text/*"
                        />

                        {/* Textarea container */}
                        <div className="flex-1 relative">
                            {/* Snippet suggestions */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute bottom-full left-0 w-full mb-2 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-50">
                                    <div className="p-2 border-b border-border bg-muted/30 flex items-center gap-2">
                                        <Command className="w-3 h-3 text-primary" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Respostas Rápidas</span>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto">
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={s.id}
                                                onClick={() => useSuggestion(s)}
                                                onMouseEnter={() => setSelectedIndex(i)}
                                                className={cn(
                                                    'w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors border-l-2',
                                                    i === selectedIndex
                                                        ? 'bg-primary/10 border-primary'
                                                        : 'hover:bg-secondary border-transparent'
                                                )}
                                            >
                                                <span className="text-xs font-bold text-primary">/{s.shortcut}</span>
                                                <span className="text-sm text-foreground line-clamp-2">{s.content}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <textarea
                                ref={textareaRef}
                                value={currentText}
                                onChange={e => { handleTextChange(e.target.value); autoResize() }}
                                onKeyDown={handleKey}
                                placeholder={
                                    disabled ? 'Selecione uma conversa...' :
                                    activeTab === 'note' ? 'Escreva uma nota interna...' :
                                    'Digite uma mensagem ou / para atalhos...'
                                }
                                disabled={disabled || sending}
                                rows={1}
                                className={cn(
                                    'w-full border rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 resize-none transition-all disabled:opacity-50',
                                    activeTab === 'note'
                                        ? 'bg-amber-500/5 border-amber-500/20 focus:ring-amber-500/20 focus:border-amber-500/40'
                                        : 'bg-input border-border/70 focus:ring-primary/30 focus:border-primary/50'
                                )}
                                style={{ minHeight: '44px', maxHeight: '140px' }}
                            />

                            {/* Char counter */}
                            {nearLimit && (
                                <div className={cn(
                                    'absolute right-3 bottom-2 text-[10px] font-mono transition-colors',
                                    charCount > MAX_CHARS ? 'text-red-400' : 'text-amber-400'
                                )}>
                                    {charCount}/{MAX_CHARS}
                                </div>
                            )}
                        </div>

                        {/* Right actions */}
                        <div className="flex items-center mb-1.5">
                            {activeTab === 'message' && !text.trim() && !sending && !disabled ? (
                                <button
                                    onClick={() => { setShowAudioRecorder(true); setShowAttachments(false) }}
                                    className="p-2.5 rounded-xl text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                            ) : (
                                <button
                                    onClick={submit}
                                    disabled={activeTab === 'message' ? !canSend : !noteText.trim()}
                                    className={cn(
                                        'p-2.5 rounded-xl flex items-center justify-center transition-all',
                                        activeTab === 'note'
                                            ? (noteText.trim()
                                                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                                                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50')
                                            : (canSend
                                                ? 'gradient-primary text-white hover:opacity-90 shadow-md shadow-primary/20 scale-100 hover:scale-105 active:scale-95'
                                                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50')
                                    )}
                                >
                                    {sending
                                        ? <Loader2 className="w-5 h-5 animate-spin" />
                                        : <Send className="w-5 h-5" />
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Hint */}
                {!showAudioRecorder && (
                    <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                        {activeTab === 'message'
                            ? 'Enter para enviar · Shift+Enter para nova linha · / para atalhos'
                            : 'Nota interna — visível apenas para sua equipe'
                        }
                    </p>
                )}
            </div>
        </div>
    )
}
