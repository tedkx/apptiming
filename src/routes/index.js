var express = require('express');
var router = express.Router();
var pg = require('pg');
var connectionString = 'postgres://postgres:admin@localhost:5432/apptiming';

// Logged in user info
var appId = 1;


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

//begins tracking, returns start time
router.get('/api/v1/track/:key*?', function(req, res, next) {
  pg.connect(connectionString, function(connectError, client, done) {
    var sql = "WITH inserted AS (INSERT INTO items (app_id, key, start_time) VALUES ($1::integer, $2, now()) RETURNING start_time ) " +
      "SELECT start_time FROM inserted";
    client.query(sql, [appId,req.params.key], function(insertError, result) {
      done();
      if(insertError) {
        console.error('INSERT ERROR',insertError.detail);
        res.json({ result: 'failure', errors: [ { code: 'insert_error', description: insertError.detail } ] });
      } else {
        res.json({ result: 'success', content: { start_time: result.rows[0].start_time } });
      }
    });
  });
});

//ends tracking, returns end time and total duration millis
router.get('/api/v1/time/:key*?', function(req, res, next) {
  pg.connect(connectionString, function(connectError, client, done) {
    var sql = "WITH updated AS (UPDATE items SET end_time = now() WHERE app_id = $1::integer and key = $2 RETURNING start_time,end_time,(end_time - start_time) as dur_inner ) " + 
      "SELECT end_time, start_time, EXTRACT(EPOCH FROM dur_inner) * 1000 AS duration FROM updated";
    client.query(sql, [appId,req.params.key], function(updateError, result) {
      done();
      if(updateError) {
        console.error('UPDATE ERROR',updateError.detail);
        res.json({ result: 'failure', errors: [ { code: 'insert_error', description: updateError.detail } ] });
      } else {
        var row = result.rows[0];
        res.json({ result: 'success', content: { start_time: row.start_time, end_time: row.end_time, duration: row.duration } });
      }
    });
  });
});

module.exports = router;
