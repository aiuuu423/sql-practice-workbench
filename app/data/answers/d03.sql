SELECT
  u.user_id,
  COUNT(o.order_id) AS paid_order_count
FROM users AS u
LEFT JOIN orders AS o
  ON o.user_id = u.user_id
  AND o.order_time >= '2026-10-01'
  AND o.order_time < '2026-11-01'
  AND o.status = 'paid'
WHERE u.status = 'active'
GROUP BY u.user_id
ORDER BY u.user_id ASC
