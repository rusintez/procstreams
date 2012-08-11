var assert = require('assert')
  , Stream = require('stream')
  , fs = require('fs')
  , cp = require('child_process')
  , exec = cp.exec
  , spawn = cp.spawn
  , $p = require(__dirname + '/..')

var child = spawn('echo "test"')
  , child2 = exec('echo "test" | cat')

assert.ok($p.isProcess(process))
assert.ok($p.isProcess(child))
assert.ok($p.isProcess(child2))

// a process is not a procstream
assert.ok(!$p.is(process))
assert.ok(!$p.is(child));

var stream = new Stream()
  , file = fs.createReadStream('tests/fixtures/3lines.txt')
assert.ok($p.isStream(process.stdout))
assert.ok($p.isStream(process.stdin))
assert.ok($p.isStream(stream))
assert.ok($p.isStream(file))

// a normal stream is not a procstream
assert.ok(!$p.is(process.stdout))
assert.ok(!$p.is(stream))
assert.ok(!$p.is())
assert.ok(!$p.is(file))

var proc = $p('echo "test"')
  , pstream = $p.enhanceStream(stream)
assert.ok($p.is(proc))
assert.ok($p.is(pstream))
// a procstream is also a process
assert.ok($p.isProcess(proc))
// a procstream is not like a normal stream
assert.ok(!$p.isStream(proc))
assert.ok(!$p.isProcess(pstream))
assert.ok(!$p.isStream(pstream))
