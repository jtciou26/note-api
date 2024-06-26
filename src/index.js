const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));
const depthLimit = require('graphql-depth-limit');
const { createComplexityLimitRule } = require('graphql-validation-complexity');
require('dotenv').config();

const db = require('./db');
const models = require('./models');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');

// Run our server on a port specified in our .env file or port 4000
const port = process.env.PORT || 4000;
const DB_HOST = process.env.DB_HOST;

const app = express();

db.connect(DB_HOST);

// Security middleware
app.use(helmet());
// CORS middleware
app.use(cors());

app.get('/metadata', async (req, res) => {
  const { url } = req.query;

  try {
    const response = await fetch(url);
    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching metadata.');
  }
});

// get the user info from a JWT
const getUser = token => {
  if (token) {
    try {
      // return the user information from the token
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // if there's a problem with the token, throw an error
      throw new Error('Session invalid');
    }
  }
};
// Apollo Server setup
// updated to include `validationRules`
const server = new ApolloServer({
  typeDefs, // GraphQL schema type definitions
  resolvers, // The corresponding resolvers for schema
  introspection: true, // Enables introspection (querying the schema) in the GraphQL playground
  playground: true, // Enables the GraphQL playground for interactive exploration
  validationRules: [depthLimit(5), createComplexityLimitRule(1000)], // Custom validation rules (such as depth limits and complexity limits)
  context: async ({ req }) => {
    try {
      // get the user token from the headers 從標頭取得使用者權杖
      const token = req.headers.authorization;
      // try to retrieve a user with the token 嘗試使用權杖擷取使用者
      const user = getUser(token);
      // add the db models and the user to the context 將db模型和使用者新增至context
      return { models, user };
    } catch (error) {
      console.error('Error in context function:', error);
      throw error; // rethrow the error to propagate it
    }
  }
});

// Apply the Apollo GraphQL middleware and set the path to /api
server.applyMiddleware({ app, path: '/api' });

app.listen(port, () => console.log(`Server is running on port ${port}`));
