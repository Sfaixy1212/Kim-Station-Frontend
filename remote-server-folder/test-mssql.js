import sql from 'mssql';

const config = {
  user: 'sa',
  password: '1RUDfS;1LS!u%CvWm',
  server: '54.155.32.254',
  database: 'KAM',
  options: {
    encrypt: false
  }
};

sql.connect(config).then(pool => {
  return pool.request().query('SELECT 1 as test');
}).then(result => {
  console.log('SUCCESS', result.recordset);
  process.exit(0);
}).catch(err => {
  console.error('ERROR', err);
  process.exit(1);
});
