SELECT SUM(order_amount) AS total_order_amount
FROM (
  SELECT o.order_id, MAX(o.amount) AS order_amount
  FROM orders AS o
  JOIN order_items AS oi
    ON oi.order_id = o.order_id
  WHERE o.order_time >= '2026-10-01'
    AND o.order_time < '2026-11-01'
    AND o.status = 'paid'
  GROUP BY o.order_id
) AS paid_orders
