CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'tech' CHECK (role IN ('admin', 'tech'))
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "profiles_self" ON profiles;
CREATE POLICY "profiles_self" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select" ON notifications;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Map existing + new users by email
INSERT INTO profiles (id, email, role)
SELECT id, email,
  CASE
    WHEN lower(email) IN (
      'antoine@mecanoalca.ca',
      'bruno@mecanoalca.ca',
      'donald@mecanoalca.ca'
    ) THEN 'admin'
    WHEN lower(email) = 'production@mecanoalca.ca' THEN 'tech'
    ELSE 'admin'
  END
FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role;
