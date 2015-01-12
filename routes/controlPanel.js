var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('controlPanel', { title: 'http-transformer' });
});

module.exports = router;
