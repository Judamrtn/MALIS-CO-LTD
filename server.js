const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db'); // your PostgreSQL connection

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users'); // optional admin CRUD
const itemsRoutes = require('./routes/items');
const stockRoutes = require('./routes/stock');
const reportRoutes = require('./routes/reports');
const categoryRoutes = require('./routes/categories');
const workersRoutes = require('./routes/workers');
const attendanceRoutes = require('./routes/attendance');
const payrollRoutes = require('./routes/payroll');
const userReportsRoutes = require('./routes/userReports');


const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/categories', categoryRoutes);


// --------------------
// Seed Default Roles
// --------------------
const seedRoles = async () => {
  try {
    const existing = await pool.query("SELECT * FROM roles");
    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO roles (name) VALUES
        ('admin'),
        ('storekeeper'),
        ('engineer')
      `);
      console.log('Default roles seeded: admin, storekeeper, engineer');
    }
  } catch (err) {
    console.error('Error seeding roles:', err.message);
  }
};

// --------------------
// Seed Default Users (Admin + Engineer viewer)
// --------------------
const createDefaultAdmin = async () => {
  try {
    // Get the admin and engineer role IDs
    const rolesRes = await pool.query(
      "SELECT id, name FROM roles WHERE name IN ('admin','engineer')"
    );
    const adminRole = rolesRes.rows.find(r => r.name === 'admin');
    const engineerRole = rolesRes.rows.find(r => r.name === 'engineer');

    if (!adminRole) {
      console.error('Admin role not found, cannot create default admin');
    } else {
      const adminRoleId = adminRole.id;
      const adminRes = await pool.query(
        "SELECT * FROM users WHERE role_id=$1",
        [adminRoleId]
      );
      if (adminRes.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('EvodeMaliscoltd', 10);
        await pool.query(
          `INSERT INTO users (full_name, username, password_hash, role_id)
           VALUES ($1, $2, $3, $4)`,
          ['Tuyishime Evode', 'evodemrtn@gmail.com', hashedPassword, adminRoleId]
        );
        console.log('Default admin created: evodemrtn@gmail.com / EvodeMaliscoltd');
      }
    }

    if (!engineerRole) {
      console.error('Engineer role not found, cannot create default engineer viewer');
    } else {
      const engineerRoleId = engineerRole.id;
      const engineerUsername = 'info@maliscoltd.com';

      const existingEngineer = await pool.query(
        'SELECT * FROM users WHERE username=$1',
        [engineerUsername]
      );

      if (existingEngineer.rows.length === 0) {
        const engineerPasswordHash = await bcrypt.hash('password', 10);
        await pool.query(
          `INSERT INTO users (full_name, username, password_hash, role_id)
           VALUES ($1, $2, $3, $4)`,
          ['MALISCO View', engineerUsername, engineerPasswordHash, engineerRoleId]
        );
        console.log('Default engineer viewer created: info@maliscoltd.com / password');
      }
    }
  } catch (err) {
    console.error('Error creating default admin:', err.message);
  }
};

// Call seeding functions
seedRoles().then(() => createDefaultAdmin());

// --------------------
// Routes
// --------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/user/reports', userReportsRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payroll', payrollRoutes);

// Health check
app.get('/', (req, res) => res.send('MALIS-CO Inventory Backend Running'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
