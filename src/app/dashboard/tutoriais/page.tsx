import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AcademyClient from './AcademyClient'

export default async function TutoriaisPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: materials } = await supabase
        .from('academy_materials')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <AcademyClient materials={materials || []} />
    )
}
