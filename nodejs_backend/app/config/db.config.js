module.exports = {
    HOST: "ugmarket.ugent.be",
    USER: "username",
    PASSWORD: "PW",
    DB: "databaseName",
    dialect: "mysql",
    PORT: 13306,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };
