const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');


// ============================
// GET all categories (ALL users)
// ============================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM categories ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================
// ADD category (ADMIN only)
// ============================
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id, name',
      [name]
    );

    res.json({ message: 'Category created', category: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================
// UPDATE category (ADMIN only)
// ============================
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await pool.query(
      'UPDATE categories SET name=$1 WHERE id=$2 RETURNING id, name',
      [name, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category updated', category: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================
// DELETE category (ADMIN only)
// ============================
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'DELETE FROM categories WHERE id=$1',
      [id]
    );

    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({
      error: 'Category cannot be deleted if items or stock exist'
    });
  }
});

module.exports = router;
