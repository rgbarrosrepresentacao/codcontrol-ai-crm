import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { priceId } = await req.json()
        if (!priceId) return NextResponse.json({ error: 'Price ID required' }, { status: 400 })

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        let customerId = profile?.stripe_customer_id

        // Create a Stripe customer if none exists
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: profile?.name,
                metadata: {
                    user_id: user.id
                }
            })
            customerId = customer.id
            await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codcontrolpro.bond'

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            line_items: [
                { price: priceId, quantity: 1 }
            ],
            mode: 'subscription',
            success_url: `${baseUrl}/dashboard/planos?success=true`,
            cancel_url: `${baseUrl}/dashboard/planos?canceled=true`,
            client_reference_id: user.id,
        })

        return NextResponse.json({ url: session.url })
    } catch (err: any) {
        console.error('Stripe Checkout Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

