var path = require('path');
var webpack = require('webpack');

module.exports = {
  entry: path.join(__dirname, 'lib/tinyrouter.js'),
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'tinyrouter.js',
    library: 'tinyrouter',
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  devtool: 'source-map'
};
