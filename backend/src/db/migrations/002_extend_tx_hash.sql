-- Extend tx_hash column to accommodate longer Kalshi trade IDs
ALTER TABLE trades ALTER COLUMN tx_hash TYPE VARCHAR(255);

