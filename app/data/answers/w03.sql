WITH ranked_orders AS (
  SELECT
    o.*,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY order_time DESC, order_id DESC
    ) AS rn
  FROM orders AS o
)
SELECT
  user_id,
  order_id,
  order_time,
  amount,
  status
FROM ranked_orders
WHERE rn = 1
ORDER BY user_id ASC
