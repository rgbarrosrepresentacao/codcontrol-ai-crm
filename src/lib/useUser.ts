'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// Cache in-memory para evitar múltiplas chamadas ao servidor por página
let cachedUser: User | null | undefined = undefined
let cacheTime = 0
const CACHE_TTL = 30_000 // 30 segundos

export function useUser() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const now = Date.now()
            // Usa cache se ainda for válido (menos de 30s)
            if (cachedUser !== undefined && now - cacheTime < CACHE_TTL) {
                setUser(cachedUser)
                setLoading(false)
                return
            }
            // getUser() é seguro — valida o token com o servidor Auth
            const { data: { user: freshUser } } = await supabase.auth.getUser()
            cachedUser = freshUser
            cacheTime = now
            setUser(freshUser)
            setLoading(false)
        }
        load()

        // Atualiza cache quando auth muda (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            cachedUser = session?.user ?? null
            cacheTime = Date.now()
            setUser(cachedUser)
        })

        return () => subscription.unsubscribe()
    }, [])

    return { user, loading }
}
