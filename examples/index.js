var tinyrouter = require('../');

var router = tinyrouter()
  .use(function(req, res, next) {
    console.log(1, req.currentURL);
    next();
  })
  .use('/a', tinyrouter()
    .use(function(req, res, next) {
      console.log(2, req.currentURL);
      next();
    })
    .get('/b', function(req, res, next) {
      console.log(3, req.currentURL, req.parentURL, req.url);
      next();
    })
    .get('/c', function(req, res, next) {
      console.log(4, req.currentURL, req.parentURL, req.url);
      next(new Error('test error'));
    })
  )
  .on('error', function(e) {
    console.error(5, e.detail.error.message);
  });

router({ url: '/a/b' }, {}, function(err) {
  console.log('fin /a/b');
});

router({ url: '/a/c' }, {}, function(err) {
  console.log('fin /a/c');
});