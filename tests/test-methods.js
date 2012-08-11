var assert = require('assert')
  , fs = require('fs')
  , timer = require(__dirname + '/timers').timer
  , exec = require('child_process').exec
  , $p = require(__dirname + '/..')

var processStdout = ''
process.stdout.on('data', function(d) {
  processStdout += d
})

fs.readFile('tests/fixtures/long.txt', function(err, fileData) {
  assert.ifError(err)

  var t = timer()
  $p('cat tests/fixtures/long.txt')
    .data(function(err, stdout, stderr) {
      t.stop()
      assert.equal(fileData.toString(), stdout.toString())
    })
})

exec('node tests/bin/out-test.js', function(err, output) {
  assert.ifError(err)
  assert.equal('output 3', output.toString().trim())
})
