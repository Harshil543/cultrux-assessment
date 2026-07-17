require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'cultrux',
    password: process.env.DB_PASSWORD || 'cultrux',
    database: process.env.DB_NAME || 'cultrux',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
  },
  test: {
    username: process.env.DB_USER || 'cultrux',
    password: process.env.DB_PASSWORD || 'cultrux',
    database: process.env.DB_NAME || process.env.DB_NAME_TEST || 'cultrux_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false,
  },
};
