const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { connectDb } = require('./connect');

createModels(mongoose);

module.exports = { connectDb };
