-- Create funnels table
CREATE TABLE IF NOT EXISTS public.funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create funnel_steps table
CREATE TABLE IF NOT EXISTS public.funnel_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'audio', 'video', 'image')),
    content TEXT, -- message body or media URL
    delay_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add funnel columns to contacts
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS current_funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS funnel_step_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_funnel_active BOOLEAN DEFAULT false;

-- Add RLS policies
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own funnels" ON public.funnels
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own funnel steps" ON public.funnel_steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.funnels f 
            WHERE f.id = funnel_id AND f.user_id = auth.uid()
        )
    );
