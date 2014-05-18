'use strict';

require('./test_helper');

var config = require('../index'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    os = require('os'),
    path = require('path'),
    sinon = require('sinon'),
    yaml = require('js-yaml');

var ConfigVersion = mongoose.testConnection.model('ConfigVersion');

describe('loader', function() {
  afterEach(function(done) {
    this.loader.close(done);
  });

  afterEach(function() {
    if(fs.existsSync(this.loader.runtimeFile)) {
      fs.unlinkSync(this.loader.runtimeFile);
    }
  });

  describe('multiple config file', function() {
    beforeEach(function(done) {
      config.loader([
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/overrides.yml'),
      ], function(error, loader) {
        this.loader = loader;
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        done();
      }.bind(this));
    });

    it('overrides simple values', function() {
      this.data.port.should.eql(90);
    });

    it('merges objects', function() {
      this.data.address.city.should.eql('Denver');
      this.data.address.state.should.eql('PA');
    });

    it('replaces arrays', function() {
      this.data.ips.should.eql([
        '2.2.2.1',
        '2.2.2.2',
      ]);
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
        config.loader([
          path.resolve(__dirname, 'config/test.yml'),
          path.resolve(__dirname, 'config/with_mongo.yml'),
        ], function(error, loader) {
          this.loader = loader;
          this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
          done();
        }.bind(this));
      }.bind(this));
    });

    it('overrides default config with mongodb data', function() {
      this.data.port.should.eql(71);
    });

    it('polls for mongodb changes', function(done) {
      this.data.port.should.eql(71);
      this.loader.once('reload', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(72);
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
      this.data.port.should.eql(71);
      this.loader.once('reload', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(73);
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
      config.loader([
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
      ], function(error, loader) {
        this.loader = loader;
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        done();
      }.bind(this));
    });

    it('still reads file-based data normally', function() {
      this.data.port.should.eql(99);
    });
  });

  describe('ready event', function() {
    it('doesn\'t fire when no data is present', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader([], spy);

      setTimeout(function() {
        spy.callCount.should.eql(0);
        done();
      }, 50);
    });

    it('fires if no mongodb connection config is present', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader([
        path.resolve(__dirname, 'config/test.yml'),
      ], spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('fires after reading the mongodb data', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader([
        path.resolve(__dirname, 'config/with_mongo.yml'),
      ], spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('fires if an invalid mongodb connection config is given', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader([
        path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
      ], spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });
  });

  describe('reload', function() {
    beforeEach(function(done) {
      this.tempPath = path.resolve(__dirname, 'config/temp.yml');
      if(fs.existsSync(this.tempPath)) {
        fs.unlinkSync(this.tempPath);
      }

      config.loader([
        path.resolve(__dirname, 'config/test.yml'),
        this.tempPath,
      ], function(error, loader) {
        this.loader = loader;
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        done();
      }.bind(this));
    });

    it('reloads file data on command', function(done) {
      this.data.port.should.eql(80);

      this.loader.once('reload', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(85);

        fs.unlinkSync(this.tempPath);
        done();
      }.bind(this));

      fs.writeFileSync(this.tempPath, yaml.dump({ port: 85 }));
      this.loader.reload();
    });

    it('only fires when the config values change', function(done) {
      var spy = sinon.spy();
      this.loader.on('reload', spy);

      fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'NY' } }));
      this.loader.reload();
      fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'NY' } }));
      this.loader.reload();
      fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'PA' } }));
      this.loader.reload();

      setTimeout(function() {
        spy.callCount.should.eql(2);
        done();
      }, 50);
    });
  });

  describe('runtime file', function() {
    beforeEach(function(done) {
      config.loader([
        path.resolve(__dirname, 'config/test.yml'),
      ], function(error, loader) {
        this.loader = loader;
        done();
      }.bind(this));
    });

    it('generates a runtime file in the temp directory by default', function() {
      this.loader.runtimeFile.should.match(new RegExp('^' + os.tmpdir() + '/api-umbrella-runtime.+\\.yml$'));
    });


    it('has owner read-write and group-read permissions', function() {
      /* jshint bitwise: false */
      var stat = fs.statSync(this.loader.runtimeFile);
      var mode = stat.mode & parseInt('07777', 8);
      mode.should.eql(parseInt('0640', 8));
    });

  });

  describe('runtime file - custom path', function() {
    beforeEach(function(done) {
      process.env.API_UMBRELLA_RUNTIME_CONFIG = path.resolve(__dirname, 'config/.runtime.yml');

      config.loader([
        path.resolve(__dirname, 'config/test.yml'),
      ], function(error, loader) {
        this.loader = loader;
        done();
      }.bind(this));
    });

    afterEach(function() {
      delete process.env.API_UMBRELLA_RUNTIME_CONFIG;
    });

    it('allows overriding the runtime path via the API_UMBRELLA_RUNTIME_CONFIG environment variable', function() {
      this.loader.runtimeFile.should.eql(path.resolve(__dirname, 'config/.runtime.yml'));
    });
  });
});
