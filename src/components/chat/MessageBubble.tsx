'use client'
import { useRef, useState, useEffect } from 'react'
import { Bot, Mic, AlertCircle, Play, Pause, Download, FileText, Film } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
    id: string
    content: string
    from_me: boolean
    ai_generated: boolean
    type: string
    created_at: string
    status: string
    payload?: {
        audioUrl?: string
        [key: string]: any
    }
}

interface Props {
    msg: Message
    showDate: boolean
    prevMsg?: Message | null
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

function MsgTime({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    const isSending = msg.status === 'sending'
    const isSent = msg.status === 'sent' || msg.status === 'delivered'
    const isRead = msg.status === 'read'
    const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    return (
        <div className={cn(
            'flex items-center gap-1.5 shrink-0 select-none',
            isMe ? 'text-primary-foreground/60' : 'text-muted-foreground/60'
        )}>
            <span className="text-[10px] font-medium tracking-tight">
                {isSending ? '...' : time}
            </span>
            {isMe && (
                <div className="flex items-center gap-1">
                    {msg.status === 'failed' ? (
                        <div className="flex items-center gap-1 bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-[10px] font-bold">
                            <AlertCircle className="w-3 h-3" />
                            <span>Falhou</span>
                        </div>
                    ) : isSending ? (
                        <div className="w-2 h-2 border-2 border-primary-foreground/30 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <div className="flex -space-x-1">
                                <span className={cn("text-[10px] font-bold", isRead ? "text-blue-400" : "opacity-40")}>✓</span>
                                {(isSent || isRead) && (
                                    <span className={cn("text-[10px] font-bold", isRead ? "text-blue-400" : "opacity-40")}>✓</span>
                                )}
                            </div>
                            {msg.ai_generated && <Bot className="w-2.5 h-2.5 opacity-70" />}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Date Divider ──────────────────────────────────────────────────────────────

function DateDivider({ date }: { date: string }) {
    const d = new Date(date)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    let label: string
    if (d.toDateString() === now.toDateString()) {
        label = 'Hoje'
    } else if (d.toDateString() === yesterday.toDateString()) {
        label = 'Ontem'
    } else {
        label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
        label = label.charAt(0).toUpperCase() + label.slice(1)
    }

    return (
        <div className="flex justify-center my-8 sticky top-4 z-10 pointer-events-none">
            <span className="bg-background/85 backdrop-blur-md px-5 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 border border-border/40 shadow-sm shadow-black/5 ring-1 ring-black/5">
                {label}
            </span>
        </div>
    )
}

// ── Audio bubble ──────────────────────────────────────────────────────────────
// WhatsApp-style player: play/pause, progress bar, time, error state.
// Resolves audio URL priority: payload.audioUrl > content (if https) > null.

function AudioBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me

    // Resolve the best available URL: payload.audioUrl first, then content if it looks like a URL
    const resolvedUrl = msg.payload?.audioUrl
        || (msg.content?.startsWith('http') ? msg.content : null)
        || (msg.content?.startsWith('blob:') ? msg.content : null)

    const audioRef = useRef<HTMLAudioElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [hasError, setHasError] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        const el = audioRef.current
        if (!el) return
        const onTime = () => setCurrentTime(el.currentTime)
        const onLoad = () => { setDuration(el.duration); setIsLoaded(true) }
        const onEnded = () => setIsPlaying(false)
        const onError = () => setHasError(true)
        el.addEventListener('timeupdate', onTime)
        el.addEventListener('loadedmetadata', onLoad)
        el.addEventListener('ended', onEnded)
        el.addEventListener('error', onError)
        return () => {
            el.removeEventListener('timeupdate', onTime)
            el.removeEventListener('loadedmetadata', onLoad)
            el.removeEventListener('ended', onEnded)
            el.removeEventListener('error', onError)
        }
    }, [resolvedUrl])

    const togglePlay = () => {
        const el = audioRef.current
        if (!el) return
        if (isPlaying) {
            el.pause()
        } else {
            el.play().catch(() => setHasError(true))
        }
        setIsPlaying(p => !p)
    }

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const el = audioRef.current
        if (!el) return
        const t = parseFloat(e.target.value)
        el.currentTime = t
        setCurrentTime(t)
    }

    const fmt = (s: number) => {
        if (!isFinite(s)) return '0:00'
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm',
            isMe
                ? 'bg-primary text-primary-foreground rounded-br-none'
                : 'bg-card text-foreground border border-border/50 rounded-bl-none'
        )} style={{ minWidth: '260px', maxWidth: '340px' }}>
            {/* Hidden audio element */}
            {resolvedUrl && (
                <audio ref={audioRef} src={resolvedUrl} preload="metadata" className="hidden" />
            )}

            {/* Play/Pause button */}
            <button
                onClick={togglePlay}
                disabled={!resolvedUrl || hasError}
                className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner transition-all',
                    isMe
                        ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 disabled:opacity-40'
                        : 'bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40'
                )}
            >
                {hasError ? (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                ) : isPlaying ? (
                    <Pause className="w-4 h-4" />
                ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                )}
            </button>

            {/* Waveform / progress */}
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {hasError ? (
                    <p className="text-[11px] opacity-60">Áudio indisponível</p>
                ) : (
                    <>
                        <div className="relative w-full">
                            <div className={cn(
                                'w-full h-1 rounded-full',
                                isMe ? 'bg-primary-foreground/20' : 'bg-border'
                            )}>
                                <div
                                    className="h-full rounded-full bg-current transition-all"
                                    style={{ width: `${progress}%`, opacity: 0.7 }}
                                />
                            </div>
                            <input
                                type="range"
                                min="0"
                                max={duration || 0}
                                step="0.1"
                                value={currentTime}
                                onChange={handleSeek}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <Mic className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
                            <span className="text-[10px] opacity-60 tabular-nums">
                                {isLoaded ? fmt(currentTime) : '0:00'} / {isLoaded ? fmt(duration) : '—'}
                            </span>
                        </div>
                    </>
                )}
            </div>

            <MsgTime msg={msg} />
        </div>
    )
}

