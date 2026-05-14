'use client'
import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Trash2, Send, Play, Pause, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    onSend: (blob: Blob) => void
    onCancel: () => void
}

export default function AudioRecorder({ onSend, onCancel }: Props) {
    const [isRecording, setIsRecording] = useState(false)
    const [duration, setDuration] = useState(0)
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isSending, setIsSending] = useState(false)
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    // Start recording
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = MediaRecorder.isTypeSupported('audio/mp4') 
                ? 'audio/mp4' 
                : MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
                    ? 'audio/ogg; codecs=opus'
                    : 'audio/webm'

            const recorder = new MediaRecorder(stream, { mimeType })
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }
 
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType })
                setAudioBlob(blob)
                chunksRef.current = []
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorderRef.current = recorder
            chunksRef.current = []
            recorder.start()
            setIsRecording(true)
            
            setDuration(0)
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1)
            }, 1000)
        } catch (err) {
            console.error('Falha ao acessar microfone:', err)
            onCancel()
        }
    }

    // Stop recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }

    // Effect to start recording on mount
    useEffect(() => {
        startRecording()
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop()
            }
        }
    }, [])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const togglePlayback = () => {
        if (!audioRef.current || !audioBlob) return
        if (isPlaying) {
            audioRef.current.pause()
        } else {
            audioRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }

    const handleSend = async () => {
        if (!audioBlob) return
        setIsSending(true)
        await onSend(audioBlob)
        setIsSending(false)
    }

    const handleCancel = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
        if (timerRef.current) clearInterval(timerRef.current)
        onCancel()
    }

    return (
        <div className="flex items-center gap-4 bg-secondary/30 rounded-2xl px-4 py-2 flex-1 animate-in fade-in slide-in-from-bottom-2">
            {!audioBlob ? (
                // Recording state
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-medium tabular-nums">{formatTime(duration)}</span>
                        <div className="flex gap-1 items-end h-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div 
                                    key={i} 
                                    className="w-0.5 bg-primary rounded-full animate-bounce" 
                                    style={{ 
                                        height: `${Math.random() * 100}%`,
                                        animationDuration: `${0.5 + Math.random()}s`,
                                        animationDelay: `${i * 0.1}s`
                                    }} 
                                />
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleCancel}
                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={stopRecording}
                            className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-lg"
                        >
                            <Square className="w-5 h-5 fill-current" />
                        </button>
                    </div>
                </div>
            ) : (
                // Preview state
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 flex-1">
                        <button 
                            onClick={togglePlayback}
                            className="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors"
                        >
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>
                        <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-0" />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{formatTime(duration)}</span>
                        <audio 
                            ref={audioRef} 
                            src={URL.createObjectURL(audioBlob)} 
                            onEnded={() => setIsPlaying(false)}
                            className="hidden" 
                        />
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                        <button 
                            onClick={handleCancel}
                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleSend}
                            disabled={isSending}
                            className="p-3 bg-primary text-white rounded-full hover:opacity-90 transition-all shadow-lg glow-primary disabled:opacity-50"
                        >
                            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
