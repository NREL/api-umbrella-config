'use strict';

require('./test_helper');

var config = require('../lib/config'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    path = require('path'),
    sinon = require('sinon'),
    yaml = require('js-yaml');

var ConfigVersion = mongoose.testConnection.model('ConfigVersion');

describe('config', function() {
  beforeEach(function() {
    this.config = new config.klass();
  });

  describe('no config data', function() {
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
      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
      ]);
    });

    it('fetches values by key', function() {
      this.config.get('port').should.eql(80);
    });

    it('fetches deep values by paths', function() {
      this.config.get('address.state').should.eql('CO');
    });
  });

  describe('multiple config file', function() {
    beforeEach(function() {
      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/overrides.yml'),
      ]);
    });

    it('overrides simple values', function() {
      this.config.get('port').should.eql(90);
    });

    it('merges objects', function() {
      this.config.get('address.city').should.eql('Denver');
      this.config.get('address.state').should.eql('PA');
    });

    it('replaces arrays', function() {
      this.config.get('ips').should.eql([
        '2.2.2.1',
        '2.2.2.2',
      ]);
    });

    it('updates as files are changed', function() {
      this.config.get('port').should.eql(90);

      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
      ]);

      this.config.get('port').should.eql(80);

      this.config.setFiles([]);

      should.not.exist(this.config.get('port'));

      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/overrides.yml'),
      ]);

      this.config.get('port').should.eql(90);
    });
  });

  describe('mongo config data', function() {
    beforeEach(function(done) {
      ConfigVersion.remove({}, function() {
        done();
      });
    });

    beforeEach(function(done) {
      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 0),
        config: {
          port: 71,
        },
      });

      version.save(function() {
        this.config.setFiles([
          path.resolve(__dirname, 'config/test.yml'),
          path.resolve(__dirname, 'config/with_mongo.yml'),
        ]);

        this.config.ready(done);
      }.bind(this));
    });

    it('overrides default config with mongodb data', function() {
      this.config.get('port').should.eql(71);
    });

    it('polls for mongodb changes', function(done) {
      this.config.get('port').should.eql(71);
      this.config.once('reload', function() {
        this.config.get('port').should.eql(72);
        done();
      }.bind(this));

      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 1),
        config: {
          port: 72,
        },
      });

      version.save();
    });

    it('uses the last config version sorted by time', function(done) {
      this.config.get('port').should.eql(71);
      this.config.once('reload', function() {
        this.config.get('port').should.eql(73);
        done();
      }.bind(this));

      var version1 = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 55),
        config: {
          port: 73,
        },
      });

      var version2 = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 54),
        config: {
          port: 74,
        },
      });


      version1.save();
      version2.save();
    });
  });

  describe('invalid mongo connection', function() {
    beforeEach(function(done) {
      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
      ]);

      this.config.ready(done);
    });

    it('still reads file-based data normally', function() {
      this.config.get('port').should.eql(99);
    });
  });

  describe('runtime config', function() {
    beforeEach(function() {
      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
      ]);
    });

    it('overrides default config with runtime data', function() {
      this.config.setRuntime({
        port: 91,
      });

      this.config.get('port').should.eql(91);
    });

    it('resets runtime back to default config from other sources', function() {
      this.config.resetRuntime();
      this.config.get('port').should.eql(80);
    });

    it('fetches mongo data after connection details are set', function(done) {
      ConfigVersion.remove({}, function() {
        var version = new ConfigVersion({
          version: new Date(2014, 1, 1, 0, 0, 0),
          config: {
            port: 71,
          },
        });

        version.save();
        this.config.ready(function() {
          this.config.get('port').should.eql(80);

          this.config.setRuntime({
            mongodb: {
              url: 'mongodb://127.0.0.1:27017/api_umbrella_test'
            },
          });

          this.config.on('reload', function() {
            this.config.get('port').should.eql(71);
            done();
          }.bind(this));
        }.bind(this));
      }.bind(this));
    });
  });

  describe('ready event', function() {
    it('doesn\'t fire when no data is present', function(done) {
      var spy = sinon.spy();
      this.config.on('ready', spy);

      setTimeout(function() {
        spy.callCount.should.eql(0);
        done();
      }, 50);
    });

    it('fires if no mongodb connection config is present', function(done) {
      var spy = sinon.spy();
      this.config.on('ready', spy);

      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
      ]);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('fires after reading the mongodb data', function(done) {
      var spy = sinon.spy();
      this.config.on('ready', spy);

      this.config.setFiles([
        path.resolve(__dirname, 'config/with_mongo.yml'),
      ]);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('doesn\'t fire on each config change', function(done) {
      var spy = sinon.spy();
      this.config.on('ready', spy);

      this.config.setFiles([
        path.resolve(__dirname, 'config/with_mongo.yml'),
      ]);

      this.config.setRuntime({ port: 81 });
      this.config.setRuntime({ port: 82 });

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('calls the ready callback immediately if already ready', function(done) {
      this.config.once('ready', function() {
        var spy = sinon.spy();
        this.config.ready(spy);
        spy.callCount.should.eql(1);
        done();
      }.bind(this));

      this.config.setFiles([
        path.resolve(__dirname, 'config/with_mongo.yml'),
      ]);
    });

    it('fires if an invalid mongodb connection config is given', function(done) {
      var spy = sinon.spy();
      this.config.on('ready', spy);

      this.config.setFiles([
        path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
      ]);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });
  });

  describe('reload event', function() {
    it('fires whenever the config changes', function() {
      var spy = sinon.spy();
      this.config.on('reload', spy);

      this.config.setRuntime({ port: 81 });
      this.config.setRuntime({ port: 82 });

      spy.callCount.should.eql(2);
    });


    it('only fires when the config values change', function() {
      var spy = sinon.spy();
      this.config.on('reload', spy);

      this.config.setRuntime({ address: { state: 'CO' } });
      this.config.setRuntime({ address: { state: 'CO' } });
      this.config.setRuntime({ address: { state: 'PA' } });

      spy.callCount.should.eql(2);
    });
  });

  describe('reload', function() {
    it('reloads file data on command', function() {
      var tempPath = path.resolve(__dirname, 'config/temp.yml');
      if(fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      this.config.setFiles([
        path.resolve(__dirname, 'config/test.yml'),
        tempPath,
      ]);

      this.config.get('port').should.eql(80);

      fs.writeFileSync(tempPath, yaml.dump({ port: 85 }));
      this.config.get('port').should.eql(80);
      this.config.reload();
      this.config.get('port').should.eql(85);

      fs.writeFileSync(tempPath, yaml.dump({}));
      this.config.get('port').should.eql(85);
      this.config.reload();
      this.config.get('port').should.eql(80);

      fs.unlinkSync(tempPath);
    });
  });

  describe('setFiles', function() {
    it('ignores non-existant files', function() {
      this.config.setFiles([
        path.resolve(__dirname, 'config/nonexistant.yml'),
        path.resolve(__dirname, 'config/test.yml'),
      ]);

      this.config.get('port').should.eql(80);
    });
  });

  it('provides a singleton instance by default', function() {
    var anotherConfig = require('../lib/config');
    config.should.eql(anotherConfig);

    config.setFiles([
      path.resolve(__dirname, 'config/test.yml'),
    ]);

    config.get('port').should.eql(80);
    anotherConfig.get('port').should.eql(80);
  });
});
