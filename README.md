# tinyrouter

A tiny router base implementation

[![NPM Version][npm-version]][npm-url] [![NPM Downloads][npm-total]][npm-url] [![NPM Downloads][npm-month]][npm-url] [![NPM Downloads][license]][npm-url]

[npm-version]: https://img.shields.io/npm/v/tinyrouter.svg?style=flat
[npm-url]: https://npmjs.org/package/tinyrouter
[npm-total]: https://img.shields.io/npm/dt/tinyrouter.svg?style=flat
[npm-month]: https://img.shields.io/npm/dm/tinyrouter.svg?style=flat
[license]: https://img.shields.io/npm/l/tinyrouter.svg?style=flat


## Install
```sh
$ npm install tinyrouter --save
```

## Usage
```javascript
var tinyrouter = require('tinyrouter');

var router = tinyrouter()
  .use(function(req, res, next) {
    next();
  })
  .get('/path', function(req, res, next) {
    console.log('path', req.parentURL, req.url, req.currentURL);
    next(new Error('error'));
  })
  .on('error', function(e) {
    console.error(e.detail.error);
  });
  
var req = {
  url: '/path'
};
var res = {};
router(req, res, function(err) {
   console.log('finished');
});
```


### License
Licensed under the MIT License.
See [LICENSE](./LICENSE) for the full license text.
