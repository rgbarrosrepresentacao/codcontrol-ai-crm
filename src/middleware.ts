// Middleware simplificado - deixa o Next.js gerenciar cookies normalmente
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    // Apenas verificamos se existe o cookie de sessão do Supabase
    const pathname = request.nextUrl.pathname

    // Checa se há qualquer cookie de auth do Supabase
    const cookies = request.cookies.getAll()
    const hasSession = cookies.some(c =>
        c.name.includes('sb-') && c.name.includes('-auth-token')
    )

    // Se acessar dashboard sem sessão → login
    if (!hasSession && pathname.startsWith('/dashboard')) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('from', pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Se estiver logado e tentar acessar login/register → dashboard
    if (hasSession && (pathname === '/login' || pathname === '/register')) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/login',
        '/register',
    ],
}
