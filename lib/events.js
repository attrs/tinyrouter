function EventObject(type, detail, target, cancelable) {
  this.type = type;
  this.detail = detail || {};
  this.target = this.currentTarget = target;
  this.cancelable = cancelable === true ? true : false;
  this.defaultPrevented = false;
  this.stopped = false;
  this.timeStamp = new Date().getTime();
}

EventObject.prototype = {
  preventDefault: function() {
    if( this.cancelable ) this.defaultPrevented = true;
  },
  stopPropagation: function() {
    this.stopped = true;
  },
  stopImmediatePropagation: function() {
    this.stoppedImmediate = true;
  }
};

EventObject.createEvent = function(type, detail, target, cancelable) {
  return new EventObject(type, detail, target, cancelable);
};

module.exports = EventObject;