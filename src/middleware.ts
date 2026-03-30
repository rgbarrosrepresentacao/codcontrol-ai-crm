import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    const response = NextResponse.next()

    try {
        // Cria cliente Supabase que lê/escreve cookies da request
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options)
                        })
                    },
                },
            }
        )

        // Verifica a sessão com o servidor (valida de verdade)
        const { data: { session }, error } = await supabase.auth.getSession()

        // Se deu erro na sessão (corrompida/expirada), limpa os cookies e deixa passar
        if (error) {
            const clearResponse = pathname.startsWith('/dashboard')
                ? NextResponse.redirect(new URL('/login', request.url))
                : NextResponse.next()

            // Apaga todos os cookies de auth do Supabase
            request.cookies.getAll().forEach(cookie => {
                if (cookie.name.includes('sb-') && cookie.name.includes('-auth-token')) {
                    clearResponse.cookies.delete(cookie.name)
                }
            })
            return clearResponse
        }

        const hasValidSession = !!session

        // Sem sessão → protege o dashboard
        if (!hasValidSession && pathname.startsWith('/dashboard')) {
            const loginUrl = new URL('/login', request.url)
            loginUrl.searchParams.set('from', pathname)
            return NextResponse.redirect(loginUrl)
        }

        // Com sessão válida → não deixa acessar login/register
        if (hasValidSession && (pathname === '/login' || pathname === '/register')) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

    } catch {
        // Se qualquer erro acontecer, redireciona para login de forma segura
        if (pathname.startsWith('/dashboard')) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    return response
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/login',
        '/register',
    ],
}
