SELECT
  order_id,
  user_id,
  amount,
  SUM(amount) OVER (PARTITION BY user_id) AS user_paid_total
FROM orders
WHERE status = 'paid'
ORDER BY user_id ASC, order_time ASC, order_id ASC
