import 'dotenv/config';
import express from 'express';
import { Nango } from '@nangohq/node';

const app = express();
const port = 3000;

const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY
});

app.use(express.static('public'));

app.get('/api/contacts', async (req, res) => {
  try {
    let cursor;
    const contacts = [];

    do {
      const response = await nango.listRecords({
        providerConfigKey: 'hubspot',
        connectionId: process.env.NANGO_CONNECTION_ID,
        model: 'Contact',
        ...(cursor && { cursor })
      });

      contacts.push(...response.records);
      cursor = response.next_cursor;
    } while (cursor);

    res.json({
      count: contacts.length,
      contacts
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

app.listen(port, () => {
  console.log(`Demo app running at http://localhost:${port}`);
});