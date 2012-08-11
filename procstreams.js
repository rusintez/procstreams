require('./compat');

var slice = Array.prototype.slice
  , EventEmitter = require('events').EventEmitter
  , spawn = require('child_process').spawn
  , inherits = require('inherits')
  , parse = require('shell-quote').parse
  , utils = require('./protochains')
  , Collector = require('data-collector-stream');

var nop = function() {}

var isProcess = function(cmd) {
  if(cmd === process) { return true; }

  return cmd && typeof cmd.spawn == 'function';
}

var isStream = function(cmd) {
  return cmd && typeof cmd.pipe == 'function' && !procStream.is(cmd);
}

function procPipe(dest, options) {
  options = options || {}

  var source = this
   , dest_stdout
   , dest_stderr;

  if(source._piped) {
    throw new Error('The process has already been piped');
  }
  source._piped = true;

  source.stdout.pipe(dest.stdin);

  // stderr goes to console by default, can be overridden
  if(options.stderr) {
    // Could be an alternate stream to pipe to
    if(typeof options.stderr.pipe == 'function') {
      dest_stderr = options.stderr;
    } else {
      dest_stderr = dest.stderr;
    }

    source.stderr.pipe(dest_stderr);
  }

  dest.emit('pipe', source);

  return dest;
}

// TODO: make this really robust, use optimist parser?
function parseArgs(args) {
  return parse(args.trim());
}

function normalizeArguments(cmd, args, opts, callback) {
  if(args) {
    // options object
    if(typeof args != 'string' && !Array.isArray(args)) {
      opts = args;
      callback = opts;
      args = null;
    }
  }

  if(opts) {
    if(typeof opts == 'function') {
      callback = opts;
      opts = {}
    }
  } else {
    opts = {}
  }
  if(!opts.env) { opts.env = process.env; }

  var parsedArgs
   , val;

  if(typeof cmd == 'string') {
    if(typeof args == 'string') { cmd += ' ' + args; }

    parsedArgs = parseArgs(cmd);
    cmd = parsedArgs.shift();

    if(Array.isArray(args)) {
      parsedArgs = parsedArgs.concat(args);
    }
  } else if(Array.isArray(cmd)) {
    if(typeof args == 'string') { args = parseArgs(args); }

    parsedArgs = cmd.concat(args);
    cmd = parsedArgs.shift();
  } else if(isStream(cmd)) {
    throw new Error('piping procstream to stream is not supported yet');
  } else if(!procStream.is(cmd)) {
    throw new Error('Invalid command');
  }

  return {
    cmd: cmd
    , args: parsedArgs
    , opts: opts
    , callback: callback || nop
  }
}

function collect() {
  var stdout = new Collector()
    , stderr = new Collector();

  this.stdout.pipe(stdout);
  this.stderr.pipe(stderr);

  this.on('exit', function(errCode, signal) {
    var err = this._err || null;

    this.emit('_output', err, stdout.getData(), stderr.getData());
  }.bind(this));
}

function procStream(cmd, args, opts, callback) {
  if(!cmd) { throw new Error('Missing command'); }

  var proc = null, o = null;

  // get the args to create a new procstream
  o = normalizeArguments(cmd, args, opts, callback);
  cmd = o.cmd;
  args = o.args;
  opts = o.opts;
  callback = o.callback;

  // this is a process object
  if(isProcess(cmd)) {
    // this is already a procstream
    if(procStream.is(cmd)) {
      cmd.on('exit', callback);
      return cmd;
    } else {
    // this is a process that needs to be enhanced
      proc = procStream.enhance(cmd);
    }
  } else if(isStream(cmd)) {
    // TODO: do something sensible here
    throw new Error('piping procstream to stream is not supported yet');
  } else {
    proc = spawn(cmd, args, opts);
    proc = procStream.enhance(proc);

    proc._args = o;
  }

  var onExit = function(errCode, signal) {
    var err = this._err || {};

    if(errCode !== 0 || signal) {
      err.code = errCode
      err.signal = signal
      this._err = err;
      this.emit('error', err);
    }
  }
  proc.on('exit', onExit);

  var onStreamError = function(err) {
    this._err = err;
    this.emit('error', err);
  }
  proc.stdout.on('error', onStreamError);
  proc.stderr.on('error', onStreamError);

  if(opts.out === true) {
    proc.out();
  }

  proc.on('exit', callback);

  // TODO: This should be immediate instead of nextTick. But it fails
  // for some reason
  process.nextTick(function() { proc.emit('start'); });
  return proc;
}
procStream.enhance = utils.enhance;
procStream.is = function(proc) {
  if(proc) {
    return typeof proc.spawn == 'function' && typeof proc.pipe == 'function';
  }
  return false;
}
procStream.isProcess = isProcess;
procStream.isStream = isStream;
procStream._prototype = {
  out: function out() {
    if(this._out) { return; }
    this._out = true;

    this.on('start', function() {
      var opts = { end: false }
      this.stdout.pipe(process.stdout, opts);
      this.stderr.pipe(process.stderr, opts);
    });

    return this;
  }
  , data: function data(fn) {
    // data callback suppresses error throwing
    if(this.listeners('error').length === 0) {
      this.on('error', nop);
    }

    this.once('_output', fn);
    this.once('start', collect)

    return this;
  }
  , and: function and() {
    var args = slice.call(arguments)
      , dest = new procPromise(args);

    this.on('exit', function(code, signal) {
      if(code === 0) {
        dest.resolve(args);
      }
    });

    return dest;
  }
  , or: function or() {
    var args = slice.call(arguments)
      , dest = new procPromise(args);

    this.on('exit', function(code, signal) {
      if(code !== 0) {
        dest.resolve();
      }
    });

    return dest;
  }
  , then: function then() {
    var args = slice.call(arguments)
      , dest = new procPromise(args);

    this.on('exit', function(code, signal) {
      dest.resolve();
    });

    return dest;
  }
  , pipe: function() {
    var source = this
      , args = slice.call(arguments)
      , dest = null;

    if(typeof source.resolve === 'function') {
      dest = new procPromise(args)

      var realSource
        , realDest;

      source.on('start', function() {
        // FIXME: This is tricky. When "start" is fired
        // this handler has been moved from the promise
        // to the real proc.
        realSource = this;
        realDest = dest.resolve();
        procPipe.call(realSource, realDest);
      });
    } else {
      dest = procStream.apply(null, args);
      procPipe.call(source, dest);
    }

    return dest;
  }
}
inherits(procStream, EventEmitter, procStream._prototype);

function procPromise(args) {
  this._args = args;
  this._resolved = false;
  this._proc = null;

  this.resolve = procPromise.prototype.resolve.bind(this);
  this.reject = procPromise.prototype.reject.bind(this);
}
procPromise._prototype = {
  resolve: function() {
    if(this._resolved) { return this._proc; }
    this._resolved = true;

    this._proc = procStream.apply(null, this._args);
    this._proc._events = utils.mixin({}, this._events);

    return this._proc;
  }
  , reject: function() {}
}
inherits(procPromise, procStream, procPromise._prototype);

module.exports = procStream;
