var path = require('path');
var URL = require('url');
var RoutePattern = require('route-pattern');
var EventObject = require('./events.js');

if( !Array.prototype.every ) {
  Array.prototype.every = function(callbackfn, thisArg) {
    var T, k;
    
    if (this == null) {
      throw new TypeError('this is null or not defined');
    }
    
    var O = Object(this);
    var len = O.length >>> 0;
    if (typeof callbackfn !== 'function') {
      throw new TypeError();
    }
    if (arguments.length > 1) {
      T = thisArg;
    }
    k = 0;
    while (k < len) {
      var kValue;
      if (k in O) {
        kValue = O[k];
        var testResult = callbackfn.call(T, kValue, k, O);
        if (!testResult) {
          return false;
        }
      }
      k++;
    }
    return true;
  };
}


function patternize(source, ignoresubdir) {
  var pettern = RoutePattern.fromString(source);
  var ap = RoutePattern.fromString(source + '/*after');
  
  return {
    match: function(url) {
      if( source === '/' && ignoresubdir ) return true;
      
      if( pettern.matches(url) ) {
        return pettern.match(url).namedParams;
      } else if( ignoresubdir && ap.matches(url) ) {
        var params = ap.match(url).namedParams;
        delete params.after;
        return params;
      }
      return false;
    },
    matches: function(url) {
      return pattern.matches(url) ? true : (ignoresubdir && ap.matches(url) ? true : false);
    }
  };
}

function dividepath(axis, full) {
  if( axis[0] === '/' ) axis = axis.substring(1);
  if( full[0] === '/' ) full = full.substring(1);
  if( axis.endsWith('/') ) axis = axis.substring(0, axis.length - 1);
  if( full.endsWith('/') ) full = full.substring(0, full.length - 1);
  if( !axis ) return {
    sub: '/' + full,
    parent: ''
  };
  
  while(~axis.indexOf('//')) axis.split('//').join('/');
  while(~full.indexOf('//')) full.split('//').join('/');
  
  axis = axis.split('/');
  full = full.split('/');
  var sub = [], parent = [];
  
  for(var i=0; i < full.length; i++) {
    if( axis[i] && axis[i][0] !== ':' &&  full[i] !== axis[i] ) return null;
    
    if( i >= axis.length ) sub.push(full[i]);
    else parent.push(full[i]);
  }
  
  return {
    parent: '/' + parent.join('/'),
    sub: '/' + sub.join('/')
  };
}

function mix() {
  var result = {};
  [].forEach.call(arguments, function(o) {
    if( o && typeof o === 'object' ) {
      for(var k in o ) result[k] = o[k];
    }
  });
  return result;
}

