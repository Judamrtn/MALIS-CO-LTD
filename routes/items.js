const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// List all items
router.get('/', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON i.category_id = c.id ORDER BY i.name');
    res.json(result.rows);
    });

    // Get single item
    router.get('/:id', authMiddleware, async (req, res) => {
      const { id } = req.params;
        const result = await pool.query('SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON i.category_id = c.id WHERE i.id=$1', [id]);
          res.json(result.rows[0]);
          });

          // Add new item (admin only)
          router.post('/', authMiddleware, adminOnly, async (req, res) => {
            const { name, unit, category_id, initial_qty } = req.body;
              try {
                  const result = await pool.query(
                        'INSERT INTO items (name, unit, category_id, initial_qty) VALUES ($1,$2,$3,$4) RETURNING *',
                              [name, unit, category_id, initial_qty]
                                  );
                                      res.json(result.rows[0]);
                                        } catch (err) {
                                            res.status(400).json({ error: err.message });
                                              }
                                              if (initial_qty === undefined || initial_qty === null) {
  return res.status(400).json({
    error: 'Initial quantity is required'
  });
}
                                              });

                                              // Update item
                                              router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
                                                const { id } = req.params;
                                                  const { name, unit, category_id } = req.body;
                                                    const result = await pool.query(
                                                        'UPDATE items SET name=$1, unit=$2, category_id=$3 WHERE id=$4 RETURNING *',
                                                            [name, unit, category_id, id]
                                                              );
                                                                res.json(result.rows[0]);
                                                                });

                                                                // Delete item
                                                                router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
                                                                  const { id } = req.params;
                                                                    try {
                                                                        await pool.query('DELETE FROM items WHERE id=$1', [id]);
                                                                            res.json({ message: 'Deleted' });
                                                                              } catch (err) {
                                                                                  res.status(400).json({ error: err.message });
                                                                                    }
                                                                                    });

                                                                                    module.exports = router;
