-- Atualiza/cria o usuario inicial da Spartan Nutrition.
DO $$
DECLARE
  admin_email TEXT := 'spartan@spartan-nutrition.app';
  admin_password TEXT := '0101';
  existing_user_id UUID;
  new_user_id UUID := gen_random_uuid();
BEGIN
  SELECT id INTO existing_user_id
  FROM auth.users
  WHERE email IN ('spartan@spartan-nutrition.app', 'admin@spartan-nutrition.app')
  ORDER BY email = admin_email DESC
  LIMIT 1;

  IF existing_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id, 'authenticated', 'authenticated', admin_email,
      crypt(admin_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"spartan"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', admin_email),
      'email', admin_email, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET
      email = admin_email,
      encrypted_password = crypt(admin_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"username":"spartan"}'::jsonb,
      updated_at = now()
    WHERE id = existing_user_id;

    UPDATE auth.identities
    SET
      provider_id = admin_email,
      identity_data = jsonb_set(
        jsonb_set(identity_data, '{email}', to_jsonb(admin_email)),
        '{sub}', to_jsonb(existing_user_id::text)
      ),
      updated_at = now()
    WHERE user_id = existing_user_id
      AND provider = 'email';

    IF NOT FOUND THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), existing_user_id,
        jsonb_build_object('sub', existing_user_id::text, 'email', admin_email),
        'email', admin_email, now(), now(), now()
      );
    END IF;
  END IF;
END $$;
