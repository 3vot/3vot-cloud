var eco = require("eco")
var fs = require("fs")
var Path = require("path");
var http = require("http")
var Log = require("./log")

var layout = {};

function html( pck, user_name, head ){
  var templatePath = Path.join(Path.dirname(fs.realpathSync(__filename)), '..' , ".." , 'templates',"app" , "html.eco" );
  var app = fs.readFileSync( templatePath, "utf-8" )
  var result = eco.render(app, { pck: pck, user_name: user_name, head: head } );
  return result;
}

module.exports = {
  html: html
};