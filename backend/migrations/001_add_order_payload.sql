-- Migration 001: add order_payload column to orders table
-- Apply manually: psql $DATABASE_URL -f migrations/001_add_order_payload.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_payload TEXT;
