import express from 'express';
const app = express();
const port = 3003;

// Middleware di base
app.use(express.json());

// Rotta di test
app.get('/test-route', (req, res) => {
  console.log('Test route chiamata');
  res.json({ ok: true, message: 'Test route funzionante' });
});

// Avvia il server
app.listen(port, () => {
  console.log(`Server di test in esecuzione su http://localhost:${port}`);
});
