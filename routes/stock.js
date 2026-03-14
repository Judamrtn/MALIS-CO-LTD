const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ========================
// Receive items
// ========================
router.post('/receive', authMiddleware, async (req, res) => {
  const { item_id, category_id, quantity, movement_date, purpose } = req.body;

  if (!item_id || !category_id || !quantity || !movement_date) {
    return res.status(400).json({ error: 'item_id, category_id, quantity, and movement_date are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stock_movements 
        (movement_date, item_id, received, issued, category_id, purpose, recorded_by)
       VALUES ($1, $2, $3, 0, $4, $5, $6)
       RETURNING *`,
      [movement_date, item_id, quantity, category_id, purpose, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Helper: load item (with lock) and current balance up to a date, excluding one movement if needed
async function getItemAndBalance(client, itemId, upToDate, excludeMovementId = null) {
  const itemRes = await client.query(
    'SELECT id, name, initial_qty FROM items WHERE id = $1 FOR UPDATE',
    [itemId]
  );
  if (itemRes.rows.length === 0) {
    throw new Error('Item not found');
  }

  const item = itemRes.rows[0];
  const initialQty = Number(item.initial_qty) || 0;

  const params = [itemId, upToDate];
  let balanceQuery = `
    SELECT COALESCE(SUM(received - issued), 0) AS movement_delta
    FROM stock_movements
    WHERE item_id = $1
      AND movement_date <= $2
  `;
  if (excludeMovementId != null) {
    params.push(excludeMovementId);
    balanceQuery += ' AND id <> $3';
  }

  const balanceRes = await client.query(balanceQuery, params);
  const movementDelta = Number(balanceRes.rows[0].movement_delta) || 0;
  const available = initialQty + movementDelta;
  return { item, available, initialQty, movementDelta };
}

// ========================
// Issue items (with stock check)
// ========================
router.post('/issue', authMiddleware, async (req, res) => {
  const { item_id, category_id, quantity, movement_date, purpose } = req.body;

  if (!item_id || !category_id || quantity == null || !movement_date) {
    return res.status(400).json({ error: 'item_id, category_id, quantity, and movement_date are required' });
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { item, available } = await getItemAndBalance(client, item_id, movement_date);

    if (qty > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient stock for "${item.name}". Available: ${available}, requested: ${qty}`
      });
    }

    const insertRes = await client.query(
      `INSERT INTO stock_movements 
        (movement_date, item_id, received, issued, category_id, purpose, recorded_by)
       VALUES ($1, $2, 0, $3, $4, $5, $6)
       RETURNING *`,
      [movement_date, item_id, qty, category_id, purpose, req.user.id]
    );

    await client.query('COMMIT');
    res.json(insertRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// ========================
// Update an existing movement (quantity/date/purpose/category)
// ========================
router.put('/movements/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { quantity, movement_date, purpose, category_id } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mvRes = await client.query(
      'SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (mvRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movement not found' });
    }

    const mv = mvRes.rows[0];
    const itemId = mv.item_id;
    const isReceive = Number(mv.received) > 0 && Number(mv.issued) === 0;
    const isIssue = Number(mv.issued) > 0 && Number(mv.received) === 0;

    if (!isReceive && !isIssue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pure receive or issue movements can be edited' });
    }

    const newDate = movement_date || mv.movement_date;
    let newQty;
    if (quantity == null) {
      newQty = isReceive ? Number(mv.received) : Number(mv.issued);
    } else {
      newQty = Number(quantity);
    }

    if (!Number.isFinite(newQty) || newQty <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    // For issues, enforce stock constraint using balance excluding this movement
    if (isIssue) {
      const { item, available } = await getItemAndBalance(client, itemId, newDate, id);
      if (newQty > available) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for "${item.name}" on ${newDate}. Available: ${available}, requested: ${newQty}`
        });
      }
    }

    const newCategoryId = category_id || mv.category_id;
    const newPurpose = purpose !== undefined ? purpose : mv.purpose;

    const receivedVal = isReceive ? newQty : 0;
    const issuedVal = isIssue ? newQty : 0;

    const updateRes = await client.query(
      `UPDATE stock_movements
       SET movement_date = $1,
           received      = $2,
           issued        = $3,
           category_id   = $4,
           purpose       = $5
       WHERE id = $6
       RETURNING *`,
      [newDate, receivedVal, issuedVal, newCategoryId, newPurpose, id]
    );

    await client.query('COMMIT');
    res.json(updateRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// ========================
// Delete a movement (with basic stock safety)
// ========================
router.delete('/movements/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mvRes = await client.query(
      'SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (mvRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movement not found' });
    }

    const mv = mvRes.rows[0];
    const itemId = mv.item_id;
    const isReceive = Number(mv.received) > 0 && Number(mv.issued) === 0;
    const isIssue = Number(mv.issued) > 0 && Number(mv.received) === 0;
    const mvDate = mv.movement_date;

    // If deleting a receive, make sure stock wouldn't have gone negative
    if (isReceive) {
      const { available } = await getItemAndBalance(client, itemId, mvDate, id);
      if (available < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Cannot delete this receive movement because it would make stock negative on that date'
        });
      }
    }

    // Deleting an issue only increases stock, so it's always safe
    await client.query('DELETE FROM stock_movements WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Movement deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// ========================
// List movements (for editing / deleting in UI)
// Optional filters: date, item_id, category_id
// ========================
router.get('/movements', authMiddleware, async (req, res) => {
  try {
    const { date, item_id, category_id } = req.query;
    const params = [];
    let query = `
      SELECT m.*, i.name AS item_name, c.name AS category_name
      FROM stock_movements m
      JOIN items i ON m.item_id = i.id
      JOIN categories c ON m.category_id = c.id
      WHERE 1=1
    `;

    if (date) {
      params.push(date);
      query += ` AND m.movement_date = $${params.length}`;
    }
    if (item_id) {
      params.push(item_id);
      query += ` AND m.item_id = $${params.length}`;
    }
    if (category_id) {
      params.push(category_id);
      query += ` AND m.category_id = $${params.length}`;
    }

    query += ' ORDER BY m.movement_date DESC, i.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
