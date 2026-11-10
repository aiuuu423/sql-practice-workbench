-- Repeatable MySQL 8.0 schema for the local SQL practice workbench.
DROP DATABASE IF EXISTS sql_practice;
CREATE DATABASE sql_practice
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE sql_practice;

CREATE TABLE users (
  user_id BIGINT UNSIGNED NOT NULL,
  city VARCHAR(50) NULL,
  register_time DATETIME NOT NULL,
  status ENUM('active', 'inactive', 'banned') NOT NULL,
  invite_code VARCHAR(30) NULL,
  PRIMARY KEY (user_id),
  INDEX idx_users_register_status (register_time, status),
  INDEX idx_users_city (city)
) ENGINE = InnoDB;

CREATE TABLE products (
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (product_id),
  INDEX idx_products_category (category)
) ENGINE = InnoDB;

CREATE TABLE orders (
  order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_time DATETIME NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('paid', 'pending', 'cancelled') NOT NULL,
  PRIMARY KEY (order_id),
  CONSTRAINT fk_orders_user
    FOREIGN KEY (user_id) REFERENCES users (user_id),
  INDEX idx_orders_user_time (user_id, order_time),
  INDEX idx_orders_status_time (status, order_time)
) ENGINE = InnoDB;

CREATE TABLE order_items (
  order_item_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  item_amount DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (order_item_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id),
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (product_id),
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_product (product_id)
) ENGINE = InnoDB;

CREATE TABLE content (
  content_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  publish_time DATETIME NOT NULL,
  PRIMARY KEY (content_id),
  CONSTRAINT fk_content_author
    FOREIGN KEY (author_id) REFERENCES users (user_id),
  INDEX idx_content_author_time (author_id, publish_time)
) ENGINE = InnoDB;

CREATE TABLE user_events (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_time DATETIME NOT NULL,
  event_type ENUM('view', 'like', 'comment', 'purchase') NOT NULL,
  content_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_user_events_user
    FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_user_events_content
    FOREIGN KEY (content_id) REFERENCES content (content_id),
  INDEX idx_events_user_time (user_id, event_time),
  INDEX idx_events_type_time (event_type, event_time),
  INDEX idx_events_content (content_id)
) ENGINE = InnoDB;
