BEGIN;

CREATE OR REPLACE FUNCTION safestart_resolve_invited_identity(
  p_issuer text,
  p_subject text,
  p_email text,
  p_full_name text
)
RETURNS TABLE(user_id uuid, email text, full_name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user identity_users%ROWTYPE;
  v_invite organization_invitations%ROWTYPE;
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL THEN
    RAISE EXCEPTION 'verified identity must contain issuer and subject';
  END IF;

  SELECT u.* INTO v_user
    FROM identity_logins l
    JOIN identity_users u ON u.id = l.user_id
   WHERE l.issuer = p_issuer
     AND l.subject = p_subject
   LIMIT 1;

  IF FOUND THEN
    IF v_user.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'user account is not active';
    END IF;

    UPDATE identity_logins
       SET last_login_at = now(), email_at_login = COALESCE(p_email, email_at_login)
     WHERE issuer = p_issuer AND subject = p_subject;

    RETURN QUERY SELECT v_user.id, v_user.email, v_user.full_name, v_user.status;
    RETURN;
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'no active SafeStart invitation for this identity';
  END IF;

  SELECT i.* INTO v_invite
    FROM organization_invitations i
   WHERE lower(i.email) = lower(p_email)
     AND i.accepted_at IS NULL
     AND i.revoked_at IS NULL
     AND i.expires_at > now()
   ORDER BY i.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active SafeStart invitation for this email';
  END IF;

  INSERT INTO identity_users (issuer, subject, email, full_name, status)
  VALUES (p_issuer, p_subject, p_email, COALESCE(NULLIF(btrim(p_full_name), ''), p_email), 'ACTIVE')
  RETURNING * INTO v_user;

  INSERT INTO identity_logins (user_id, issuer, subject, provider, email_at_login, last_login_at)
  VALUES (v_user.id, p_issuer, p_subject, 'OIDC', p_email, now());

  INSERT INTO organization_members (organization_id, user_id, role, status)
  VALUES (v_invite.organization_id, v_user.id, v_invite.organization_role, 'ACTIVE')
  ON CONFLICT ON CONSTRAINT organization_members_pkey
  DO UPDATE SET status = 'ACTIVE';

  UPDATE organization_invitations
     SET accepted_at = now()
   WHERE id = v_invite.id;

  RETURN QUERY SELECT v_user.id, v_user.email, v_user.full_name, v_user.status;
END;
$$;

COMMIT;
