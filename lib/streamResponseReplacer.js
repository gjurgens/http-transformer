var helpers = require("./helpers"),
    _ = require("underscore");

var stream = require('stream');
var util = require('util');


module.exports = function(req, res, pattern, _options) {
    var options = {
        "contentTypes":[
            "application/javascript",
            "application/x-javascript",
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
        this.unbuffered = (pattern.length === 3 && pattern[1].match(/^[^m]*m[^m]*$/));

        if(this.unbuffered) console.log("Warning: using unbuffered content replace because of multiline flag in regexp!");

        // init Transform
        Transform.call(this, options);
    };
    util.inherits(Replacer, Transform);

    Replacer.prototype.Replace = function(str, pattern) {
        return helpers.transform(str, pattern);
    };

    Replacer.prototype._transform = function (chunk, enc, cb) {
        if(this.unbuffered) {
            this.bufferRemainder += chunk.toString();
        } else {
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
        }
        cb();
    };

    Replacer.prototype._flush = function(cb){
        this.push(this.Replace(this.bufferRemainder, pattern));
        cb();
    };

    var replacer = new Replacer();

    var _write      = res.write;
    var _end        = res.end;
    var _writeHead  = res.writeHead;

    res.allowedReplace = false;


    res.writeHead = function (code, headers) {
        var contentType = this.getHeader('content-type')?this.getHeader('content-type').split(";")[0]:undefined;
        if ((typeof contentType != 'undefined') && (options.contentTypes.indexOf(contentType) != -1)) {
            res.allowedReplace = true;


            // Strip off the content length since it will change.
            res.removeHeader('Content-Length');
            //res.removeHeader('content-encoding');

            if (headers) {
                delete headers['content-length'];
                //delete headers['content-encoding'];
            }
        } else {
            console.log("content type: '" + (this.getHeader('content-type')?this.getHeader('content-type').split(";")[0]:undefined) + "' is not allowed for content replacements");
        }

        _writeHead.apply(res, arguments);
    };

    res.write = function (data, encoding) {
        // Only run data through replacer if we have an allowed content-type
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