-- Add policy to allow users to delete their own pending payments
CREATE POLICY "Users can delete own pending payments"
ON public.payments
FOR DELETE
USING (created_by = auth.uid() AND status = 'pending'::payment_status);