// ── Image bubble ──────────────────────────────────────────────────────────────

function ImageBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    const [hasError, setHasError] = useState(false)
    return (
        <div className={cn(
            'rounded-2xl overflow-hidden shadow-md border-2',
            isMe ? 'rounded-br-none border-primary' : 'rounded-bl-none border-border/30 bg-card'
        )} style={{ maxWidth: '320px' }}>
            {hasError ? (
                <div className={cn(
                    'flex flex-col items-center justify-center gap-2 p-8',
                    isMe ? 'bg-primary/20' : 'bg-secondary/50'
                )}>
                    <AlertCircle className="w-8 h-8 opacity-40" />
                    <p className="text-xs opacity-60">Imagem indisponível</p>
                </div>
            ) : (
                <img
                    src={msg.content}
                    alt="Imagem"
                    className="w-full h-auto object-cover cursor-zoom-in hover:brightness-95 transition-all"
                    style={{ maxHeight: '400px' }}
                    onClick={() => window.open(msg.content, '_blank')}
                    onError={() => setHasError(true)}
                />
            )}
            <div className={cn(
                'px-3 py-2 flex justify-end items-center gap-2',
                isMe ? 'bg-primary/95 text-primary-foreground' : 'bg-card text-muted-foreground'
            )}>
                <MsgTime msg={msg} />
            </div>
        </div>
    )
}

// ── Video bubble ──────────────────────────────────────────────────────────────

function VideoBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    const [hasError, setHasError] = useState(false)
    return (
        <div className={cn(
            'rounded-2xl overflow-hidden shadow-md border-2',
            isMe ? 'rounded-br-none border-primary' : 'rounded-bl-none border-border/30 bg-card'
        )} style={{ maxWidth: '340px' }}>
            {hasError ? (
                <div className={cn(
                    'flex flex-col items-center justify-center gap-2 p-8',
                    isMe ? 'bg-primary/20' : 'bg-secondary/50'
                )}>
                    <Film className="w-8 h-8 opacity-40" />
                    <p className="text-xs opacity-60">Vídeo indisponível</p>
                    {msg.content?.startsWith('http') && (
                        <a
                            href={msg.content}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline opacity-60 hover:opacity-100"
                        >
                            Abrir link
                        </a>
                    )}
                </div>
            ) : (
                <video
                    src={msg.content}
                    controls
                    className="w-full h-auto"
                    style={{ maxHeight: '380px' }}
                    onError={() => setHasError(true)}
                />
            )}
            <div className={cn(
                'px-3 py-2 flex justify-end items-center gap-2',
                isMe ? 'bg-primary/95 text-primary-foreground' : 'bg-card text-muted-foreground'
            )}>
                <MsgTime msg={msg} />
            </div>
        </div>
    )
}

