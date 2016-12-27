var path = require('path');
var URL = require('url');
var querystring = require('querystring');
var RoutePattern = require('route-pattern');
var EventObject = require('./events.js');

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
    parent: '/'
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


var routermark = {};
function Router(id) {
  id = id || (Math.random() + '') || 'unknwon';
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
      req.parentApp = oRequest.app;
      req.app = body;
      req.href = oRequest.url;
      req.url = oRequest.url;
      req.parsed = URL.parse(req.href);
      req.hash = req.parsed.hash;
      req.query = querystring.parse(req.parsed.query);
      req.parentURL = '';
      req.params = {};
    }
    
    var oParentURL = req.parentURL = req.parentURL || '';
    var oURL = req.url = req.url || '/';
    var oParams = req.params = req.params || {};
    var finished = false;
    
    var next = function(err) {
      if( finished ) return console.error('next function twice called.', id, err);
      finished = true;
      boot = false;
      req.parentURL = oParentURL;
      req.url = oURL;
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
          request: req,
          response: res
        });
        
        return forward();
      }
      
      // sub routing
      if( fn.__router__ ) {
        /*console.info('-------');
        console.info('id', fn.id);
        console.info('routepath', routepath);
        console.info('url', req.url);*/
        
        var div = dividepath(routepath, URL.parse(req.url).pathname);
        req.parentURL = path.join(oParentURL, div.parent);
        req.url = req.url.substring(div.parent.length);
        
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
      });
      
      route.fn.apply(body, [req, res, forward]);
    };
    forward();
  };
  
  body.id = id;
  body.__router__ = routermark;
  
  var adaptchild = function(fn) {
    if( fn && fn === body ) throw new Error('cannot add router itself: ' + fn.id);
    if( fn.__router__ === routermark ) {
      fn.parent = body;
    }
    return fn;
  };
  
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
  
  body.use = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    if( typeof path !== 'string' ) throw new TypeError('illegal type of path:' + typeof(path));
    
    routes.push({
      type: 'use',
      path: path || '/',
      pattern: patternize(path, true),
      fn: adaptchild(fn)
    });
    return this;
  };
  
  body.get = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    if( typeof path !== 'string' ) throw new TypeError('illegal type of path:' + typeof(path));
    
    routes.push({
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
    
    routes.push({
      type: 'boot',
      path: path || '/',
      pattern: patternize(path, true),
      fn: adaptchild(fn)
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
  
  body.drop = function(fn) {
    var dropfns = [];
    routes.forEach(function(route) {
      if( route.fn === fn ) dropfns.push(route);
    });
    
    dropfns.forEach(function(route) {
      routes.splice(routes.indexOf(route), 1);
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
  
  body.fire = function(type, detail) {
    var typename = (type && type.type) || type;
    if( !listeners[typename] && !listeners['*'] && !(~['route', 'replace'].indexOf(typename) && body.parent) ) return true;
    
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
    
    (listeners['*'] || []).forEach(action, body);
    (listeners[event.type] || []).forEach(action, body);
    
    if( ~['route', 'replace'].indexOf(event.type) && body.parent && body.parent !== body ) {
      body.parent.fire(event);
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