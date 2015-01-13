var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('request successfully proxied: ' + req.headers['host'] + "|" + req.url + '\n' + JSON.stringify(req.headers, true, 2));
    res.end();
}).listen(9000);