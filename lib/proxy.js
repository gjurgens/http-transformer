var httpProxy = require('http-proxy'),
    _ = require("underscore");

var Transformer = function(options) {

    var matches = function(str, pattern) {
        var regexp = new RegExp(pattern);
        return regexp.test(str);
    };

    var matchesHeader = function(req, res, name, pattern) {
        return matches(req.get(name), pattern);
    };

    var matchesUrl = function(req, res, pattern) {
        return matches(req.originalUrl, pattern);
    };

    var matchesProtocol = function(req, res, pattern) {
        return matches(req.protocol, pattern);
    };

    var transform = function(str, pattern) {
        var replacedStr = str;
        if(typeof pattern === "string") replacedStr = pattern;
        if(pattern instanceof Array && pattern.length === 2) {
            var regexp = new RegExp(pattern[0]);
            var replaceMask = pattern[1];
            if(str) {
                replacedStr = str.replace(regexp,replaceMask);
            }
        }
        return replacedStr;
    };

    var transformHeader = function(req, res, name, pattern, value) {
        return {
            "name":name,
            "value":transform((value || req.get(name)),pattern)
        };
    };

    var transformUrl = function(req, res, _url, pattern) {
        var url = transform((_url || req.originalUrl), pattern);
        if(typeof url === "string" && url.length > 0 && url[0] != "/") url = "/" + url;
        return url;
    };

    var transformProtocol = function(req, res, protocol, pattern) {
        return transform((protocol || req.protocol), pattern);
    };

    var transformTarget = function(req, res, host, pattern) {
        return transform((host || options.target), pattern);
    };

    this.applies = function(req, res) {
        var applies = true;
        if(options.request) {
            if(options.request.matchers && options.request.matchers instanceof Array) {
                for(var matcherIndex = 0; matcherIndex < options.request.matchers.length && applies; matcherIndex++){
                    var currentMatcher = options.request.matchers[matcherIndex];
                    switch(currentMatcher.type) {
                        case "header":
                            applies = matchesHeader(req, res, currentMatcher.name, currentMatcher.pattern);
                            break;
                        case "url":
                            applies = matchesUrl(req, res, currentMatcher.pattern);
                            break;
                        case "protocol":
                            applies = matchesProtocol(req, res, currentMatcher.pattern);
                            break;
                        default:
                            throw("Type not found in matcher");
                    }
                }
            }
        }
        return applies;
    };

    this.getRequestTransformedHeaders = function(req, res, headers){
        headers = headers || {};
        if(options.request) {
            if(options.request.transformers && options.request.transformers instanceof Array) {
                for(var transformerIndex = 0; transformerIndex < options.request.transformers.length; transformerIndex++){
                    var currentTransformer = options.request.transformers[transformerIndex];
                    switch(currentTransformer.type) {
                        case "header":
                            var header = transformHeader(req, res, currentTransformer.name, currentTransformer.pattern, headers[currentTransformer.name]);
                            headers[header.name] = header.value;
                            break;
                    }
                }
            }
        }
        return headers;
    };

    this.getRequestTransformedTarget = function(req, res, _target){

        var target = {};

        if(options && options.target) {
            target.host = options.target;
        } else {
            if(_target && _target.host) target.host = _target.host;
        }

        if(_target && _target.url) target.url = _target.url;
        if(_target && _target.protcol) target.protcol = _target.protcol;

        if(options.request) {
            if(options.request.transformers && options.request.transformers instanceof Array) {
                for(var transformerIndex = 0; transformerIndex < options.request.transformers.length; transformerIndex++){
                    var currentTransformer = options.request.transformers[transformerIndex];
                    switch(currentTransformer.type) {
                        case "url":
                            target.url = transformUrl(req, res, target.url, currentTransformer.pattern);
                            break;
                        case "protocol":
                            target.protocol = transformProtocol(req, res, target.protcol, currentTransformer.pattern);
                            break;
                        case "target":
                            target.host = transformTarget(req, res, target.host, currentTransformer.pattern);
                            break;
                    }
                }
            }
        }
        return target;
    };

};

module.exports = function(options) {
    if(!options) {
        options = {
            "transformers": [
                {
                    "request":{
                        "matchers":[
                            {
                                "type":"header",
                                "name":"X-Version",
                                "pattern":"test"
                            },
                            {
                                "type":"header",
                                "name":"x-client",
                                "pattern":"browser"
                            },
                            {
                                "type":"url",
                                "pattern":"/test/.*"
                            },
                            {
                                "type":"protocol",
                                "pattern":"http"
                            }
                        ],
                        "transformers":[
                            {
                                "type":"header",
                                "name":"X-Version",
                                "pattern":["(.*)","$1-proxied-___"]
                            },
                            {
                                "type":"header",
                                "name":"X-Client",
                                "pattern":["(.*)","$1-proxied-client"]
                            },
                            {
                                "type":"header",
                                "name":"X-Injected",
                                "pattern":"1234"
                            },
                            {
                                "type":"url",
                                "pattern":["(.*)","$1-proxified"]
                            },
                            {
                                "type":"protocol",
                                "pattern":"http"
                            },
                            {
                                "type":"target",
                                "pattern":["localhost","127.0.0.1"]
                            }
                        ]
                    },
                    "target":"localhost:9000"
                },
                {
                    "request":{
                        "matchers":[
                            {
                                "type":"header",
                                "name":"X-Version",
                                "pattern":".*"
                            }
                        ],
                        "transformers":[
                            {
                                "type":"url",
                                "pattern":["(.*)","$1-proxied2"]
                            },
                            {
                                "type":"header",
                                "name":"X-Version",
                                "pattern":["(.*)(___)","$1replaced"]
                            },
                            {
                                "type":"target",
                                "pattern":["(127\.0\.0\.1)","LOCALHOST"]
                            }
                        ]
                    }
                }
            ]
        }
    }

    console.log("Configuring proxies");

    var transformers = [];
    for (var transformerIndex = 0; transformerIndex < options.transformers.length; transformerIndex++) {
        transformers.push(new Transformer(options.transformers[transformerIndex]));
    }

    var proxy = httpProxy.createProxyServer({});


    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        console.log(options.parsedOptions.target);
        var headers = {};
        for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
            if(transformers[currentTransformerIndex].applies(req,res)) {
                console.log("apply header transformers for: " + currentTransformerIndex);
                _.extend(headers, transformers[currentTransformerIndex].getRequestTransformedHeaders(req, res, headers));
                _.each(headers,function(value,name){
                    proxyReq.setHeader(name, value);
                })
            }
        }


    });

    return function(req, res){
        console.log("HTTP_PROXY");

        var target = {};
        for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
            if(transformers[currentTransformerIndex].applies(req,res)) {
                console.log("apply target transformers for: " + currentTransformerIndex);
                target = transformers[currentTransformerIndex].getRequestTransformedTarget(req, res, target);
            }
        }

        if(!target.host) {
            res.end("No target matched");
            return;
        }

        if(!target.protocol) target.protocol = req.protocol;
        if(!target.url) target.url = req.originalUrl;

        var url = target.protocol + "://" + target.host + target.url;
        console.log("Calling:"  + url);
        proxy.options.parsedOptions = {"target":target};
        return proxy.web(req, res, {"target": url});
    };
};
