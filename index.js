
/**
 * Module dependencies.
 */

var Emitter = require('events').EventEmitter;
var Message = require('amp-message');
var fmt = require('util').format;
var parse = require('ms');
var amp = require('amp');

/**
 * Slice ref.
 */

var slice = [].slice;

/**
 * Actor ids.
 */

var ids = 0;

/**
 * Expose `Actor`.
 */

module.exports = Actor;

/**
 * Initialize an actor for the given `Stream`.
 *
 * @param {Stream} stream
 * @api public
 */

function Actor(stream) {
  if (!(this instanceof Actor)) return new Actor(stream);
  this.parser = new amp.Stream;
  this.parser.on('data', this.onmessage.bind(this));
  stream.pipe(this.parser);
  this.stream = stream;
  this.callbacks = {};
  this.ids = 0;
  this.id = ++ids;
  Actor.emit('actor', this);
}

/**
 * Inherit from `Emitter.prototype`.
 */

Actor.prototype.__proto__ = Emitter.prototype;
Actor.__proto__ = Emitter.prototype;

/**
 * Inspect implementation.
 */

Actor.prototype.inspect = function(){
  var cbs = Object.keys(this.callbacks).length;
  return fmt('<Actor id=%d callbacks=%d>', this.id, cbs);
};

/**
 * Handle message.
 */

Actor.prototype.onmessage = function(buf){
  var msg = new Message(buf);
  var args = msg.args;
  var self = this;

  // reply message, invoke
  // the given callback
  if ('_reply_' == args[0]) {
    args.shift();
    var id = args.shift().toString();
    var fn = this.callbacks[id];
    fn.apply(null, args);
    return;
  }

  // request method, pass
  // a trailing callback
  if (isId(args[0])) {
    var id = args.shift();
    args.push(function(){
      var args = ['_reply_', id].concat(slice.call(arguments));
      self.send.apply(self, args);
    });
  }

  this.emit.apply(this, args);
};

/**
 * Send message.
 *
 * TODO: clean up... return a Message etc
 *
 * @param {String} msg
 * @param {Mixed} ...
 * @return {Object}
 * @api public
 */

Actor.prototype.send = function(){
  if ('string' != typeof arguments[0]) throw new Error('missing message name');
  var args = slice.call(arguments);
  var last = args[args.length - 1];
  var timer;

  if ('function' == typeof last) {
    var id = 'i:' + this.ids++;
    var fn = args.pop();
    
    function callback(){
      callback = function(){};
      clearTimeout(timer);
      fn.apply(this, arguments);
    }

    this.callbacks[id] = callback;
    args.unshift(new Buffer(id));
  }

  var msg = new Message(args);
  this.stream.write(msg.toBuffer());

  return {
    timeout: function(ms){
      if ('string' == typeof ms) ms = parse(ms);
      timer = setTimeout(function(){
        var err = new Error('message response timeout exceeded');
        err.timeout = ms;
        callback(err);
      }, ms);
    }
  }
};

/**
 * ID argument.
 */

function isId(arg) {
  return 105 == arg[0] && 58 == arg[1];
}