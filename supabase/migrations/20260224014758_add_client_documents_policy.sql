-- Migration for client_documents RLS policies

-- ENABLE RLS
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- Allow users to view documents linked to clients they own
CREATE POLICY "Users can view documents from their clients" ON client_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_documents.client_id
      AND clients.owner_id = auth.uid()
    )
  );

-- Allow users to insert documents linked to clients they own
CREATE POLICY "Users can insert documents for their clients" ON client_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_documents.client_id
      AND clients.owner_id = auth.uid()
    )
  );

-- Allow users to delete documents linked to clients they own
CREATE POLICY "Users can delete documents from their clients" ON client_documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_documents.client_id
      AND clients.owner_id = auth.uid()
    )
  );