var seq = 0;
function Router(id) {
  id = id || seq++;
  var boot = true;
  var routes = [];
  var listeners = {};
  
  var body = function Router(req, res, onext) {
    var oRequest = req = req || {};
    var oResponse = res = res || {};
    
    // app 인 경우
    if( typeof body.app === 'function' ) {
      var app = body.app(req, res);
      req = app.request;
      res = app.response;
    }
    
    var oParentURL = req.parentURL = req.parentURL || '';
    var oURL = req.url = req.url || '/';
    var oHref = req.href = req.href || req.url;
    var oParams = req.params = req.params || {};
    var finished = false;
    
    var next = function(err) {
      if( finished ) return console.error('next function twice called.', id, err);
      finished = true;
      boot = false;
      req.parentURL = oParentURL;
      req.url = oURL;
      req.href = oHref;
      req.params = oParams;
      
      if( err ) {
        body.fire('error', {
          router: body,
          href: req.href,
          url: req.url,
          request: req,
          response: res,
          error: err
        });
        
        return onext && onext(err);
      }
      
      body.fire('notfound', {
        router: body,
        href: req.href,
        url: req.url,
        request: req,
        response: res
      });
      
      onext && onext();
    };
    
    var index = 0;
    var forward = function(err) {
      if( err ) return next(err);
      
      var route = routes[index++];
      
      if( !route ) return next();
      if( !boot && route.type === 'boot' ) return forward();
      //console.log(route, boot, route.pattern, route.pattern.match(req.url));
      
      var fn = route.fn;
      var type = route.type;
      var routepath = route.path;
      var params = route.pattern && route.pattern.match(req.url);
      
      if( !params ) return forward();
      req.params = mix(oParams, params);
      
      req.parentURL = oParentURL;
      req.url = oURL;
      req.boot = boot;
      
      // replace
      if( typeof fn == 'string' ) {
        if( fn[0] == '/' || fn[0] == '.' ) {
          return console.error('[tinyrouter] illegal replace url', fn);
        }
        
        var ohref = req.href;
        req.url = oURL = '/' + fn;
        req.href = path.join(oParentURL, fn);
        
        //console.error('replace', ohref, oParentURL, fn, req.href, req.url);
        
        body.fire('replace', {
          previous: ohref,
          href: req.href,
          url: req.url,
          request: req,
          response: res
        }, 'up');
        
        return forward();
      }
      
      // sub routing
      if( fn.__router__ || fn.Routable ) {
        /*console.info('-------');
        console.info('id', fn.id);
        console.info('routepath', routepath);
        console.info('url', req.url);*/
        
        var div = dividepath(routepath, URL.parse(req.url).pathname);
        req.parentURL = path.join(oParentURL, div.parent);
        req.url = req.url.substring(div.parent.length);
        
        //console.log('sub routing', routepath, oURL, '->', req.url);
        
        /*console.info('result parent', req.parentURL);
        console.info('result url', req.url);
        console.info('div', div);
        console.info('-------');*/
      }
      
      body.fire('route', {
        route: route,
        href: req.href,
        url: req.url,
        request: req,
        response: res
      }, 'up');
      
      route.fn.apply(body, [req, res, forward]);
    };
    forward();
  };
  
  body.Routable = true;
  body.id = id;
  body.parent = [];
  body.children = [];
  
  body.exists = function(url) {
    var exists = false;
    routes.forEach(function(route) {
      if( exists ) return;
      if( route.type === 'get' ) {
        var params = route.pattern.match(url);
        if( params ) exists = true;
      } else if( route.type === 'use' ) {
        exists = route.fn.exists(url.substring(route.path.length));
      }
    });
    return exists;
  };
  
  var add = function(route) {
    var fn = route.fn;
    if( fn && fn === body ) throw new Error('cannot add router itself: ' + fn.id);
    
    // adapt each
    if( fn.__router__ || fn.Routable ) {
      fn.parent = fn.parent || [];
      if( !~fn.parent.indexOf(body) ) fn.parent.push(body);
      
      if( !~body.children.indexOf(fn) ) {
        body.children.push(fn);
      } else {
        console.warn('[tinyrouter] already added child', route);
      }
    }
    
    routes.push(route);
    body.fire('add', {
      router: body,
      route: route
    });
  };
  
  body.use = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    if( typeof path !== 'string' ) throw new TypeError('illegal type of path:' + typeof(path));
    
    add({
      type: 'use',
      path: path || '/',
      pattern: patternize(path, true),
      fn: fn
    });
    return this;
  };
  
  body.get = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    if( typeof path !== 'string' ) throw new TypeError('illegal type of path:' + typeof(path));
    
    add({
      type: 'get',
      path: path || '/',
      pattern: patternize(path),
      fn: fn
    });
    return this;
  };
  
  body.boot = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    if( typeof path !== 'string' ) throw new TypeError('illegal type of path:' + typeof(path));
    
    add({
      type: 'boot',
      path: path || '/',
      pattern: patternize(path, true),
      fn: fn
    });
    return this;
  };
  
  body.notfound = function(fn) {
    body.on('notfound', fn);
    return this;
  };
  
  body.error = function(fn) {
    body.on('error', fn);
    return this;
  };
  
  body.drop = body.remove = function(fn) {
    var dropfns = [];
    routes.forEach(function(route) {
      if( route.fn === fn ) dropfns.push(route);
    });
    
    dropfns.forEach(function(route) {
      routes.splice(routes.indexOf(route), 1);
      
      body.fire('remove', {
        router: body,
        route: route
      });
    });
    return this;
  };
  
  body.clear = function() {
    routes = [];
    return this;
  };
  
  body.on = function(type, fn) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(fn);
    
    return this;
  };
  
  body.once = function(type, fn) {
    var wrap = function(e) {
      body.off(type, wrap);
      return fn.call(this, e);
    };
    body.on(type, wrap);
    return this;
  };
  
  body.off = function(type, fn) {
    var fns = listeners[type];
    if( fns )
      for(var i;~(i = fns.indexOf(fn));) fns.splice(i, 1);
    
    return this;
  };
  
  body.fire = function(type, detail, direction, includeself) {
    var typename = (type && type.type) || type;
    
    var event;
    if( typeof type === 'string' ) {
      event = EventObject.createEvent(type, detail, body);
    } else if( type instanceof EventObject ) {
      event = type;
    } else {
      return console.error('illegal arguments, type is must be a string or event', type);
    }
    event.currentTarget = body;
    
    var stopped = false, prevented = false;
    var action = function(listener, scope) {
      if( stopped ) return;
      listener.call(scope, event);
      if( event.defaultPrevented === true ) prevented = true;
      if( event.stoppedImmediate === true ) stopped = true;
    };
    
    if( !direction || includeself !== false ) {
      (listeners['*'] || []).forEach(action, body);
      (listeners[event.type] || []).forEach(action, body);
    }
    
    if( direction === 'up' ) {
      prevented = !body.parent.every(function(parent) {
        if( !parent || !parent.fire ) return true;
        return parent.fire(type, detail, direction);
      });
    } else if( direction === 'down' ) {
      prevented = !body.children.every(function(child) {
        if( !child || !child.fire ) return true;
        return child.fire(type, detail, direction);
      });
    }
    
    return !prevented;
  };
  
  body.hasListener = function(type) {
    if( typeof type === 'function' ) {
      var found = false;
      listeners.forEach(function(fn) {
        if( found ) return;
        if( fn === type ) found = true;
      });
      return found;
    }
    return listeners[type] && listeners[type].length ? true : false;
  };
  
  return body;
};

module.exports = Router;





/*
(function() {
  var defined = '/hello/:planet?foo=:foo&fruit=:fruit#:section';
  var url = '/hello/earth?foo=bar&fruit=apple#chapter2';
  var pattern = RoutePattern.fromString(defined);
  var matches = pattern.matches(url);
  var params = pattern.match(url);
  
  console.log('match', matches);
  console.log(JSON.stringify(params, null, '  '));
  
  console.log('/', subpath('/', '/system/user/list'));
  console.log('/system', subpath('/system', '/system/user/list'));
  console.log('/system/user', subpath('/system/user', '/system/user/list'));
  console.log('/system/user/list', subpath('/system/user/list', '/system/user/list'));
  console.log('/:a', subpath('/:a', '/system/user/list'));
  console.log('/:a/:b', subpath('/:a/:b', '/system/user/list'));
  console.log('/:a/:b/:c', subpath('/:a/:b/:c', '/system/user/list'));

  var p = patternize('/', true);
  console.log('/a/b/c', p.match('/a/b/c'));
});
*/