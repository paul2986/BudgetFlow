
-- Drop existing policies
DROP POLICY IF EXISTS "Users can only see their own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can only update their own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can only insert their own data" ON public.user_data;

-- Recreate policies with optimized auth.uid() calls wrapped in subquery
-- This prevents re-evaluation of auth.uid() for each row
CREATE POLICY "Users can only see their own data" 
ON public.user_data 
FOR SELECT 
TO public 
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can only update their own data" 
ON public.user_data 
FOR UPDATE 
TO public 
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can only insert their own data" 
ON public.user_data 
FOR INSERT 
TO public 
WITH CHECK ((select auth.uid()) = user_id);
