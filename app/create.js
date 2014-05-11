var Path = require("path")
var fs = require("fs")
var Q = require("q");
var eco = require("eco")
var prompt = require("prompt")
var Profile = require("../models/profile")
var App = require("../models/app")
var AppInstall = require("./install")
var Log = require("../utils/log")

var promptOptions = {
  public_dev_key: null,
  user_name: null,
  app_name: null,
  size: null,
  static: null
}



function execute(options){
  var deferred = Q.defer();
  promptOptions= options;

  Log.debug("Creating App", "actions/app_create", 33);

  scaffoldSwitch()

  process.nextTick(function(){
    if(promptOptions.static){
      return deferred.resolve();
    }
    else{
      AppInstall(promptOptions)
      .then( deferred.resolve )
      .fail( deferred.reject );
    }
  })

  return deferred.promise;
}

function scaffoldSwitch(){
  Log.debug("Scafolding App Files", "actions/app_create", 74);

  if(promptOptions.static) return scaffoldStatic();
  return scaffold();
}

function scaffold(){
  Log.debug("Creating Folders and Files", "actions/app_create", 76);

  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "app" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "assets" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "app", "assets" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "code" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "start" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "templates" ));

  renderAndSave(Path.join( "app", "code.eco" ) , Path.join( "code" , "index.js" ) )
  
  renderAndSave(Path.join( "app", "desktop.eco" ) , Path.join( "start" , "desktop.js" ) )
  renderAndSave(Path.join( "app", "tablet.eco" ) , Path.join( "start" , "tablet.js" ) )
  renderAndSave(Path.join( "app", "phone.eco" ) , Path.join( "start" , "phone.js" ) )
  
  renderAndSave(Path.join( "app", "layout.eco" ) , Path.join( "templates" , "layout.html" ) )
  renderAndSave(Path.join( "app", "head.eco" ) , Path.join( "templates" , "head.html" ) )

  renderAndSave(Path.join( "app", "3vot.eco" ) , Path.join( "start", "3vot.js" ) )

  renderAndSave(Path.join( "app", "package.eco" ) , Path.join( "package.json" ) )

  return true;
}

function scaffoldStatic(){
  Log.debug("Scaffolding Static App", "actions/app_create", 104);

  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "app" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "assets" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "app", "assets" ));
  fs.mkdirSync( Path.join( process.cwd(), "apps", promptOptions.app_name , "static" ));

  renderAndSave(Path.join( "app", "package.eco" ) , Path.join( "package.json" ) )

  return true;
}

function renderAndSave(templatePath, destPath){
  var templatesPath =  Path.join(Path.dirname(fs.realpathSync(__filename)), '../templates');
  templatePath = fs.readFileSync(  Path.join( templatesPath, templatePath ), "utf-8");

  var templateRender = eco.render( templatePath, promptOptions );
  fs.writeFileSync( Path.join( process.cwd(), "apps", promptOptions.app_name, destPath ), templateRender );
}

module.exports = execute;