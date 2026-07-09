const serverless = require('serverless-http');
const { createApiApp } = require('../../app');

const handler = serverless(createApiApp());

module.exports.handler = async (event, context) => handler(event, context);
