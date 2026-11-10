SELECT
  user_id,
  city,
  register_time
FROM users
WHERE register_time >= '2026-10-01'
  AND register_time < '2026-11-01'
  AND status = 'active'
  AND city IN ('北京', '上海')
  AND invite_code IS NOT NULL
ORDER BY register_time DESC, user_id ASC
LIMIT 5
