var httpProxy = require('http-proxy'),
    _ = require("underscore");

var Transformer = function(options) {
    var matches = function(str, pattern) {
        var regexp = new RegExp(pattern);
        return regexp.test(str);
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

    var transformHeader = function(name, value, pattern, modifiedValue) {
        return {
            "name":name,
            "value":transform((modifiedValue || value),pattern)
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



    this.appliesToRequest = function(req, res) {
        var appliedStatus = [];

        if(options.request && options.request.matchers && options.request.matchers instanceof Array) {
            for(var matcherIndex = 0; matcherIndex < options.request.matchers.length; matcherIndex++){
                var rule = {
                    "type":null,
                    "value":null,
                    "pattern":null,
                    "error":null
                };
                var currentMatcher = options.request.matchers[matcherIndex];
                switch(currentMatcher.type) {
                    case "header":
                        rule.type = "header:" + currentMatcher.name;
                        rule.value = req.get(currentMatcher.name);
                        rule.pattern = currentMatcher.pattern;
                        rule.applied = matches(rule.value, rule.pattern);
                        break;
                    case "url":
                        rule.type = "url";
                        rule.value = req.originalUrl;
                        rule.pattern = currentMatcher.pattern;
                        rule.applied = matches(rule.value, rule.pattern);
                        break;
                    case "protocol":
                        rule.type = "protocol"
                        rule.value = req.protocol;
                        rule.pattern = currentMatcher.pattern;
                        rule.applied = matches(rule.value, rule.pattern);
                        break;
                    default:
                        rule.type = currentMatcher.type;
                        rule.applied = false;
                        rule.error = "Type not found in matcher";
                }
                appliedStatus.push(rule);
            }
        }

        return {
            "status":appliedStatus,
            "applyTransformer":_.reduce(appliedStatus, function(prev, rule){
                return (prev && rule.applied);
            },true)
        };
    };

    this.appliesToResponse = function(proxyRes) {
        var appliedStatus = [];

        if(options.response && options.response.matchers && options.response.matchers instanceof Array) {
            for(var matcherIndex = 0; matcherIndex < options.response.matchers.length; matcherIndex++){
                var rule = {
                    "type":null,
                    "value":null,
                    "pattern":null,
                    "error":null
                };
                var currentMatcher = options.response.matchers[matcherIndex];
                switch(currentMatcher.type) {
                    case "header":
                        rule.type = "header:" + currentMatcher.name;
                        rule.value = proxyRes.headers[currentMatcher.name];
                        rule.pattern = currentMatcher.pattern;
                        rule.applied = matches(rule.value, rule.pattern);
                        break;
                    default:
                        rule.type = currentMatcher.type;
                        rule.applied = false;
                        rule.error = "Type not found in matcher";
                }
                appliedStatus.push(rule);
            }
        }

        return {
            "status":appliedStatus,
            "applyTransformer":_.reduce(appliedStatus, function(prev, rule){
                return (prev && rule.applied);
            },true)
        };
    };

    this.getTransformedRequestParams = function(req, res, _transformedParams) {
        var transformedParams = _.extend({
                "headers":{},
                "target":{
                    "protocol":null,
                    "host":null,
                    "url":null
                }
            },
            _transformedParams
        );

        var transformedStatus = [];

        //If transformer has a specific target declared, it tackes precedence over the others
        if(options && options.target) {
            transformedParams.target.host = options.target;
        }

        if(options.request && options.request.transformers && options.request.transformers instanceof Array) {
            for(var transformerIndex = 0; transformerIndex < options.request.transformers.length; transformerIndex++){
                var transform = {
                    "type":null,
                    "original_value":null,
                    "transformed_value":null,
                    "pattern":null,
                    "error":null
                };

                var currentTransformer = options.request.transformers[transformerIndex];
                switch(currentTransformer.type) {
                    case "header":
                        transform.type = "header:" + currentTransformer.name;
                        transform.original_value = transformedParams.headers[currentTransformer.name] || req.get(currentTransformer.name);

                        var header = transformHeader(currentTransformer.name, req.get(currentTransformer.name), currentTransformer.pattern, transformedParams.headers[currentTransformer.name]);
                        transformedParams.headers[header.name] = header.value;

                        transform.transformed_value = header.value;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "url":
                        transform.type = "url";
                        transform.original_value = transformedParams.target.url || req.originalUrl;

                        transformedParams.target.url = transformUrl(req, res, transformedParams.target.url, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.url;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "protocol":
                        transform.type = "protocol";
                        transform.original_value = transformedParams.target.protcol || req.protocol;

                        transformedParams.target.protocol = transformProtocol(req, res, transformedParams.target.protcol, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.protocol;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "target":
                        transform.type = "target";
                        transform.original_value = transformedParams.target.host  || options.target;

                        transformedParams.target.host = transformTarget(req, res, transformedParams.target.host, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.host;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    default:
                        transform.type = currentTransformer.type;
                        transform.error = "Type not found in transformer";
                }
                transformedStatus.push(transform);
            }
        }

        return {
            "status":transformedStatus,
            "transformedParams":transformedParams
        };
    };


    this.getTransformedResponseParams = function(proxyRes, _transformedParams) {
        var transformedParams = _.extend({
                "headers":{}
            },
            _transformedParams
        );

        var transformedStatus = [];

        if(options.response && options.response.transformers && options.response.transformers instanceof Array) {
            for(var transformerIndex = 0; transformerIndex < options.response.transformers.length; transformerIndex++){
                var transform = {
                    "type":null,
                    "original_value":null,
                    "transformed_value":null,
                    "pattern":null,
                    "error":null
                };

                var currentTransformer = options.response.transformers[transformerIndex];
                switch(currentTransformer.type) {
                    case "header":
                        transform.type = "header:" + currentTransformer.name;
                        transform.original_value = transformedParams.headers[currentTransformer.name] || proxyRes[currentTransformer.name];

                        var header = transformHeader(currentTransformer.name, proxyRes[currentTransformer.name], currentTransformer.pattern, transformedParams.headers[currentTransformer.name]);
                        transformedParams.headers[header.name] = header.value;

                        transform.transformed_value = header.value;
                        transform.pattern = currentTransformer.pattern;
                        break;
                    default:
                        transform.type = currentTransformer.type;
                        transform.error = "Type not found in transformer";
                }
                transformedStatus.push(transform);
            }
        }

        return {
            "status":transformedStatus,
            "transformedParams":transformedParams
        };
    }

};

var getTransformedRequestParams = function(req, res, transformers) {

    var transformedRequestParams = {
        "history":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToRequest(req,res);

        var history = {
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            console.log("apply transformers for: " + currentTransformerIndex);
            var transformed = transformers[currentTransformerIndex].getTransformedRequestParams(req,res,transformedRequestParams);
            _.extend(transformedRequestParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedRequestParams.history.push(history);
    }
    console.log("REQUEST: " + JSON.stringify(transformedRequestParams,null,2));
    return transformedRequestParams;
};

var getTransformedResponseParams = function(proxyRes, transformers) {

    var transformedResponseParams = {
        "history":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToResponse(proxyRes);

        var history = {
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            console.log("apply transformers for: " + currentTransformerIndex);
            var transformed = transformers[currentTransformerIndex].getTransformedResponseParams(proxyRes,transformedResponseParams);
            _.extend(transformedResponseParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedResponseParams.history.push(history);
    }
    console.log("RESPONSE: " + JSON.stringify(transformedResponseParams,null,2));
    return transformedResponseParams;
};


module.exports = function(options) {
    if(!options) {
        options = {
            "rules": [
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
                                "pattern":["(test)/(.*)","$1-proxified/$2"]
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
                    "response":{
                        "matchers":[
                            {
                                "type":"header",
                                "name":"content-type",
                                "pattern":"text/plain"
                            }
                        ],
                        "transformers":[
                            {
                                "type":"header",
                                "name":"X-Modified",
                                "pattern":"yes"
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
                                "pattern":["(127\\.0\\.0\\.1)","LOCALHOST"]
                            }
                        ]
                    }
                },
                {
                    "response":{
                        "transformers":[
                            {
                                "type":"header",
                                "name":"X-OnlyResponseTrans",
                                "pattern":"true"
                            }
                        ]
                    }
                }
            ]
        }
    }

    console.log("Configuring proxies");

    var transformers = [];
    for (var transformerIndex = 0; transformerIndex < options.rules.length; transformerIndex++) {
        transformers.push(new Transformer(options.rules[transformerIndex]));
    }

    var proxy = httpProxy.createProxyServer({"prependPath":true});


    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        _.each(req.transformedRequestParams.headers,function(value,name){
            proxyReq.setHeader(name, value);
        });
    });

    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.transformedResponseParams = getTransformedResponseParams(proxyRes, transformers);
        _.extend(proxyRes.headers,res.transformedResponseParams.headers);
    });

    return function(req, res){
        req.url = "/";
        req.transformedRequestParams = getTransformedRequestParams(req, res, transformers);

        if(req.transformedRequestParams.target.host) {
            var url = req.transformedRequestParams.target.protocol + "://" + req.transformedRequestParams.target.host + req.transformedRequestParams.target.url;
            console.log("Calling:"  + url);
            return proxy.web(req, res, {"target": url});
        } else {
            res.end("No target matched");
            return;
        }
    };
};
