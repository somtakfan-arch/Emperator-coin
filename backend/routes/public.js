const express = require('express');
const models = require('../db/models');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();

// No auth required - shows aggregate, non-sensitive economy stats.
router.get(
  '/showcase',
  asyncHandler(async (req, res) => {
    res.json(await models.getPublicShowcase());
  })
);

module.exports = router;