// ── Document bubble ───────────────────────────────────────────────────────────

function DocumentBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    const raw = msg.content?.split('/').pop()?.split('?')[0] || 'Documento'
    const filename = decodeURIComponent(raw).slice(0, 40) + (raw.length > 40 ? '…' : '')

    return (
        <a
            href={msg.content}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all hover:opacity-85 shadow-sm',
                isMe
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-secondary/80 border border-border/40 rounded-bl-none'
            )}
            style={{ maxWidth: '280px' }}
        >
            <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                isMe ? 'bg-primary-foreground/15' : 'bg-primary/10'
            )}>
                <FileText className="w-5 h-5 opacity-70" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{filename}</p>
                <p className={cn(
                    'text-[10px] mt-0.5 flex items-center gap-1',
                    isMe ? 'text-primary-foreground/55' : 'text-muted-foreground'
                )}>
                    <Download className="w-2.5 h-2.5" />
                    Abrir documento
                </p>
            </div>
            <MsgTime msg={msg} />
        </a>
    )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function MessageBubble({ msg, showDate, prevMsg }: Props) {
    const isMe = msg.from_me
    const isSending = msg.status === 'sending'

    // Group: same sender as previous, within 3 min
    const sameGroup = prevMsg &&
        prevMsg.from_me === msg.from_me &&
        (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 3 * 60_000

    const marginTop = sameGroup ? 'mt-1' : 'mt-5'

    // Audio: type=audio, or type=video with .webm content (webm audio from recorder)
    const isAudio = msg.type === 'audio'
        || (msg.type === 'video' && (msg.content?.includes('.webm') || msg.content?.startsWith('blob:')))
        || !!(msg.payload?.audioUrl)

    const isVideo = msg.type === 'video' && !isAudio
    const isImage = msg.type === 'image'
    const isDocument = msg.type === 'document'
    const isText = !isAudio && !isVideo && !isImage && !isDocument

    return (
        <>
            {showDate && <DateDivider date={msg.created_at} />}

            <div className={cn(
                'flex w-full px-4 md:px-8',
                isMe ? 'justify-end' : 'justify-start',
                marginTop
            )}>
                <div className={cn(
                    'group relative transition-all duration-300 ease-out max-w-[85%] md:max-w-[65%] msg-enter',
                    isSending ? 'opacity-70 scale-[0.98]' : 'opacity-100 scale-100'
                )}>
                    {/* Visual Tail (only on first message of group) */}
                    {!sameGroup && (
                        <div className={cn(
                            "absolute top-0 w-3 h-3",
                            isMe
                                ? "right-[-6px] bg-primary rounded-bl-full"
                                : "left-[-6px] bg-card border-l border-t border-border/40 rounded-br-full"
                        )} />
                    )}

                    {/* ── Audio ── */}
                    {isAudio && <AudioBubble msg={msg} />}

                    {/* ── Image ── */}
                    {isImage && <ImageBubble msg={msg} />}

                    {/* ── Video ── */}
                    {isVideo && <VideoBubble msg={msg} />}

                    {/* ── Document ── */}
                    {isDocument && <DocumentBubble msg={msg} />}

                    {/* ── Text (default) ── */}
                    {isText && (
                        <div
                            className={cn(
                                'relative px-5 py-3.5 shadow-sm transition-shadow hover:shadow-md',
                                msg.status === 'failed' && isMe
                                    ? 'bg-destructive/10 text-destructive border-destructive/20 border rounded-2xl rounded-tr-none'
                                    : isMe
                                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-none'
                                        : 'bg-card text-foreground border border-border/40 rounded-2xl rounded-tl-none shadow-black/5'
                            )}
                        >
                            <p className="text-[14.5px] leading-[1.6] whitespace-pre-wrap break-words tracking-tight font-medium">
                                {msg.content}
                            </p>
                            <div className="flex items-center justify-end mt-1">
                                <MsgTime msg={msg} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
