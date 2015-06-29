var express = require('express');
var router = express.Router();
var pg = require('pg');
var connectionString = 'postgres://postgres:admin@localhost:5432/apptiming';

// Dummy user info
var user = {
  userId: 1,
  appId: 0
};

var sql = {
  indexSelect: "SELECT t.unit,t.app_id,a.name AS app_name,t.average FROM ( " + 
      "SELECT unit_name AS unit,app_id,to_char(avg(EXTRACT(EPOCH FROM (end_time - start_time)) * 1000), 'FM99999')::int AS average FROM timings " +
      "GROUP BY unit_name,app_id ORDER BY app_id,unit_name) t " +
    "INNER JOIN apps a ON a.app_id = t.app_id ORDER BY t.app_id DESC,t.average DESC",
  unitSelect: "SELECT app_id,unit_name,key,start_time,end_time,EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 AS duration FROM timings" +
    " WHERE unit_name = $1 ORDER BY app_id,unit_name,start_time DESC",
  insert: "WITH inserted AS (INSERT INTO timings (app_id, unit_name, key, start_time) VALUES ($1::integer, $2, $3, now()) RETURNING key,start_time) " +
    "SELECT key,start_time FROM inserted",
  update: "WITH updated AS (UPDATE timings SET end_time = now() WHERE app_id = $1::integer and key = $2 RETURNING key,start_time,end_time,(end_time - start_time) as dur_inner ) " + 
    "SELECT key,end_time, start_time, EXTRACT(EPOCH FROM dur_inner) * 1000 AS duration FROM updated",
  notFoundUpdateSql: "WITH updated AS ( " +
      "UPDATE timings SET end_time = now() " + 
      "WHERE key = ( " +
        "SELECT t.key FROM ( " +
          "SELECT COUNT(start_time) AS cnt,unit_name,app_id FROM timings " +
          "WHERE app_id = $1::integer AND unit_name = $2 AND end_time IS NULL GROUP BY unit_name,app_id " +
        ") u " +
        "INNER JOIN timings t ON t.unit_name = u.unit_name AND t.app_id = u.app_id AND t.end_time IS NULL " +
        "WHERE u.cnt = 1 " +
      ") RETURNING key,start_time,end_time,(end_time - start_time) as dur_inner) " +
    "SELECT key,end_time, start_time, EXTRACT(EPOCH FROM dur_inner) * 1000 AS duration FROM updated", 
  select: "SELECT key,start_time FROM timings WHERE app_id = $1::integer AND unit_name = $2 AND end_time IS NULL"
};
var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var createKey = function() {
  var arr = [];
  for( var i=0; i < 8; i++ ) arr[i] = possible.charAt(Math.floor(Math.random() * possible.length))
  return arr.join('');
};
var auth = function(request, response, callback) {
  if(!request.headers.authorization) {
    response.status(401).send('No authentication data found');
    return;
  }
  var apikey = new Buffer(request.headers.authorization, 'base64').toString('utf8').split(' ')[1];
  pg.connect(connectionString, function(connectError, client, done) {
    client.query("SELECT app_id FROM apps WHERE api_key = $1", [apikey], function(error, result) {
      done();
      if(error || result.rows.length == 0) {
        response.status(401).send('Unauthorized');
      } else {
        user.appId = result.rows[0].app_id;
        callback();
      }
    });
  });
};
var handleQueryError = function(error, response, done) {
  console.error('QUERY ERROR',error);
  if(response) response.json({ result: 'failure', errors: [ { code: 'insert_error', description: error.detail } ] });
  if(done) done();
};

// Index
router.get('/', function(req, res, next) {
  user.appId = 2;
  pg.connect(connectionString, function(connectError, client, done) {
    client.query(sql.indexSelect, function(error, result) {
      done();
      var data = [], curApp = null,appIdx = -1;
      for(var i = 0; i < result.rows.length; i++) {
        var row = result.rows[i],
          appName = row.app_name.split(' ')[0];
        if(appName != curApp) {
          curApp = appName;
          appIdx++;
          data[appIdx] = { name: appName, id: row.app_id, units: [] };
        }
        data[appIdx].units.push({ unit: row.unit, average: row.average });
      }
      res.render('index', { 
        title: 'Timings' + (req.params.unitname ? ' for ' + req.params.unitname : ''), 
        data: data, 
        baseurl: 'http://localhost:3000/unit/',
        error: error 
      });
    });
  });
});

// Units 
router.get('/unit/:unit*', function(req, res, next) {
  user.appId = 2;
  pg.connect(connectionString, function(connectError, client, done) {
    client.query(sql.unitSelect, [req.params.unit], function(error, result) {
      done();
      res.render('unit', { 
        title: 'Timings for ' + req.params.unit, 
        data: result ? result.rows : null, 
        error: error 
      });
    });
  });
});

//begins tracking, returns start time
router.post('/api/v1/track/:unitname*?', function(req, res, next) {
  auth(req, res, function() {
    pg.connect(connectionString, function(connectError, client, done) {
      client.query(sql.insert, [user.appId,req.params.unitname,createKey()], function(insertError, result) {
        done();
        if(insertError) {
          handleQueryError(insertError, res);
        } else {
          res.json({ result: 'success', content: { key: result.rows[0].key, start_time: result.rows[0].start_time } });
        }
      });
    });
  });
});

//ends tracking, returns end time and total duration millis
router.post('/api/v1/time/:key*?', function(req, res, next) {
  auth(req, res, function() {
    pg.connect(connectionString, function(connectError, client, done) {
      //update based on key
      client.query(sql.update, [user.appId,req.params.key], function(updateError1, result1) {
        if(updateError1) {
          handleQueryError(updateError1, res, done);
        } else if(result1.rowCount == 0) {
          //treat key as unitname and retry
          client.query(sql.notFoundUpdateSql, [user.appId,req.params.key], function(updateError2, result2) {
            if(updateError2) {
              handleQueryError(updateError2, res, done);
            } else if (result2.rowCount == 0) {
              //could not find single idle timing, inform user with pending keys
              client.query(sql.select, [user.appId, req.params.key], function(selectError, selectResult) {
                done();
                res.json({ 
                  result: 'failure', 
                  errors: [{ 
                    code: selectResult.rowCount == 0 ? "no_timings_found" : "multiple_timings_found", 
                    description: selectResult.rowCount == 0 
                      ? "No timings found for key '" + req.params.key + "'"
                      : "Multiple timings '" + (selectResult.rows.map(function(row) { return row.key; })).join() + "' found for for unit '" + req.params.key + "'"
                   }]
                });
              });
            } else {
              //found a single idle timing by unitname
              var row = result2.rows[0];
              res.json({ result: 'success', content: { start_time: row.start_time, end_time: row.end_time, duration: row.duration } });
              done();
            }
          });
        } else {
          //found timing with key
          var row = result1.rows[0];
          res.json({ result: 'success', content: { start_time: row.start_time, end_time: row.end_time, duration: row.duration } });
          done();
        }
      });
    });
  });
});

module.exports = router;
