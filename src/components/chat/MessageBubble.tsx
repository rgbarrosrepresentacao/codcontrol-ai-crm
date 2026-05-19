'use client'
import { Bot, UserCheck, Mic, AlertCircle } from 'lucide-react'
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
        audioUrl?: string;
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

function AudioBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    return (
        <div className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm',
            isMe
                ? 'bg-primary text-primary-foreground rounded-br-none'
                : 'bg-card text-foreground border border-border/50 rounded-bl-none'
        )} style={{ minWidth: '240px', maxWidth: '320px' }}>
            <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner',
                isMe ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary'
            )}>
                <Mic className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                <audio src={msg.payload?.audioUrl || msg.content} controls className="h-8 w-full filter drop-shadow-sm" />
            </div>
            <MsgTime msg={msg} />
        </div>
    )
}

// ── Image bubble ──────────────────────────────────────────────────────────────

function ImageBubble({ msg }: { msg: Message }) {
    const isMe = msg.from_me
    return (
        <div className={cn(
            'rounded-2xl overflow-hidden shadow-md border-2',
            isMe ? 'rounded-br-none border-primary' : 'rounded-bl-none border-border/30 bg-card'
        )} style={{ maxWidth: '320px' }}>
            <img
                src={msg.content}
                alt="Imagem"
                className="w-full h-auto object-cover cursor-zoom-in hover:brightness-95 transition-all"
                style={{ maxHeight: '400px' }}
                onClick={() => window.open(msg.content, '_blank')}
            />
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
    const isVideo = msg.type === 'video'

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
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl',
                isMe ? 'bg-primary-foreground/15' : 'bg-primary/10'
            )}>
                {isVideo ? '🎬' : '📄'}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{filename}</p>
                <p className={cn(
                    'text-[10px] mt-0.5',
                    isMe ? 'text-primary-foreground/55' : 'text-muted-foreground'
                )}>
                    {isVideo ? 'Vídeo · abrir' : 'Documento · abrir'}
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

    // Spacing: tighter inside a group, more space between groups
    const marginTop = sameGroup ? 'mt-1' : 'mt-5'
    const isActuallyAudio = msg.type === 'audio' || (msg.type === 'video' && msg.content?.includes('.webm'))

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
                    {isActuallyAudio && <AudioBubble msg={msg} />}

                    {/* ── Image ── */}
                    {msg.type === 'image' && !isActuallyAudio && <ImageBubble msg={msg} />}

                    {/* ── Document / Video ── */}
                    {((msg.type === 'document' || msg.type === 'video') && !isActuallyAudio) && <DocumentBubble msg={msg} />}

                    {/* ── Text (default) ── */}
                    {(msg.type === 'text' || (!['audio', 'image', 'document', 'video'].includes(msg.type) && !isActuallyAudio)) ? (
                        <div
                            className={cn(
                                'relative px-5 py-3.5 shadow-sm transition-shadow hover:shadow-md',
                                msg.status === 'failed' && isMe ? 'bg-destructive/10 text-destructive border-destructive/20 border rounded-2xl rounded-tr-none' : 
                                isMe
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
                    ) : null}
                </div>
            </div>
        </>
    )
}
