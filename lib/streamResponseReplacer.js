var helpers = require("./helpers"),
    _ = require("underscore");

var stream = require('stream');
var util = require('util');
var zlib = require('zlib');


module.exports = function(req, res, pattern, _options) {

    var options = {
        "contentTypes":[
            "application/javascript",
            "application/json",
            "application/xhtml+xml",
            "application/xml",
            "text/html",
            "text/plain",
            "text/css",
            "text/xml"
        ]
    };
    _.extend(options,_options);

    var Transform = stream.Transform;

    var Replacer = function (options) {
        // allow use without new
        if (!(this instanceof Replacer)) {
            return new Replacer(options);
        }

        this.bufferRemainder = "";

        // init Transform
        Transform.call(this, options);
    };
    util.inherits(Replacer, Transform);

    Replacer.prototype.Replace = function(str, pattern) {
        return helpers.transform(str, pattern);
    };

    Replacer.prototype._transform = function (chunk, enc, cb) {
        var currentLines = (this.bufferRemainder + chunk.toString()).split("\n");
        var partialLine = currentLines.pop();
        if(partialLine != undefined) {
            this.bufferRemainder = partialLine;
        } else {
            this.bufferRemainder = "";
        }
        for(var lineIndex = 0; lineIndex < currentLines.length; lineIndex++) {
            this.push(this.Replace(currentLines[lineIndex], pattern) + "\n");
        }


        cb();
    };

    Replacer.prototype._flush = function(cb){
        this.push(this.Replace(this.bufferRemainder));
        cb();
    };

    var replacer = new Replacer();

    var _write      = res.write;
    var _end        = res.end;
    var _writeHead  = res.writeHead;

    res.allowedReplace = false;

    res.writeHead = function (code, headers) {
        var contentType = this.getHeader('content-type').split(";")[0];
        if ((typeof contentType != 'undefined') && (options.contentTypes.indexOf(contentType) != -1)) {
            res.allowedReplace = true;


            // Strip off the content length since it will change.
            res.removeHeader('Content-Length');
            //res.removeHeader('content-encoding');

            if (headers) {
                delete headers['content-length'];
                //delete headers['content-encoding'];
            }
        }

        _writeHead.apply(res, arguments);
    };

    res.write = function (data, encoding) {
        // Only run data through replacer if we have HTML
        if (res.allowedReplace) {

            replacer.write(data, encoding);
        } else {
            _write.apply(res, arguments);
        }
    };

    replacer.on('data', function (buf) {
        _write.call(res, buf);
    });

    res.end = function (data, encoding) {
        replacer.end(data, encoding);
    };

    replacer.on('end', function () {
        _end.call(res);
    });

}