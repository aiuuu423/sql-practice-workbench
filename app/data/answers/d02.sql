SELECT
  user_id,
  COUNT(*) AS paid_order_count,
  SUM(amount) AS paid_total_amount
FROM orders
WHERE order_time >= '2026-10-01'
  AND order_time < '2026-11-01'
  AND status = 'paid'
GROUP BY user_id
HAVING COUNT(*) >= 2
  AND SUM(amount) >= 500
ORDER BY paid_total_amount DESC, user_id ASC
