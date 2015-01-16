var fs = require("fs"),
    yaml = require("js-yaml");

exports.matches = function(str, pattern) {
    var regexp = new RegExp(pattern);
    return regexp.test(str);
};

exports.transform = function(str, pattern) {
    var replacedStr = str;
    if(typeof pattern === "string") replacedStr = pattern;
    if(pattern instanceof Array && (pattern.length === 2 || pattern.length === 3)) {
        var regexp,
            replaceMask;
        if(pattern.length === 2) {
            regexp = new RegExp(pattern[0]);
            replaceMask = pattern[1];
        } else {
            regexp = new RegExp(pattern[0],pattern[1]);
            replaceMask = pattern[2];
        }
        if(str) {
            replacedStr = str.replace(regexp,replaceMask);
        }
    }
    return replacedStr;
};

exports.loadRules = function(path, callback, _format) {
    var format = _format || "json";
    var readFile = function(path, callback) {
        console.log("Loading rules file: " + path);
        fs.readFile(path,function(err, data){
            if(err) {
                console.log("Rules file: " + path + ", could not be loaded (" + err + ")");
                callback((new Error("Rules file: " + path + ", could not be loaded (" + err + ")")),{});
            } else {
                if(format === "yaml") {
                    try{
                        callback(
                            null,yaml.load(
                                data,
                                {
                                    "schema":yaml.JSON_SCHEMA
                                }
                            )
                        );
                        console.log("Done loading file: " + path)
                    } catch(err) {
                        console.log("Rules file: " + path + ", could not be loaded. Invalid YAML (" + err + ")");
                        callback((new Error("Rules file: " + path + ", could not be loaded. Invalid YAML (" + err + ")")),{});
                    }
                } else {
                    try{
                        callback(null,JSON.parse(data));
                        console.log("Done loading file: " + path)
                    } catch(err) {
                        console.log("Rules file: " + path + ", could not be loaded. Invalid JSON (" + err + ")");
                        callback((new Error("Rules file: " + path + ", could not be loaded. Invalid JSON (" + err + ")")),{});
                    }
                }
            }
        });
    };

    fs.stat(path, function(err, stat){
        if(err) {
            console.log("Rules file: " + path + ", could not be loaded (" + err + ")");
            callback((new Error("Rules file: " + path + ", could not be loaded (" + err + ")")),{});
        } else {
            if(stat.isFile()) {
                readFile(path,callback);
                fs.watchFile(path, {"persistent":true, "interval":500}, function (curr, prev) {
                    console.log("Rules file: " + path + " was modified.");
                    readFile(path,callback);
                });
            } else {
                console.log("Rules file: " + path + ", is not a file");
                callback((new Error("Rules file: " + path + ", is not a file")),{});
            }
        }
    });
};
