-- Fix "statement timeout" on draft_version_comments RLS policies.
-- The client policy does a 3-table JOIN (draft_version_comments → content_draft_versions
-- → content_drafts → clients) on every row scan. Without indexes this is O(n) per row.

-- Indexes on FK columns used in the RLS join chain
CREATE INDEX IF NOT EXISTS idx_cdv_draft_id         ON content_draft_versions(draft_id);
CREATE INDEX IF NOT EXISTS idx_cdv_id               ON content_draft_versions(id);
CREATE INDEX IF NOT EXISTS idx_cd_client_id         ON content_drafts(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_profile_id   ON clients(profile_id);
CREATE INDEX IF NOT EXISTS idx_dvc_version_id       ON draft_version_comments(version_id);
CREATE INDEX IF NOT EXISTS idx_dvc_author_id        ON draft_version_comments(author_id);

-- Simplify the client RLS policies to use a faster correlated path.
-- Instead of a full 3-table JOIN for every row, check membership through
-- a single indexed lookup on content_draft_versions + content_drafts.

DROP POLICY IF EXISTS "clients manage draft_comments" ON draft_version_comments;
CREATE POLICY "clients manage draft_comments" ON draft_version_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM content_draft_versions cdv
      JOIN content_drafts cd ON cd.id = cdv.draft_id
      JOIN clients cl       ON cl.id  = cd.client_id
      WHERE cdv.id = draft_version_comments.version_id
        AND cl.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM content_draft_versions cdv
      JOIN content_drafts cd ON cd.id = cdv.draft_id
      JOIN clients cl       ON cl.id  = cd.client_id
      WHERE cdv.id = draft_version_comments.version_id
        AND cl.profile_id = auth.uid()
    )
  );

-- Same fix for client draft_version access
DROP POLICY IF EXISTS "clients view own draft_versions" ON content_draft_versions;
CREATE POLICY "clients view own draft_versions" ON content_draft_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM content_drafts cd
      JOIN clients cl ON cl.id = cd.client_id
      WHERE cd.id = content_draft_versions.draft_id
        AND cl.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "clients update own draft_versions" ON content_draft_versions;
CREATE POLICY "clients update own draft_versions" ON content_draft_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM content_drafts cd
      JOIN clients cl ON cl.id = cd.client_id
      WHERE cd.id = content_draft_versions.draft_id
        AND cl.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM content_drafts cd
      JOIN clients cl ON cl.id = cd.client_id
      WHERE cd.id = content_draft_versions.draft_id
        AND cl.profile_id = auth.uid()
    )
  );

-- Team (creative/editor/admin/team_lead) can manage draft versions and comments
DROP POLICY IF EXISTS "team manage draft_versions" ON content_draft_versions;
CREATE POLICY "team manage draft_versions" ON content_draft_versions
  FOR ALL TO authenticated
  USING  (EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('creative','editor','admin','team_lead')))
  WITH CHECK (EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('creative','editor','admin','team_lead')));

DROP POLICY IF EXISTS "team manage draft_comments" ON draft_version_comments;
CREATE POLICY "team manage draft_comments" ON draft_version_comments
  FOR ALL TO authenticated
  USING  (EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('creative','editor','admin','team_lead')))
  WITH CHECK (EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('creative','editor','admin','team_lead')));
