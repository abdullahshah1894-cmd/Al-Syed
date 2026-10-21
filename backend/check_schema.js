require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function checkSchema() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sales';
    `);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
checkSchema();
