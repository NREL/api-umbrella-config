'use strict';

require('../test_helper');

var mongoose = require('mongoose');

mongoose.testConnection = mongoose.createConnection('mongodb://127.0.0.1:27017/api_umbrella_test');

// Drop the mongodb database.
before(function(done) {
  mongoose.testConnection.on('connected', function() {
    // Drop the whole database, since that properly blocks for any active
    // connections. The database will get re-created on demand.
    mongoose.testConnection.db.dropDatabase(function() {
      done();
    });
  });
});

// Close the mongo connection cleanly after each run.
after(function(done) {
  console.info('CLOSING CONNECT');
  mongoose.testConnection.close(function() {
    done();
  });
});
