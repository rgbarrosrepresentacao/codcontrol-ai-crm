import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature') as string

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (err: any) {
        console.error('Webhook signature verification failed.', err.message)
        return NextResponse.json({ error: err.message }, { status: 400 })
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as any
                const userId = session.client_reference_id
                const subscriptionId = session.subscription
                const customerId = session.customer

                // Retrieve subscription to get current price mapping
                const subscription = await stripe.subscriptions.retrieve(subscriptionId)
                const priceId = subscription.items.data[0].price.id

                // Fetch plan from DB using stripe_price_id
                const { data: plan } = await supabase.from('plans').select('id').eq('stripe_price_id', priceId).single()

                if (userId && plan) {
                    await supabase.from('profiles').update({
                        plan_id: plan.id,
                        stripe_customer_id: customerId,
                        stripe_subscription_id: subscriptionId,
                        stripe_subscription_status: 'active'
                    }).eq('id', userId)
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as any
                const stripeSubscriptionId = subscription.id
                const status = subscription.status
                const priceId = subscription.items.data[0].price.id

                const { data: plan } = await supabase.from('plans').select('id').eq('stripe_price_id', priceId).single()

                if (plan) {
                    await supabase.from('profiles').update({
                        plan_id: plan.id,
                        stripe_subscription_status: status
                    }).eq('stripe_subscription_id', stripeSubscriptionId)
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as any
                const stripeSubscriptionId = subscription.id

                // Handle cancellation by reverting to free/basic plan or nulling
                const { data: basicPlan } = await supabase.from('plans').select('id').eq('slug', 'basico').single()

                await supabase.from('profiles').update({
                    plan_id: basicPlan?.id || null,
                    stripe_subscription_status: 'canceled'
                }).eq('stripe_subscription_id', stripeSubscriptionId)

                break;
            }
        }

        return NextResponse.json({ received: true })
    } catch (err: any) {
        console.error('Webhook handler failed:', err)
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
    }
}
