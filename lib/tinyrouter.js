var path = require('path');
var URL = require('url');
var RoutePattern = require('route-pattern');
var Events = require('tinyevent');

if( !Array.prototype.forEach ) {
  Array.prototype.forEach = function(callback){
    for (var i = 0; i < this.length; i++){
      callback.apply(this, [this[i], i, this]);
    }
  };
}

if( !Array.prototype.indexOf ) {
  Array.prototype.indexOf = function(obj, start) {
    for (var i = (start || 0); i < this.length; i++) {
      if (this[i] == obj) return i;
    }
    return -1;
  };
}

function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
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
  if( endsWith(axis, '/') ) axis = axis.substring(0, axis.length - 1);
  if( endsWith(full, '/') ) full = full.substring(0, full.length - 1);
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
  
  var body = function Router(req, res, onext) {
    var oRequest = req = req || {};
    var oResponse = res = res || {};
    
    // app 인 경우
    if( typeof body.prepare === 'function' ) {
      var prepared = body.prepare(req, res);
      req = prepared.request;
      res = prepared.response;
    }
    
    var oParentURL = req.parentURL = req.parentURL || '';
    var oURL = req.url = req.url || '/';
    var oHref = req.href = req.href || req.url;
    var oParams = req.params = req.params || {};
    var finished = false;
    
    req._routes = req._routes || [];
    req._routes.splice(0, 0, body);
    
    var next = function(err) {
      if( finished ) return console.error('next function twice called.', id, err);
      finished = true;
      boot = false;
      req.parentURL = oParentURL;
      req.url = oURL;
      req.href = oHref;
      req.params = oParams;
      
      if( err ) {
        events.fire('error', {
          router: body,
          href: req.href,
          url: req.url,
          request: req,
          response: res,
          error: err
        }, req._routes);
        
        return onext && onext(err);
      }
      
      events.fire('notfound', {
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
      req.params = mix(oParams, req.params, params);
      req.parentURL = oParentURL;
      req.url = oURL;
      req.boot = boot;
      
      if( !fn ) console.warn('null fn', fn);

      // replace
      if( typeof fn == 'string' ) {
        if( fn[0] == '/' || fn[0] == '.' ) {
          return console.error('[tinyrouter] illegal replace url', fn);
        }
        
        var ohref = req.href;
        req.url = oURL = '/' + fn;
        req.href = path.join(oParentURL || '/', fn);
        
        /*console.debug('replace', {
          ohref: ohref,
          oParentURL: oParentURL,
          to: fn,
          'req.parentURL': req.parentURL,
          'req.href': req.href,
          'req.url': req.url
        });*/
        
        events.fire('replace', {
          router: body,
          previous: ohref,
          href: req.href,
          url: req.url,
          request: req,
          response: res
        }, req._routes);
        
        return forward();
      }
      
      // sub routing
      if( fn.__router__ || fn.Routable ) {
        /*console.info('-------');
        console.info('id', fn.id);
        console.info('routepath', routepath);
        console.info('url', req.url);*/
        
        var div = dividepath(routepath, URL.parse(req.url).pathname);
        if( !div ) return forward();
        req.parentURL = div && div.parent ? path.join(oParentURL, div.parent) : oParentURL;
        req.url = req.url.substring(div && div.parent.length);
        
        //console.log('sub routing', routepath, oURL, '->', req.url);
        
        /*console.info('result parent', req.parentURL);
        console.info('result url', req.url);
        console.info('div', div);
        console.info('-------');*/
      }
      
      events.fire('route', {
        router: body,
        config: route,
        href: req.href,
        url: req.url,
        request: req,
        response: res
      }, req._routes);
      
      route.fn.apply(body, [req, res, forward]);
    };
    forward();
  };
  
  body.Routable = true;
  body.id = id;
  
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
  
  var add = function(route, index) {
    var path = route.path;
    var fn = route.fn;

    //if( !~['function', 'string'].indexOf(typeof fn) ) console.error(fn);

    if( typeof path !== 'string' ) throw new TypeError('path must be a string, but ' + typeof path);
    if( !fn ) fn = route.fn = function(req, res) { res.end(); };
    if( !~['function', 'string'].indexOf(typeof fn) ) throw new TypeError('router must be a function or string, but ' + typeof fn);
    if( fn === body ) throw new Error('cannot add router itself: ' + fn.id);
    
    // adapt each
    if( fn.__router__ || fn.Routable ) {
      fn.connect && fn.connect(body, 'up');
      events.connect(fn, 'down');
      
      fn.fire && fn.fire('add', {
        parent: body
      });
    }
    
    if( typeof index == 'number' && index >= 0 ) routes.splice(index, 0, route);
    else routes.push(route);
    
    events.fire('addchild', {
      child: route
    });
    
    events.fire('subtree', {
      router: body,
      added: route
    }, 'up');

    return body;
  };
  
  var remove = function(route) {
    var fn = route.fn;
    
    if( fn ) {
      fn.disconnect && fn.disconnect(body);
      events.disconnect(route.fn);
      
      fn.fire && fn.fire('remove', {
        parent: body
      });
    }
    
    routes.splice(routes.indexOf(route), 1);
    events.fire('removechild', {
      child: route
    });
    
    events.fire('subtree', {
      router: body,
      removed: route
    }, 'up');
  };
  
  body.use = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    
    return add({
      type: 'use',
      path: path || '/',
      pattern: patternize(path, true),
      fn: fn
    });
  };

  body.before = function(path, fn) {
    return body.use(path, fn, 0);
  };
  
  body.get = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    
    return add({
      type: 'get',
      path: path || '/',
      pattern: patternize(path),
      fn: fn
    });
  };
  
  body.boot = function(path, fn) {
    if( typeof path === 'function' ) fn = path, path = '/';
    
    return add({
      type: 'boot',
      path: path || '/',
      pattern: patternize(path, true),
      fn: fn
    });
  };
  
  body.notfound = function(fn) {
    return body.on('notfound', fn);
  };
  
  body.error = function(fn) {
    return body.on('error', fn);
  };
  
  body.drop = body.remove = function(fn) {
    var dropfns = [];
    routes.forEach(function(route) {
      if( route.fn === fn ) dropfns.push(route);
    });
    
    dropfns.forEach(function(route) {
      remove(route);
    });
    return this;
  };
  
  body.clear = function() {
    routes.forEach(function(route) {
      remove(route);
    });
    
    routes = [];
    events.fire('clear', {}, 'up');
    return this;
  };
  
  var events = Events(body);
  body.on = function(type, fn) {
    events.on.apply(events, arguments);
    return this;
  };
  
  body.once = function(type, fn) {
    events.once.apply(events, arguments);
    return this;
  };
  
  body.off = function(type, fn) {
    events.off.apply(events, arguments);
    return this;
  };
  
  body.fire = function(type, detail, direction, includeself) {
    return events.fire.apply(events, arguments);
  };
  
  body.connect = function(router, direction) {
    events.connect(router, direction);
    return this;
  };
  
  body.disconnect = function(router) {
    events.disconnect(router);
    return this;
  };
  
  body.hasListener = function(type) {
    return events.has.apply(events, arguments);
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