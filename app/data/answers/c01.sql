WITH order_grain AS (
  SELECT
    o.order_id,
    o.user_id,
    MAX(o.amount) AS order_amount
  FROM orders AS o
  JOIN order_items AS oi
    ON oi.order_id = o.order_id
  WHERE o.order_time >= '2026-10-01'
    AND o.order_time < '2026-11-01'
    AND o.status = 'paid'
  GROUP BY o.order_id, o.user_id
)
SELECT
  user_id,
  SUM(order_amount) AS paid_total_amount
FROM order_grain
GROUP BY user_id
ORDER BY user_id ASC
