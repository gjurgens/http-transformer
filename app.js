var _ = require("underscore");

module.exports = function(_options){
    var express = require('express');
    var path = require('path');
    var logger = require('morgan');

    var controlPanelRoute = require('./routes/controlPanel');

    var app = express();
    var proxy = require("./lib/proxy");

    var options = {
        "port":app.get("port")||3000,
        "ssl_port":app.get("ssl_port")||3001,
        "rules":"rules"
    };
    _.extend(options,_options);

    var requestId = 1;

    app.set("x-powered-by",false);
    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');

    app.use(logger('dev'));

    app.use(function(req, res, next){
        req.id = requestId++;
        next();
    });

    app.use(proxy(options));

    app.use(express.static(path.join(__dirname, 'static')));

    app.use('/', controlPanelRoute);

    /// catch 404 and forward to error handler
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });

    /// handlers
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });

    return app;
};
