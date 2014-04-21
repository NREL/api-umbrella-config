'use strict';

require('./test_helper');

var config = require('../index'),
    path = require('path');

describe('config', function() {
  describe('non-existant file', function() {
    beforeEach(function() {
      this.config = config.load(path.resolve(__dirname, 'config/non-existant.yml'));
    });

    it('returns an empty object', function() {
      this.config.getAll().should.eql({});
    });

    it('returns undefined for non-existant keys', function() {
      should.not.exist(this.config.get('foo'));
    });

    it('returns undefined for non-existant paths', function() {
      should.not.exist(this.config.get('foo.bar'));
    });
  });

  describe('single config file', function() {
    beforeEach(function() {
      this.config = config.load(path.resolve(__dirname, 'config/test.yml'));
    });

    it('fetches values by key', function() {
      this.config.get('port').should.eql(80);
    });

    it('fetches deep values by paths', function() {
      this.config.get('address.state').should.eql('CO');
    });
  });
});
